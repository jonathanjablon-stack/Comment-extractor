import {
  PDFArray, PDFDict, PDFDocument, PDFName, PDFString, PDFHexString,
  PDFButton, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFSignature,
  PDFTextField, StandardFonts, TextRenderingMode, degrees, popGraphicsState,
  pushGraphicsState, rgb, setTextRenderingMode
} from '../vendor/pdf-lib/pdf-lib.esm.min.js';
import { humanBytes, normalizeRotation, parsePageRanges, yieldToMain } from './workbench-core.mjs';

const PDF_MIME = 'application/pdf';
const A4 = [595.28, 841.89];
const LETTER = [612, 792];

export async function loadPdf(bytes, options = {}) {
  try {
    const document = await PDFDocument.load(bytes, {
      ignoreEncryption: Boolean(options.ignoreEncryption),
      updateMetadata: false,
      throwOnInvalidObject: false
    });
    if (document.isEncrypted && !options.allowEncryptedInspection) throw new Error('Encrypted PDFs are view-only. PDF editing requires a decrypted copy.');
    return document;
  } catch (error) {
    const message = String(error && error.message || error);
    if (/encrypted|password/i.test(message)) throw new Error('This PDF is password-protected. Entering passwords is not yet supported for this operation.');
    throw new Error(`This PDF could not be read. It may be damaged or use an unsupported security method. (${message})`);
  }
}

export async function pdfBytes(document, options = {}) {
  return document.save({
    useObjectStreams: options.useObjectStreams !== false,
    addDefaultPage: false,
    objectsPerTick: 40,
    updateFieldAppearances: options.updateFieldAppearances !== false
  });
}

export async function mergePdfInputs(inputs, options = {}, progress = () => {}, signal) {
  const sources = [];
  for (let index = 0; index < inputs.length; index += 1) {
    if (signal && signal.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
    const input = inputs[index];
    const source = await loadPdf(input.bytes || await input.file.arrayBuffer());
    const indices = input.pageIndices || Array.from({ length: source.getPageCount() }, (_, page) => page);
    sources.push({ name: input.name || input.file && input.file.name || `Source ${index + 1}`, source, indices });
    progress({ phase: 'reading', current: index + 1, total: inputs.length });
    await yieldToMain(signal);
  }

  const output = await PDFDocument.create();
  const font = await output.embedFont(StandardFonts.Helvetica);
  const bold = await output.embedFont(StandardFonts.HelveticaBold);
  const tocEntries = [];

  if (options.titlePage) {
    const page = output.addPage(LETTER);
    page.drawText(safeStandardFontText(bold, options.title || 'Document Binder', 'Document Binder').slice(0, 120), { x: 54, y: 680, size: 26, font: bold, color: rgb(.12, .22, .4) });
    page.drawText(`Created locally in Comment Master`, { x: 54, y: 645, size: 11, font, color: rgb(.36, .4, .48) });
  }

  if (options.tableOfContents) {
    const estimatedRows = Math.max(1, sources.length);
    const tocPages = Math.ceil(estimatedRows / 34);
    for (let pageIndex = 0; pageIndex < tocPages; pageIndex += 1) output.addPage(LETTER);
  }

  for (let index = 0; index < sources.length; index += 1) {
    const entry = sources[index];
    const bookmarkPage = output.getPageCount() + 1;
    if (options.dividers) {
      const divider = output.addPage(LETTER);
      divider.drawText(safeStandardFontText(bold, entry.name, 'Untitled source').slice(0, 120), { x: 54, y: 650, size: 23, font: bold, color: rgb(.12, .22, .4), maxWidth: 500 });
      divider.drawText(`${entry.indices.length} page${entry.indices.length === 1 ? '' : 's'}`, { x: 54, y: 620, size: 11, font, color: rgb(.4, .44, .52) });
    }
    const start = output.getPageCount() + 1;
    const pages = await output.copyPages(entry.source, entry.indices);
    pages.forEach((page) => {
      output.addPage(page);
      if (options.sourceLabels) {
        page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: 18, color: rgb(.965, .97, .98), opacity: .96 });
        page.drawText(safeStandardFontText(font, entry.name, 'Untitled source').slice(0, 90), { x: 18, y: 5, size: 8, font, color: rgb(.28, .32, .4), maxWidth: Math.max(60, page.getWidth() - 36) });
      }
    });
    tocEntries.push({ name: entry.name, page: start, bookmarkPage: options.dividers ? bookmarkPage : start });
    progress({ phase: 'combining', current: index + 1, total: sources.length });
    await yieldToMain(signal);
  }

  if (options.tableOfContents) drawTableOfContents(output, tocEntries, font, bold, options.titlePage ? 1 : 0);
  if (options.bookmarks) addDocumentBookmarks(output, tocEntries);
  if (options.pageNumbers) addPageNumberMarks(output, font, { startAt: 1 });
  const bytes = await pdfBytes(output);
  return { bytes, pageCount: output.getPageCount(), size: bytes.length, sources: tocEntries.map(({ name, page }) => ({ name, page })) };
}

