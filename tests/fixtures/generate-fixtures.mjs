import { deflateSync } from 'node:zlib';
import {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  degrees,
  rgb
} from 'pdf-lib';

export const FIXED_DATE = new Date('2024-01-02T03:04:05.000Z');
export const CANARY_URL = 'https://document-canary.invalid/private-source-742';
export const SECRET_SENTINEL = 'SECRET_SENTINEL_742';
export const FORM_DROPDOWN_CANARY = 'DROPDOWN_VALUE_CANARY_742';
export const FORM_RADIO_CANARY = 'RADIO_VALUE_CANARY_742';

export const PAGE_SPECS = Object.freeze([
  Object.freeze({ label: 'PAGE ALPHA', width: 210, height: 310, rotation: 0 }),
  Object.freeze({ label: 'PAGE BRAVO', width: 320, height: 240, rotation: 90 }),
  Object.freeze({ label: 'PAGE CHARLIE', width: 410, height: 510, rotation: 180 })
]);

function setFixedMetadata(document, metadata = {}) {
  document.setTitle(metadata.title || 'Synthetic PDF fixture');
  document.setAuthor(metadata.author || 'Comment Master QA');
  document.setSubject(metadata.subject || 'Deterministic local test data');
  document.setKeywords(metadata.keywords || ['synthetic', 'fixture']);
  document.setCreator(metadata.creator || 'Comment Master fixture generator');
  document.setProducer(metadata.producer || 'Comment Master fixture generator');
  document.setCreationDate(FIXED_DATE);
  document.setModificationDate(FIXED_DATE);
}

export async function saveFixturePdf(document) {
  return document.save({
    useObjectStreams: false,
    addDefaultPage: false,
    updateFieldAppearances: true,
    objectsPerTick: 1000
  });
}

export async function createOrderedPdf(pageSpecs = PAGE_SPECS, metadata = {}) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  setFixedMetadata(document, metadata);
  for (const spec of pageSpecs) {
    const page = document.addPage([spec.width, spec.height]);
    page.setRotation(degrees(spec.rotation || 0));
    page.drawText(spec.label, {
      x: 18,
      y: Math.max(30, spec.height - 42),
      size: 12,
      font,
      color: rgb(.08, .12, .2),
      maxWidth: Math.max(40, spec.width - 36)
    });
  }
  return saveFixturePdf(document);
}

export async function createActiveFormPdf() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  setFixedMetadata(document, {
    title: SECRET_SENTINEL,
    author: 'Fixture Author',
    subject: 'Active content and forms'
  });

  const formPage = document.addPage([360, 480]);
  formPage.drawText('Synthetic form', { x: 30, y: 440, size: 16, font });
  const form = document.getForm();

  const name = form.createTextField('person.name');
  name.setText('Alice Example');
  name.addToPage(formPage, { x: 30, y: 370, width: 220, height: 24, font });

  const approved = form.createCheckBox('approved');
  approved.check();
  approved.addToPage(formPage, { x: 30, y: 320, width: 18, height: 18 });

  const category = form.createDropdown('category');
  category.addOptions(['Alpha', FORM_DROPDOWN_CANARY, 'Gamma']);
  category.select(FORM_DROPDOWN_CANARY);
  category.addToPage(formPage, { x: 30, y: 260, width: 180, height: 24, font });

  const priority = form.createRadioGroup('priority');
  priority.addOptionToPage(FORM_RADIO_CANARY, formPage, { x: 30, y: 210, width: 18, height: 18 });
  priority.addOptionToPage('Routine', formPage, { x: 90, y: 210, width: 18, height: 18 });
  priority.select(FORM_RADIO_CANARY);

  const activePage = document.addPage([420, 300]);
  activePage.drawText('Active content inventory', { x: 24, y: 258, size: 14, font });

  const uriAction = document.context.obj({
    Type: 'Action',
    S: 'URI',
    URI: PDFString.of(CANARY_URL)
  });
  const link = document.context.register(document.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [24, 200, 240, 225],
    Border: [0, 0, 0],
    A: uriAction
  }));
  const note = document.context.register(document.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [260, 200, 280, 220],
    Contents: PDFString.of('Synthetic review note')
  }));
  activePage.node.set(PDFName.of('Annots'), document.context.obj([link, note]));

  const pageAction = document.context.obj({
    S: 'JavaScript',
    JS: PDFString.of(`app.launchURL('${CANARY_URL}')`)
  });
  activePage.node.set(PDFName.of('AA'), document.context.obj({ O: pageAction }));
  document.catalog.set(PDFName.of('OpenAction'), pageAction);
  document.addJavaScript('fixture-canary', `app.launchURL('${CANARY_URL}')`);
  await document.attach(new TextEncoder().encode('fixture attachment'), 'fixture.txt', {
    mimeType: 'text/plain',
    description: 'Synthetic attachment',
    creationDate: FIXED_DATE,
    modificationDate: FIXED_DATE
  });

  return saveFixturePdf(document);
}

export function appendPdfComment(bytes, value = SECRET_SENTINEL) {
  const suffix = new TextEncoder().encode(`\n% ${String(value).replace(/[\r\n]/g, ' ')}\n`);
  return concatBytes(bytes, suffix);
}

export function corruptStartXref(bytes) {
  const source = Buffer.from(bytes).toString('latin1');
  const damaged = source.replace(/startxref\s+\d+\s+%%EOF\s*$/, 'startxref\n0\n%%EOF\n');
  if (damaged === source) throw new Error('The fixture did not contain a replaceable startxref marker.');
  return new Uint8Array(Buffer.from(damaged, 'latin1'));
}

export function createSolidPng(width = 2, height = 2, color = [0, 0, 0, 255]) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error('PNG dimensions must be positive integers.');
  }
  const rgba = color.map((component) => Math.max(0, Math.min(255, Number(component) || 0)));
  while (rgba.length < 4) rgba.push(255);
  const scanlines = new Uint8Array(height * (1 + width * 4));
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (1 + width * 4);
    scanlines[rowStart] = 0;
    for (let column = 0; column < width; column += 1) {
      scanlines.set(rgba.slice(0, 4), rowStart + 1 + column * 4);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  return concatBytes(
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', new Uint8Array())
  );
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = data instanceof Uint8Array ? data : new Uint8Array(data);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, body.length);
  const checksumInput = concatBytes(typeBytes, body);
  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, crc32(checksumInput));
  return concatBytes(length, checksumInput, checksum);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(...parts) {
  const arrays = parts.map((part) => part instanceof Uint8Array ? part : new Uint8Array(part));
  const output = new Uint8Array(arrays.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of arrays) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
