import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import {
  CANARY_URL,
  FORM_DROPDOWN_CANARY,
  FORM_RADIO_CANARY,
  JPX_SCAN_HEIGHT,
  JPX_SCAN_WIDTH,
  PAGE_SPECS,
  SECRET_SENTINEL,
  appendPdfComment,
  corruptStartXref,
  createActiveFormPdf,
  createJpxScanPdf,
  createOrderedPdf,
  createSolidPng
} from '../fixtures/generate-fixtures.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '../..');
const engine = await loadEngineUnderTest();
const DETACHED_CANARY = 'DETACHED_OBJECT_CANARY_742';

async function loadEngineUnderTest() {
  const sourcePath = path.join(root, 'src/pdf-engine.mjs');
  const pdfLibPath = path.join(root, 'node_modules/pdf-lib/dist/pdf-lib.esm.min.js');
  const corePath = path.join(root, 'src/workbench-core.mjs');
  let source = await readFile(sourcePath, 'utf8');
  source = source
    .replace('../vendor/pdf-lib/pdf-lib.esm.min.js', pathToFileURL(pdfLibPath).href)
    .replace('./workbench-core.mjs', pathToFileURL(corePath).href);
  assert.doesNotMatch(source, /\.\.\/vendor\/pdf-lib/);
  const sourceUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(sourceUrl);
}

async function geometry(bytes) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  return document.getPages().map((page) => ({
    width: page.getWidth(),
    height: page.getHeight(),
    rotation: page.getRotation().angle
  }));
}

async function expandedPdfText(bytes) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const expanded = await document.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
  return Buffer.from(expanded).toString('latin1');
}

function decodedPdfContains(document, value) {
  const needle = String(value).toLocaleLowerCase();
  const hexNeedle = Buffer.from(String(value), 'utf8').toString('hex').toLocaleLowerCase();
  return document.context.enumerateIndirectObjects().some(([_reference, object]) => {
    let text = String(object);
    if (object instanceof PDFRawStream) {
      try { text += ` ${Buffer.from(decodePDFRawStream(object).decode()).toString('latin1')}`; }
      catch (_) { /* unsupported streams cannot prove that a canary remains */ }
    }
    const normalized = text.toLocaleLowerCase();
    return normalized.includes(needle) || normalized.includes(hexNeedle);
  });
}

async function createPageScopedPrivacyPdf() {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.setTitle(SECRET_SENTINEL);
  document.setAuthor(SECRET_SENTINEL);
  document.setCreator(SECRET_SENTINEL);
  document.setProducer(SECRET_SENTINEL);
  document.setCreationDate(new Date('2024-02-03T04:05:06.000Z'));
  document.setModificationDate(new Date('2024-03-04T05:06:07.000Z'));
  const page = document.addPage([300, 400]);
  const metadata = document.context.register(document.context.flateStream(
    new TextEncoder().encode(`<xmp>${SECRET_SENTINEL}</xmp>`),
    { Type: 'Metadata', Subtype: 'XML' }
  ));
  const thumbnail = document.context.register(document.context.flateStream(Uint8Array.of(127), {
    Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8
  }));
  page.node.set(PDFName.of('Metadata'), metadata);
  page.node.set(PDFName.of('PieceInfo'), document.context.obj({ Private: PDFString.of(SECRET_SENTINEL) }));
  page.node.set(PDFName.of('LastModified'), PDFString.of('D:20240304050607Z'));
  page.node.set(PDFName.of('Thumb'), thumbnail);

  const embedded = document.context.register(document.context.flateStream(
    new TextEncoder().encode(`attachment-${SECRET_SENTINEL}`),
    { Type: 'EmbeddedFile', Subtype: 'text#2Fplain' }
  ));
  const fileSpec = document.context.register(document.context.obj({
    Type: 'Filespec', F: PDFString.of('private.txt'), EF: { F: embedded }
  }));
  const fileAttachmentSubtype = document.context.register(PDFName.of('FileAttachment'));
  const attachment = document.context.register(document.context.obj({
    Type: 'Annot', Subtype: fileAttachmentSubtype, Rect: [10, 10, 30, 30], FS: fileSpec,
    Contents: PDFString.of(`attachment-note-${SECRET_SENTINEL}`)
  }));
  const retainedNote = document.context.register(document.context.obj({
    Type: 'Annot', Subtype: 'Square', Rect: [40, 40, 80, 80], T: PDFString.of(SECRET_SENTINEL),
    M: PDFString.of('D:20240304050607Z'), NM: PDFString.of(SECRET_SENTINEL)
  }));
  page.node.set(PDFName.of('AF'), document.context.obj([fileSpec]));
  page.node.set(PDFName.of('Annots'), document.context.obj([attachment, retainedNote]));

  document.context.register(document.context.obj({
    Type: 'Action', S: 'JavaScript', JS: PDFString.of(DETACHED_CANARY)
  }));
  return document.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
}