function addDocumentBookmarks(document, entries) {
  const valid = entries.filter((entry) => Number.isInteger(entry.bookmarkPage) && entry.bookmarkPage >= 1 && entry.bookmarkPage <= document.getPageCount());
  if (!valid.length) return;
  const outlines = document.context.obj({ Type: PDFName.of('Outlines') });
  const outlinesRef = document.context.register(outlines);
  const refs = valid.map(() => document.context.register(document.context.obj({})));
  valid.forEach((entry, index) => {
    const item = document.context.lookup(refs[index], PDFDict);
    item.set(PDFName.of('Title'), PDFHexString.fromText(entry.name));
    item.set(PDFName.of('Parent'), outlinesRef);
    item.set(PDFName.of('Dest'), document.context.obj([document.getPage(entry.bookmarkPage - 1).ref, PDFName.of('Fit')]));
    if (index) item.set(PDFName.of('Prev'), refs[index - 1]);
    if (index < refs.length - 1) item.set(PDFName.of('Next'), refs[index + 1]);
  });
  outlines.set(PDFName.of('First'), refs[0]);
  outlines.set(PDFName.of('Last'), refs[refs.length - 1]);
  outlines.set(PDFName.of('Count'), document.context.obj(refs.length));
  document.catalog.set(PDFName.of('Outlines'), outlinesRef);
  document.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

function drawTableOfContents(document, entries, font, bold, offset) {
  const perPage = 34;
  const pages = document.getPages().slice(offset, offset + Math.ceil(Math.max(1, entries.length) / perPage));
  pages.forEach((page, pageIndex) => {
    page.drawText(pageIndex ? 'Table of Contents, continued' : 'Table of Contents', { x: 54, y: 735, size: 20, font: bold, color: rgb(.12, .22, .4) });
    entries.slice(pageIndex * perPage, (pageIndex + 1) * perPage).forEach((entry, row) => {
      const y = 700 - row * 19;
      page.drawText(safeStandardFontText(font, entry.name, 'Untitled source').slice(0, 72), { x: 54, y, size: 10, font, color: rgb(.18, .22, .3), maxWidth: 445 });
      page.drawText(String(entry.page), { x: 520, y, size: 10, font, color: rgb(.18, .22, .3) });
    });
  });
}

function safeStandardFontText(font, value, fallback = '') {
  const replacements = {
    '\u00a0': ' ', '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-', '\u2212': '-',
    '\u2018': "'", '\u2019': "'", '\u201a': "'", '\u201c': '"', '\u201d': '"', '\u201e': '"',
    '\u2022': '*', '\u2026': '...', '\u2044': '/', '\u2122': '(TM)'
  };
  const normalized = String(value == null ? '' : value).normalize('NFKD');
  let encoded = '';
  for (const character of normalized) {
    if (/\p{M}/u.test(character)) continue;
    const candidate = replacements[character] ?? character;
    for (const part of candidate) {
      if (/\s/u.test(part)) { encoded += ' '; continue; }
      try { font.encodeText(part); encoded += part; }
      catch (_) { encoded += '?'; }
    }
  }
  return encoded.replace(/\s+/g, ' ').trim() || fallback;
}

export async function reorderPdf(bytes, order, rotations = {}, progress = () => {}, signal) {
  const source = await loadPdf(bytes);
  const pageCount = source.getPageCount();
  const indices = order && order.length ? order : Array.from({ length: pageCount }, (_, index) => index);
  indices.forEach((index) => { if (!Number.isInteger(index) || index < 0 || index >= pageCount) throw new Error(`Page ${index + 1} is outside this PDF.`); });
  const isPermutation = indices.length === pageCount && new Set(indices).size === pageCount;
  if (isPermutation) {
    const pages = source.getPages().slice();
    while (source.getPageCount()) source.removePage(0);
    for (let index = 0; index < indices.length; index += 1) {
      const page = pages[indices[index]];
      const rotation = normalizeRotation(Array.isArray(rotations) ? rotations[index] ?? 0 : rotations[indices[index]] ?? 0);
      if (rotation) page.setRotation(degrees(normalizeRotation(page.getRotation().angle + rotation)));
      source.insertPage(index, page);
      progress({ phase: 'pages', current: index + 1, total: indices.length });
      await yieldToMain(signal);
    }
    return pdfBytes(source);
  }
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, indices);
  for (let index = 0; index < pages.length; index += 1) {
    const rotation = normalizeRotation(Array.isArray(rotations) ? rotations[index] ?? 0 : rotations[indices[index]] ?? 0);
    if (rotation) pages[index].setRotation(degrees(normalizeRotation(pages[index].getRotation().angle + rotation)));
    output.addPage(pages[index]);
    progress({ phase: 'pages', current: index + 1, total: indices.length });
    await yieldToMain(signal);
  }
  return pdfBytes(output);
}

