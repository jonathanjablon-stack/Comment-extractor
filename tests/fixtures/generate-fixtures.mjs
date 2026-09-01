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
export const JPX_SCAN_TEXT = 'JPX OCR TEST 742';
export const JPX_SCAN_WIDTH = 512;
export const JPX_SCAN_HEIGHT = 180;

// Synthetic, high-contrast JPEG 2000 image created from fixed pixels. Keeping
// the encoded sample in the generator makes the JPX regression fixture
// reproducible without requiring an image encoder on a developer machine.
const JPX_SCAN_BASE64 = [
  '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',
  '10Wp7fBgm4D/2Q=='
].join('');

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

export async function createJpxScanPdf() {
  const document = await PDFDocument.create();
  setFixedMetadata(document, {
    title: 'Synthetic JPEG 2000 scan',
    subject: 'JPX decoder and OCR visual-preservation regression fixture'
  });
  const page = document.addPage([JPX_SCAN_WIDTH, JPX_SCAN_HEIGHT]);
  const imageBytes = Uint8Array.from(Buffer.from(JPX_SCAN_BASE64, 'base64'));
  const image = document.context.register(document.context.stream(imageBytes, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: JPX_SCAN_WIDTH,
    Height: JPX_SCAN_HEIGHT,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'JPXDecode'
  }));
  const imageName = page.node.newXObject('JpxFixture', image);
  const content = document.context.register(document.context.stream(
    `q\n${JPX_SCAN_WIDTH} 0 0 ${JPX_SCAN_HEIGHT} 0 0 cm\n${imageName} Do\nQ\n`
  ));
  page.node.addContentStream(content);
  return saveFixturePdf(document);
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