test('fixture generation is byte-for-byte deterministic', async () => {
  assert.deepEqual(await createOrderedPdf(), await createOrderedPdf());
  assert.deepEqual(await createActiveFormPdf(), await createActiveFormPdf());
  assert.deepEqual(await createJpxScanPdf(), await createJpxScanPdf());
  assert.deepEqual(createSolidPng(3, 2, [10, 20, 30, 255]), createSolidPng(3, 2, [10, 20, 30, 255]));
});

test('synthetic scan uses a real JPEG 2000 image stream', async () => {
  const bytes = await createJpxScanPdf();
  const raw = Buffer.from(bytes).toString('latin1');
  assert.match(raw, /\/Filter \/JPXDecode\b/);
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(document.getPageCount(), 1);
  assert.deepEqual(document.getPage(0).getSize(), { width: JPX_SCAN_WIDTH, height: JPX_SCAN_HEIGHT });
  assert.equal((await engine.inspectPdfStructure(bytes)).pageCount, 1);
});

test('synthetic fixture exposes stable pages, metadata, forms, and active content', async () => {
  const bytes = await createActiveFormPdf();
  const report = await engine.inspectPdfStructure(bytes);
  assert.equal(report.pageCount, 2);
  assert.equal(report.inconsistentPageSizes, true);
  assert.equal(report.metadata.title, SECRET_SENTINEL);
  assert.equal(report.metadata.author, 'Fixture Author');
  assert.deepEqual(report.forms.map((field) => field.name).sort(), ['approved', 'category', 'person.name', 'priority']);
  assert.equal(report.formCount, 4);
  assert.ok(report.annotations >= 1);
  assert.ok(report.externalLinks >= 1);
  assert.ok(report.attachments >= 1);
  assert.equal(report.javascript, true);
  assert.equal(report.automaticActions, true);
  assert.equal(engine.containsRawString(bytes, CANARY_URL), true);
});