export async function extractPdf(bytes, range) {
  const source = await loadPdf(bytes);
  const indices = Array.isArray(range) ? range : parsePageRanges(range, source.getPageCount());
  const output = await PDFDocument.create();
  (await output.copyPages(source, indices)).forEach((page) => output.addPage(page));
  return pdfBytes(output);
}

export async function splitPdf(bytes, mode = 'pages', rangeText = '') {
  const source = await loadPdf(bytes);
  const count = source.getPageCount();
  const groups = mode === 'range' ? [parsePageRanges(rangeText, count)] : Array.from({ length: count }, (_, index) => [index]);
  const outputs = [];
  for (const indices of groups) {
    const output = await PDFDocument.create();
    (await output.copyPages(source, indices)).forEach((page) => output.addPage(page));
    outputs.push({ indices, bytes: await pdfBytes(output) });
  }
  return outputs;
}

export async function addPdfMarks(bytes, options = {}, progress = () => {}, signal) {
  const document = await loadPdf(bytes);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pages = document.getPages();
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (options.pageNumbers) drawPageNumber(page, font, index + Number(options.startAt || 1), options.position || 'bottom-center');
    if (options.header) drawFittedText(page, font, String(options.header), 'header', options);
    if (options.footer) drawFittedText(page, font, String(options.footer), 'footer', options);
    if (options.watermark) drawWatermark(page, font, String(options.watermark), options);
    progress({ phase: 'marking', current: index + 1, total: pages.length });
    await yieldToMain(signal);
  }
  return pdfBytes(document);
}

function addPageNumberMarks(document, font, options) {
  document.getPages().forEach((page, index) => drawPageNumber(page, font, index + Number(options.startAt || 1), options.position || 'bottom-center'));
}

function drawPageNumber(page, font, value, position) {
  const text = String(value);
  const size = 9;
  const width = font.widthOfTextAtSize(text, size);
  const x = position.endsWith('right') ? page.getWidth() - width - 24 : position.endsWith('left') ? 24 : (page.getWidth() - width) / 2;
  const y = position.startsWith('top') ? page.getHeight() - 22 : 14;
  page.drawText(text, { x, y, size, font, color: rgb(.32, .35, .4) });
}

function drawFittedText(page, font, text, location, options) {
  const size = Number(options.markSize || 9);
  const y = location === 'header' ? page.getHeight() - 22 : 14;
  page.drawText(text.slice(0, 180), { x: 24, y, size, font, color: rgb(.3, .33, .38), maxWidth: Math.max(40, page.getWidth() - 48) });
}

function drawWatermark(page, font, text, options) {
  const size = Math.max(18, Math.min(72, Number(options.watermarkSize || 42)));
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text.slice(0, 120), {
    x: Math.max(12, (page.getWidth() - width * .72) / 2), y: page.getHeight() / 2,
    size, font, rotate: degrees(Number(options.watermarkAngle || -35)),
    color: rgb(.35, .4, .5), opacity: Math.max(.04, Math.min(.5, Number(options.watermarkOpacity || .14)))
  });
}

export async function createPdfFromImages(files, options = {}, progress = () => {}, signal) {
  const document = await PDFDocument.create();
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const bytes = new Uint8Array(await file.arrayBuffer());
    let image;
    if (/png/i.test(file.type) || /\.png$/i.test(file.name)) image = await document.embedPng(bytes);
    else if (/jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name)) image = await document.embedJpg(bytes);
    else throw new Error(`${file.name} must be PNG or JPEG for direct image-to-PDF conversion.`);
    const landscape = image.width > image.height;
    const [pageWidth, pageHeight] = landscape ? [LETTER[1], LETTER[0]] : LETTER;
    const page = document.addPage([pageWidth, pageHeight]);
    const margin = Number(options.margin || 24);
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
    progress({ phase: 'images', current: index + 1, total: files.length });
    await yieldToMain(signal);
  }
  return pdfBytes(document);
}

