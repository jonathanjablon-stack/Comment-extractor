import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { createJpxScanPdf } from '../fixtures/generate-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function canvasColorSignature(canvas) {
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const pixelCount = Math.max(1, pixels.length / 4);
  let blue = 0;
  let dark = 0;
  let nonWhite = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blueChannel = pixels[index + 2];
    if (blueChannel > 120 && blueChannel > red * 1.15 && blueChannel > green * 1.1) blue += 1;
    if (red < 80 && green < 80 && blueChannel < 80) dark += 1;
    if (red < 245 || green < 245 || blueChannel < 245) nonWhite += 1;
  }
  return {
    blueRatio: blue / pixelCount,
    darkRatio: dark / pixelCount,
    nonWhiteRatio: nonWhite / pixelCount
  };
}

test('packaged PDF.js OpenJPEG decoder renders the synthetic JPX scan', async () => {
  const loadingTask = getDocument({
    data: (await createJpxScanPdf()).slice(),
    wasmUrl: `${path.join(root, 'dist/vendor/pdfjs/wasm')}${path.sep}`,
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableStream: true
  });
  try {
    const document = await loadingTask.promise;
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const signature = canvasColorSignature(canvas);
    assert.ok(signature.blueRatio > .05, `expected blue scan header, got ${signature.blueRatio}`);
    assert.ok(signature.darkRatio > .01, `expected dark scan text, got ${signature.darkRatio}`);
    assert.ok(signature.nonWhiteRatio > .1, `expected visible scan content, got ${signature.nonWhiteRatio}`);
  } finally {
    await loadingTask.destroy();
  }
});