test('merge, reorder, extract, and split preserve deterministic page geometry', async () => {
  const first = await createOrderedPdf(PAGE_SPECS.slice(0, 2), { title: 'First source' });
  const secondSpec = [{ label: 'PAGE DELTA', width: 515, height: 615, rotation: 270 }];
  const second = await createOrderedPdf(secondSpec, { title: 'Second source' });
  const progress = [];
  const merged = await engine.mergePdfInputs([
    { name: 'First.pdf', bytes: first, pageIndices: [1, 0] },
    { name: 'Second.pdf', bytes: second }
  ], { bookmarks: true }, (event) => progress.push(event));
  assert.equal(merged.pageCount, 3);
  assert.deepEqual(merged.sources, [{ name: 'First.pdf', page: 1 }, { name: 'Second.pdf', page: 3 }]);
  assert.deepEqual((await geometry(merged.bytes)).map((page) => page.width), [320, 210, 515]);
  const mergedDocument = await PDFDocument.load(merged.bytes, { updateMetadata: false });
  assert.equal(mergedDocument.catalog.has(PDFName.of('Outlines')), true);
  assert.equal((await engine.inspectPdfStructure(merged.bytes)).outlines, 2);
  assert.ok(progress.some((event) => event.phase === 'reading'));
  assert.ok(progress.some((event) => event.phase === 'combining'));

  const ordered = await createOrderedPdf();
  const reordered = await engine.reorderPdf(ordered, [2, 0], { 2: 90 });
  assert.deepEqual(await geometry(reordered), [
    { width: 410, height: 510, rotation: 270 },
    { width: 210, height: 310, rotation: 0 }
  ]);

  const extracted = await engine.extractPdf(ordered, '3, 1-2');
  assert.deepEqual((await geometry(extracted)).map((page) => page.width), [410, 210, 320]);
  const split = await engine.splitPdf(ordered);
  assert.equal(split.length, 3);
  assert.deepEqual(await Promise.all(split.map(async (part) => (await geometry(part.bytes))[0].width)), [210, 320, 410]);
  await assert.rejects(engine.reorderPdf(ordered, [3]), /outside this PDF/i);
});

test('binder drawing safely represents Unicode names while bookmarks retain the original title', async () => {
  const source = await createOrderedPdf(PAGE_SPECS.slice(0, 1));
  const sourceName = 'Résumé \u2014 東京.pdf';
  const merged = await engine.mergePdfInputs([{ name: sourceName, bytes: source }], {
    titlePage: true,
    title: '案件 \u2014 Review binder',
    tableOfContents: true,
    dividers: true,
    sourceLabels: true,
    bookmarks: true
  });
  const document = await PDFDocument.load(merged.bytes, { updateMetadata: false });
  const outlines = document.catalog.lookup(PDFName.of('Outlines'), PDFDict);
  const first = outlines.lookup(PDFName.of('First'), PDFDict);
  assert.equal(first.get(PDFName.of('Title')).decodeText(), sourceName);
  assert.equal((await engine.inspectPdfStructure(merged.bytes)).outlines, 1);
});

test('structured inspection finds catalog actions hidden inside object streams', async () => {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.addPage();
  document.addJavaScript('main', 'app.alert("hidden")');
  document.catalog.set(PDFName.of('OpenAction'), document.context.obj({
    S: 'JavaScript', JS: PDFString.of('app.alert("open")')
  }));
  const bytes = await document.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  const raw = Buffer.from(bytes).toString('latin1');
  assert.doesNotMatch(raw, /\/(?:JavaScript|JS|OpenAction|AA)\b/);
  const report = await engine.inspectPdfStructure(bytes);
  assert.ok(report.rawIndicators.objectStreams >= 1);
  assert.equal(report.javascript, true);
  assert.equal(report.automaticActions, true);
});

test('form values can be filled, reset, and flattened', async () => {
  const bytes = await createActiveFormPdf();
  const filledBytes = await engine.fillAndFlattenPdf(bytes, {
    'person.name': 'Bob Reviewer',
    approved: false,
    category: 'Alpha',
    priority: 'Routine'
  });
  const filled = await PDFDocument.load(filledBytes, { updateMetadata: false });
  const filledForm = filled.getForm();
  assert.equal(filledForm.getTextField('person.name').getText(), 'Bob Reviewer');
  assert.equal(filledForm.getCheckBox('approved').isChecked(), false);
  assert.deepEqual(filledForm.getDropdown('category').getSelected(), ['Alpha']);
  assert.equal(filledForm.getRadioGroup('priority').getSelected(), 'Routine');

  const resetBytes = await engine.fillAndFlattenPdf(bytes, {}, { reset: true });
  const reset = await PDFDocument.load(resetBytes, { updateMetadata: false });
  const resetForm = reset.getForm();
  assert.equal(resetForm.getTextField('person.name').getText() || '', '');
  assert.equal(resetForm.getCheckBox('approved').isChecked(), false);
  assert.deepEqual(resetForm.getDropdown('category').getSelected(), []);
  assert.equal(resetForm.getRadioGroup('priority').getSelected() || '', '');

  const flattenedBytes = await engine.fillAndFlattenPdf(filledBytes, {}, { flatten: true });
  const flattened = await PDFDocument.load(flattenedBytes, { updateMetadata: false });
  assert.equal(flattened.getForm().getFields().length, 0);
  assert.equal(flattened.getPageCount(), 2);
});