export async function createTextPdf(text, options = {}) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageSize = options.pageSize === 'a4' ? A4 : LETTER;
  const margin = 50;
  const size = Number(options.fontSize || 10.5);
  const lineHeight = size * 1.42;
  const maxWidth = pageSize[0] - margin * 2;
  const paragraphs = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  let page = document.addPage(pageSize);
  let y = pageSize[1] - margin;
  if (options.title) {
    page.drawText(String(options.title).slice(0, 120), { x: margin, y, size: 17, font: bold, color: rgb(.12, .22, .4), maxWidth });
    y -= 29;
  }
  for (const paragraph of paragraphs) {
    const lines = wrapText(paragraph || ' ', font, size, maxWidth);
    for (const line of lines) {
      if (y < margin) { page = document.addPage(pageSize); y = pageSize[1] - margin; }
      page.drawText(line, { x: margin, y, size, font, color: rgb(.12, .14, .18), maxWidth });
      y -= lineHeight;
    }
  }
  return pdfBytes(document);
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

export async function inspectPdfStructure(bytes) {
  const raw = new TextDecoder('latin1').decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  let document;
  try { document = await loadPdf(bytes, { ignoreEncryption: true, allowEncryptedInspection: true }); } catch (_) { document = null; }
  const metadata = document ? readDocumentMetadata(document) : {};
  const fields = document ? inspectFormFields(document) : [];
  const pages = document ? safeDocumentPages(document) : [];
  const pageSizes = pages.map((page) => ({ width: round(page.getWidth()), height: round(page.getHeight()), rotation: normalizeRotation(page.getRotation().angle) }));
  const structured = document ? inspectStructuredPdfContent(document, pages) : {
    annotations: 0, externalLinks: 0, attachments: 0, javascript: false, automaticActions: false, outlines: 0, xfa: false
  };
  const rawEncrypted = /\/Encrypt\b/.test(raw);
  return {
    fileSize: bytes.byteLength || bytes.length || 0,
    fileSizeLabel: humanBytes(bytes.byteLength || bytes.length || 0),
    pageCount: document ? document.getPageCount() : 0,
    pageSizes,
    inconsistentPageSizes: new Set(pageSizes.map((page) => `${page.width}x${page.height}`)).size > 1,
    encrypted: rawEncrypted || Boolean(document && document.isEncrypted), passwordProtected: rawEncrypted || Boolean(document && document.isEncrypted),
    forms: fields, formCount: fields.length,
    annotations: Math.max((raw.match(/\/Annots\b/g) || []).length, structured.annotations),
    externalLinks: Math.max((raw.match(/\/URI\b/g) || []).length, structured.externalLinks),
    attachments: Math.max((raw.match(/\/EmbeddedFile\b/g) || []).length, structured.attachments),
    javascript: /\/(?:JavaScript|JS)\b/.test(raw) || structured.javascript,
    automaticActions: /\/(?:OpenAction|AA)\b/.test(raw) || structured.automaticActions,
    outlines: document ? structured.outlines : (raw.match(/\/Outlines\b/g) || []).length,
    signatures: fields.filter((field) => field.type === 'PDFSignature').length + (raw.match(/\/Type\s*\/Sig\b/g) || []).length,
    xfa: /\/XFA\b/.test(raw) || structured.xfa, metadata,
    rawIndicators: {
      objectStreams: (raw.match(/\/ObjStm\b/g) || []).length,
      images: (raw.match(/\/Subtype\s*\/Image\b/g) || []).length,
      fonts: (raw.match(/\/Type\s*\/Font\b/g) || []).length
    }
  };
}

function safeDocumentPages(document) {
  try { return document.getPages(); } catch (_) { return []; }
}

function readDocumentMetadata(document) {
  const read = (method) => {
    try { return document[method]() || ''; } catch (_) { return ''; }
  };
  return {
    title: read('getTitle'), author: read('getAuthor'), subject: read('getSubject'), keywords: read('getKeywords'),
    creator: read('getCreator'), producer: read('getProducer'),
    creationDate: safeDate(read('getCreationDate')), modificationDate: safeDate(read('getModificationDate'))
  };
}