test('sanitizer clears dropdown and radio canaries before flattening', async () => {
  const bytes = await createActiveFormPdf();
  const original = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.deepEqual(original.getForm().getDropdown('category').getSelected(), [FORM_DROPDOWN_CANARY]);
  assert.equal(original.getForm().getRadioGroup('priority').getSelected(), FORM_RADIO_CANARY);

  const result = await engine.sanitizePdf(bytes, { formValues: true });
  const cleared = await PDFDocument.load(result.bytes, { updateMetadata: false });
  assert.equal(cleared.getForm().getFields().length, 0);
  assert.equal(decodedPdfContains(cleared, FORM_DROPDOWN_CANARY), false);
  assert.equal(decodedPdfContains(cleared, FORM_RADIO_CANARY), false);
  assert.ok(result.removed.includes('Stored form values'));
  assert.ok(result.removed.some((entry) => entry.startsWith('Form interactivity')));
});

test('every sanitizer mode rebuilds and page-scoped metadata and attachments are physically removed', async () => {
  const bytes = await createPageScopedPrivacyPdf();
  for (const options of [
    { metadata: true },
    { annotations: true },
    { externalLinks: true },
    { attachments: true },
    { javascript: true },
    { actions: true },
    { formValues: true },
    { flattenForms: true }
  ]) {
    assert.equal((await engine.sanitizePdf(bytes, options)).rebuilt, true);
  }

  const result = await engine.sanitizePdf(bytes, { metadata: true, attachments: true });
  const sanitized = await PDFDocument.load(result.bytes, { updateMetadata: false });
  assert.equal(sanitized.context.trailerInfo.Info, undefined);
  assert.equal(sanitized.getTitle(), undefined);
  assert.equal(sanitized.getAuthor(), undefined);
  assert.equal(sanitized.getCreator(), undefined);
  assert.equal(sanitized.getProducer(), undefined);
  assert.equal(sanitized.getCreationDate(), undefined);
  assert.equal(sanitized.getModificationDate(), undefined);
  const page = sanitized.getPage(0);
  for (const key of ['Metadata', 'PieceInfo', 'LastModified', 'Thumb', 'AF']) {
    assert.equal(page.node.has(PDFName.of(key)), false);
  }
  const annotations = page.node.lookup(PDFName.of('Annots'), PDFArray);
  assert.equal(annotations.size(), 1);
  const note = sanitized.context.lookup(annotations.get(0), PDFDict);
  assert.equal(String(note.get(PDFName.of('Subtype'))), '/Square');
  for (const key of ['M', 'CreationDate', 'T', 'Subj', 'NM']) assert.equal(note.has(PDFName.of(key)), false);
  assert.equal((await engine.inspectPdfStructure(result.bytes)).attachments, 0);
  assert.doesNotMatch(await expandedPdfText(result.bytes), new RegExp(SECRET_SENTINEL));
});

test('fresh-context sanitization does not retain detached canary objects', async () => {
  const bytes = await createPageScopedPrivacyPdf();
  assert.equal(engine.containsRawString(bytes, DETACHED_CANARY), true);

  const result = await engine.sanitizePdf(bytes, {});
  const sanitized = await PDFDocument.load(result.bytes, { updateMetadata: false });
  assert.equal(result.rebuilt, true);
  assert.equal(sanitized.getPageCount(), 1);
  assert.equal(sanitized.getTitle(), SECRET_SENTINEL);
  assert.equal(decodedPdfContains(sanitized, DETACHED_CANARY), false);
  assert.equal(engine.containsRawString(result.bytes, DETACHED_CANARY), false);
});