function inspectStructuredPdfContent(document, pages) {
  const indicators = { annotations: 0, externalLinks: 0, attachments: 0, javascript: false, automaticActions: false, outlines: inspectOutlineCount(document), xfa: false };
  const names = resolvePdfDict(document, document.catalog.get(PDFName.of('Names')));
  if (names && names.has(PDFName.of('EmbeddedFiles'))) indicators.attachments += 1;
  if (names && names.has(PDFName.of('JavaScript'))) indicators.javascript = true;

  const openAction = document.catalog.get(PDFName.of('OpenAction'));
  const catalogActions = document.catalog.get(PDFName.of('AA'));
  if (openAction || catalogActions) indicators.automaticActions = true;
  if (containsJavaScriptAction(document, openAction) || containsJavaScriptAction(document, catalogActions)) indicators.javascript = true;

  const acroForm = resolvePdfDict(document, document.catalog.get(PDFName.of('AcroForm')));
  if (acroForm && acroForm.has(PDFName.of('XFA'))) indicators.xfa = true;

  for (const page of pages) {
    const pageActions = page.node.get(PDFName.of('AA'));
    if (pageActions) {
      indicators.automaticActions = true;
      if (containsJavaScriptAction(document, pageActions)) indicators.javascript = true;
    }
    if (page.node.has(PDFName.of('AF'))) indicators.attachments += 1;
    if (!page.node.has(PDFName.of('Annots'))) continue;
    indicators.annotations += 1;
    const annots = resolvePdfArray(document, page.node.get(PDFName.of('Annots')));
    if (!annots) continue;
    for (const item of annots.asArray()) {
      const annotation = resolvePdfDict(document, item);
      if (!annotation) continue;
      const subtype = resolvedPdfName(document, annotation.get(PDFName.of('Subtype')));
      if (subtype === '/FileAttachment') indicators.attachments += 1;
      if (subtype === '/Link' && annotationHasExternalAction(document, annotation)) indicators.externalLinks += 1;
      const action = annotation.get(PDFName.of('A'));
      const additionalActions = annotation.get(PDFName.of('AA'));
      if (additionalActions) indicators.automaticActions = true;
      if (containsJavaScriptAction(document, action) || containsJavaScriptAction(document, additionalActions)) indicators.javascript = true;
    }
  }
  return indicators;
}

function inspectOutlineCount(document) {
  const outlineValue = document.catalog.get(PDFName.of('Outlines'));
  if (!outlineValue) return 0;
  const outlines = resolvePdfDict(document, outlineValue);
  if (!outlines) return 1;
  const declared = Number(String(resolvePdfObject(document, outlines.get(PDFName.of('Count'))) || ''));
  if (Number.isFinite(declared) && declared !== 0) return Math.abs(Math.trunc(declared));
  let count = 0;
  let current = outlines.get(PDFName.of('First'));
  const seen = new Set();
  while (current && count < 10000) {
    const item = resolvePdfDict(document, current);
    if (!item || seen.has(item)) break;
    seen.add(item);
    count += 1;
    current = item.get(PDFName.of('Next'));
  }
  return count;
}

function resolvePdfObject(document, value) {
  if (!value) return undefined;
  try { return document.context.lookup(value); } catch (_) { return undefined; }
}

function resolvePdfDict(document, value) {
  const resolved = resolvePdfObject(document, value);
  return resolved instanceof PDFDict ? resolved : undefined;
}

function resolvePdfArray(document, value) {
  const resolved = resolvePdfObject(document, value);
  return resolved instanceof PDFArray ? resolved : undefined;
}

function resolvedPdfName(document, value) {
  return String(resolvePdfObject(document, value) || '');
}

function containsJavaScriptAction(document, value, state = { remaining: 256, seen: new Set() }) {
  if (!value || state.remaining <= 0) return false;
  const resolved = resolvePdfObject(document, value);
  if (!resolved || state.seen.has(resolved)) return false;
  state.remaining -= 1;
  state.seen.add(resolved);
  if (String(resolved) === '/JavaScript') return true;
  if (resolved instanceof PDFArray) return resolved.asArray().some((item) => containsJavaScriptAction(document, item, state));
  if (!(resolved instanceof PDFDict)) return false;
  if (resolvedPdfName(document, resolved.get(PDFName.of('S'))) === '/JavaScript' || resolved.has(PDFName.of('JS'))) return true;
  return Array.from(resolved.keys()).some((key) => containsJavaScriptAction(document, resolved.get(key), state));
}

function annotationHasExternalAction(document, annotation) {
  if (annotation.has(PDFName.of('URI'))) return true;
  const action = resolvePdfDict(document, annotation.get(PDFName.of('A')));
  if (!action) return false;
  const subtype = resolvedPdfName(document, action.get(PDFName.of('S')));
  return new Set(['/URI', '/GoToR', '/Launch', '/SubmitForm', '/ImportData']).has(subtype) || action.has(PDFName.of('URI'));
}

function safeDate(value) {
  try { return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : ''; } catch (_) { return ''; }
}

function round(value) { return Math.round(Number(value) * 100) / 100; }

export function inspectFormFields(document) {
  try {
    return document.getForm().getFields().map((field) => ({ name: field.getName(), type: formFieldType(field), value: readFieldValue(field) }));
  } catch (_) { return []; }
}