test('maximum sanitization removes metadata, active content, attachments, annotations, links, and form interactivity', async () => {
  const bytes = await createActiveFormPdf();
  const result = await engine.sanitizePdf(bytes, {
    metadata: true,
    javascript: true,
    actions: true,
    attachments: true,
    annotations: true,
    externalLinks: true,
    formValues: true,
    flattenForms: true
  });
  assert.ok(result.removed.includes('Document metadata'));
  assert.ok(result.removed.includes('Automatic actions and document JavaScript'));
  assert.ok(result.removed.includes('Embedded files'));
  assert.ok(result.removed.includes('Comments and annotations'));
  assert.ok(result.removed.includes('External link actions'));

  const sanitized = await PDFDocument.load(result.bytes, { updateMetadata: false });
  assert.equal(sanitized.getTitle() || '', '');
  assert.equal(sanitized.getAuthor() || '', '');
  assert.equal(sanitized.getSubject() || '', '');
  assert.equal(sanitized.getForm().getFields().length, 0);
  assert.equal(sanitized.catalog.has(PDFName.of('OpenAction')), false);
  assert.equal(sanitized.catalog.has(PDFName.of('AA')), false);
  const names = sanitized.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  assert.equal(Boolean(names && names.has(PDFName.of('EmbeddedFiles'))), false);
  assert.equal(Boolean(names && names.has(PDFName.of('JavaScript'))), false);
  sanitized.getPages().forEach((page) => {
    assert.equal(page.node.has(PDFName.of('AA')), false);
    assert.equal(page.node.has(PDFName.of('Annots')), false);
  });
  assert.equal(engine.containsRawString(result.bytes, CANARY_URL), false);
});

test('raster page replacement rebuilds a page without retaining source bytes or metadata', async () => {
  const original = appendPdfComment(await createOrderedPdf([
    { label: SECRET_SENTINEL, width: 260, height: 360, rotation: 0 }
  ], { title: SECRET_SENTINEL }), SECRET_SENTINEL);
  assert.equal(engine.containsRawString(original, SECRET_SENTINEL), true);

  const raster = createSolidPng(3, 2, [10, 20, 30, 255]);
  const output = await engine.replacePagesWithRasters(original, {
    0: { imageBytes: raster, format: 'png', width: 260, height: 360 }
  });
  assert.equal(engine.containsRawString(output, SECRET_SENTINEL), false);
  assert.deepEqual(await geometry(output), [{ width: 260, height: 360, rotation: 0 }]);
  const rebuilt = await PDFDocument.load(output, { updateMetadata: false });
  assert.notEqual(rebuilt.getTitle(), SECRET_SENTINEL);
  assert.equal(rebuilt.getForm().getFields().length, 0);
});

test('inspection, repair, optimization, and blobs return readable outputs', async () => {
  const bytes = await createOrderedPdf();
  const damaged = corruptStartXref(bytes);
  const repaired = await engine.repairPdf(damaged);
  assert.equal((await geometry(repaired)).length, 3);

  const optimized = await engine.optimizePdf(bytes, 'lossless');
  assert.equal(optimized.originalSize, bytes.length);
  assert.equal(optimized.resultSize, optimized.bytes.length);
  assert.equal(optimized.saved, optimized.originalSize - optimized.resultSize);
  assert.equal((await geometry(optimized.bytes)).length, 3);

  const blob = engine.pdfBlob(optimized.bytes);
  assert.equal(blob.type, 'application/pdf');
  assert.equal(blob.size, optimized.bytes.length);
  await assert.rejects(engine.loadPdf(Uint8Array.of(1, 2, 3, 4)), /could not be read/i);
});