function formFieldType(field) {
  if (field instanceof PDFTextField) return 'PDFTextField';
  if (field instanceof PDFCheckBox) return 'PDFCheckBox';
  if (field instanceof PDFRadioGroup) return 'PDFRadioGroup';
  if (field instanceof PDFDropdown) return 'PDFDropdown';
  if (field instanceof PDFOptionList) return 'PDFOptionList';
  if (field instanceof PDFButton) return 'PDFButton';
  if (field instanceof PDFSignature) return 'PDFSignature';
  return 'PDFField';
}

function readFieldValue(field) {
  try {
    if (typeof field.getText === 'function') return field.getText() || '';
    if (typeof field.isChecked === 'function') return field.isChecked() ? 'Checked' : 'Not checked';
    if (typeof field.getSelected === 'function') {
      const selected = field.getSelected();
      return Array.isArray(selected) ? selected.join(', ') : selected || '';
    }
  } catch (_) { /* field remains inspectable */ }
  return '';
}

export async function fillAndFlattenPdf(bytes, values = {}, options = {}) {
  const document = await loadPdf(bytes);
  const form = document.getForm();
  if (options.reset) {
    form.getFields().forEach((field) => {
      try {
        if (typeof field.clear === 'function') field.clear();
        else if (field instanceof PDFTextField) field.setText('');
        else if (field instanceof PDFCheckBox) field.uncheck();
      } catch (_) {}
    });
  }
  for (const field of form.getFields()) {
    const name = field.getName();
    if (options.reset || !Object.hasOwn(values, name)) continue;
    const value = values[name];
    try {
      if (field instanceof PDFTextField) field.setText(String(value == null ? '' : value));
      else if (field instanceof PDFCheckBox) {
        if (value === true) field.check();
        else if (value === false) field.uncheck();
        else throw new Error('Checkbox values must be true or false.');
      } else if (field instanceof PDFRadioGroup) value == null ? field.clear() : field.select(String(value));
      else if (field instanceof PDFDropdown || field instanceof PDFOptionList) value == null ? field.clear() : field.select(Array.isArray(value) ? value.map(String) : String(value));
    } catch (error) {
      throw new Error(`The form field “${name}” could not be updated. (${error.message})`);
    }
  }
  if (options.flatten) form.flatten({ updateFieldAppearances: true });
  return pdfBytes(document);
}

export async function sanitizePdf(bytes, options = {}) {
  const document = await loadPdf(bytes);
  const summary = [];
  const preservedMetadata = options.metadata ? null : captureDocumentMetadata(document);
  if (options.metadata) {
    document.catalog.delete(PDFName.of('Metadata'));
    const trailer = document.context.trailerInfo;
    if (trailer) trailer.Info = undefined;
    summary.push('Document metadata');
  }
  if (options.javascript || options.actions) {
    document.catalog.delete(PDFName.of('OpenAction'));
    document.catalog.delete(PDFName.of('AA'));
    summary.push('Automatic actions and document JavaScript');
  }
  if (options.attachments || options.javascript) {
    const names = resolvePdfDict(document, document.catalog.get(PDFName.of('Names')));
    if (names) {
      if (options.attachments) names.delete(PDFName.of('EmbeddedFiles'));
      if (options.javascript) names.delete(PDFName.of('JavaScript'));
      if (!Array.from(names.keys()).length) document.catalog.delete(PDFName.of('Names'));
    }
    if (options.attachments) summary.push('Embedded files');
  }
  const form = document.getForm();
  const fields = form.getFields();
  if (options.formValues) {
    for (const field of fields) {
      try { clearPdfFormField(field); }
      catch (error) { throw new Error(`The stored value in form field “${field.getName()}” could not be removed. (${error.message})`); }
    }
    summary.push('Stored form values');
  }
  if (fields.length) {
    try {
      form.flatten({ updateFieldAppearances: true });
    } catch (error) {
      throw new Error(`Form appearances could not be preserved during secure rebuilding. (${error.message})`);
    }
    summary.push(options.flattenForms ? 'Form interactivity' : 'Form interactivity, required for a fresh document rebuild');
  }

  document.getPages().forEach((page) => sanitizePage(document, page, options));
  if (options.annotations) summary.push('Comments and annotations');
  if (options.externalLinks) summary.push('External link actions');

  const clean = await PDFDocument.create({ updateMetadata: false });
  const pages = await clean.copyPages(document, document.getPageIndices());
  pages.forEach((page) => clean.addPage(page));
  if (preservedMetadata) applyDocumentMetadata(clean, preservedMetadata);
  summary.push('Unreferenced objects through a fresh document rebuild');
  return { bytes: await pdfBytes(clean), removed: summary, rebuilt: true };
}

function captureDocumentMetadata(document) {
  const read = (method) => {
    try { return document[method](); } catch (_) { return undefined; }
  };
  return {
    title: read('getTitle'), author: read('getAuthor'), subject: read('getSubject'), keywords: read('getKeywords'),
    creator: read('getCreator'), producer: read('getProducer'),
    creationDate: read('getCreationDate'), modificationDate: read('getModificationDate')
  };
}

function applyDocumentMetadata(document, metadata) {
  if (metadata.title) document.setTitle(metadata.title);
  if (metadata.author) document.setAuthor(metadata.author);
  if (metadata.subject) document.setSubject(metadata.subject);
  if (metadata.keywords) {
    const keywords = Array.isArray(metadata.keywords) ? metadata.keywords : String(metadata.keywords).split(/[,;]/).map((value) => value.trim()).filter(Boolean);
    if (keywords.length) document.setKeywords(keywords);
  }
  if (metadata.creator) document.setCreator(metadata.creator);
  if (metadata.producer) document.setProducer(metadata.producer);
  if (metadata.creationDate instanceof Date && Number.isFinite(metadata.creationDate.getTime())) document.setCreationDate(metadata.creationDate);
  if (metadata.modificationDate instanceof Date && Number.isFinite(metadata.modificationDate.getTime())) document.setModificationDate(metadata.modificationDate);
}

function clearPdfFormField(field) {
  if (field instanceof PDFTextField) field.setText('');
  else if (field instanceof PDFCheckBox) field.uncheck();
  else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) field.clear();
}

function sanitizePage(document, page, options) {
  const stripActions = options.actions || options.javascript;
  if (options.metadata) {
    for (const key of ['Metadata', 'PieceInfo', 'LastModified', 'Thumb']) page.node.delete(PDFName.of(key));
  }
  if (options.attachments) page.node.delete(PDFName.of('AF'));
  if (stripActions) page.node.delete(PDFName.of('AA'));
  const annots = resolvePdfArray(document, page.node.get(PDFName.of('Annots')));
  if (!annots) return;
  if (options.annotations && options.externalLinks) { page.node.delete(PDFName.of('Annots')); return; }
  const commentTypes = new Set(['/Text', '/FreeText', '/Highlight', '/Underline', '/Squiggly', '/StrikeOut', '/Stamp', '/Ink', '/Popup', '/Caret', '/FileAttachment', '/Sound']);
  const retained = annots.asArray().filter((ref) => {
    const dict = resolvePdfDict(document, ref);
    if (!dict) return true;
    const subtype = resolvedPdfName(document, dict.get(PDFName.of('Subtype')));
    if (options.annotations && commentTypes.has(subtype)) return false;
    if (options.attachments && subtype === '/FileAttachment') return false;
    if (options.externalLinks && subtype === '/Link') return false;
    if (stripActions) { dict.delete(PDFName.of('A')); dict.delete(PDFName.of('AA')); }
    if (options.metadata) {
      for (const key of ['M', 'CreationDate', 'T', 'Subj', 'NM']) dict.delete(PDFName.of(key));
    }
    return true;
  });
  if (retained.length) page.node.set(PDFName.of('Annots'), document.context.obj(retained));
  else page.node.delete(PDFName.of('Annots'));
}

export async function repairPdf(bytes) {
  const source = await loadPdf(bytes);
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, source.getPageIndices());
  pages.forEach((page) => output.addPage(page));
  return pdfBytes(output, { useObjectStreams: true });
}

export async function optimizePdf(bytes, mode = 'lossless') {
  const document = await loadPdf(bytes);
  const originalSize = bytes.byteLength || bytes.length || 0;
  const output = await pdfBytes(document, { useObjectStreams: mode !== 'compatible' });
  return { bytes: output, originalSize, resultSize: output.length, saved: originalSize - output.length, mode };
}

export async function rasterPagesToPdf(pages, options = {}, progress = () => {}, signal) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages.length; index += 1) {
    const source = pages[index];
    const imageBytes = source.imageBytes || source.bytes;
    const image = source.format === 'jpg' ? await document.embedJpg(imageBytes) : await document.embedPng(imageBytes);
    const width = Number(source.width) || image.width;
    const height = Number(source.height) || image.height;
    const page = document.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
    if (source.searchText) {
      const normalized = String(source.searchText).replace(/[\u0000-\u001f]+/g, ' ').slice(0, 250000);
      const lines = normalized.match(/.{1,120}(?:\s|$)/g) || [normalized];
      lines.slice(0, 2000).forEach((line, lineIndex) => page.drawText(line.trim(), { x: 2, y: Math.max(2, height - 8 - lineIndex * 4), size: 3, font, opacity: 0 }));
    }
    progress({ phase: 'rebuilding', current: index + 1, total: pages.length });
    await yieldToMain(signal);
  }
  return pdfBytes(document);
}

export async function overlaySearchText(bytes, pageText, progress = () => {}, signal) {
  const document = await loadPdf(bytes);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const entries = pageText instanceof Map ? Array.from(pageText.entries()) : Object.entries(pageText || {}).map(([key, value]) => [Number(key), value]);
  for (let index = 0; index < entries.length; index += 1) {
    const [pageIndex, entry] = entries[index];
    const page = document.getPage(Number(pageIndex));
    if (!page) continue;
    const data = entry && typeof entry === 'object' ? entry : { text: entry, runs: [] };
    const runs = Array.isArray(data.runs) ? data.runs : [];
    page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
    if (runs.length && data.rasterWidth && data.rasterHeight) {
      const sx = page.getWidth() / Number(data.rasterWidth);
      const sy = page.getHeight() / Number(data.rasterHeight);
      runs.slice(0, 10000).forEach((run) => {
        const text = encodableText(font, run.text);
        if (!text) return;
        const height = Math.max(1, (Number(run.y1) - Number(run.y0)) * sy);
        page.drawText(text, {
          x: Math.max(0, Number(run.x0) * sx),
          y: Math.max(0, page.getHeight() - Number(run.y1) * sy),
          size: height, font, color: rgb(0, 0, 0),
          maxWidth: Math.max(1, (Number(run.x1) - Number(run.x0)) * sx)
        });
      });
    } else {
      const normalized = String(data.text || '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, 250000);
      const chunks = normalized.match(/.{1,100}(?:\s|$)/g) || [normalized];
      chunks.slice(0, 2500).forEach((chunk, lineIndex) => {
        const text = encodableText(font, chunk.trim());
        if (text) page.drawText(text, { x: 2, y: Math.max(2, page.getHeight() - 5 - (lineIndex % 500) * 1.2), size: 1, font, color: rgb(0, 0, 0), maxWidth: Math.max(10, page.getWidth() - 4) });
      });
    }
    page.pushOperators(popGraphicsState());
    progress({ phase: 'text-layer', current: index + 1, total: entries.length });
    await yieldToMain(signal);
  }
  return pdfBytes(document);
}

export async function replacePagesWithRasters(bytes, replacements, progress = () => {}, signal) {
  const source = await loadPdf(bytes);
  const output = await PDFDocument.create();
  const replacementMap = replacements instanceof Map ? replacements : new Map(Object.entries(replacements || {}).map(([key, value]) => [Number(key), value]));
  const untouchedIndices = source.getPageIndices().filter((index) => !replacementMap.has(index));
  const untouchedPages = await output.copyPages(source, untouchedIndices);
  const untouchedByIndex = new Map(untouchedIndices.map((sourceIndex, index) => [sourceIndex, untouchedPages[index]]));
  for (let index = 0; index < source.getPageCount(); index += 1) {
    const replacement = replacementMap.get(index);
    if (replacement) {
      const image = replacement.format === 'jpg'
        ? await output.embedJpg(replacement.imageBytes || replacement.bytes)
        : await output.embedPng(replacement.imageBytes || replacement.bytes);
      const sourcePage = source.getPage(index);
      const width = Number(replacement.pageWidthPt || replacement.width) || sourcePage.getWidth();
      const height = Number(replacement.pageHeightPt || replacement.height) || sourcePage.getHeight();
      const page = output.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });
    } else {
      output.addPage(untouchedByIndex.get(index));
    }
    progress({ phase: 'redaction', current: index + 1, total: source.getPageCount() });
    await yieldToMain(signal);
  }
  return pdfBytes(output);
}

export function pdfBlob(bytes) { return new Blob([bytes], { type: PDF_MIME }); }

export function containsRawString(bytes, value) {
  if (!value) return false;
  const raw = new TextDecoder('latin1').decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return raw.toLocaleLowerCase().includes(String(value).toLocaleLowerCase());
}

export function decodePdfValue(value) {
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText();
  return String(value || '');
}

function encodableText(font, value) {
  const text = String(value || '').replace(/[\u0000-\u001f]+/g, ' ').trim();
  if (!text) return '';
  try { font.encodeText(text); return text; } catch (_) {
    return Array.from(text).filter((character) => { try { font.encodeText(character); return true; } catch (_) { return false; } }).join('');
  }
}
