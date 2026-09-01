# Comment Master v7 architecture

## Design constraints

Comment Master is a static browser application. The production runtime has no application server, document-processing API, upload route, analytics endpoint, or required account. GitHub provides source control, CI, and static Pages hosting. The browser performs document work.

Version 7 keeps the mature Word implementation in the main entry file and adds a modular workbench around it. This avoids a risky rewrite of the existing OOXML behavior while allowing PDF, conversion, binder, and batch features to use separate assets.

## Source layout

| Path | Responsibility |
| --- | --- |
| `index.html` | Primary entry point, existing Word application, DOCX comparison and commentary combining, embedded legacy JSZip and export helpers, global shell, and workspace markup |
| `src/workbench.js` | Home routing, file staging, PDF viewer orchestration, OCR, redaction UI, binder, conversion, batch work, cross-format inspection, saving, and service-worker registration |
| `src/workbench-core.mjs` | Format detection, filename rules, limits, page-range parsing, contextual suggestions, escaping, and cooperative yielding |
| `src/pdf-engine.mjs` | Browser-local PDF creation and mutation through pdf-lib |
| `src/workbench.css` | Version 7 shell, home, PDF, tools, dialogs, responsive behavior, focus, reduced-motion, and forced-colors styling |
| `src/service-worker.js` | Build-templated core and optional asset caching |
| `tools/build.mjs` | Deterministic allowlisted production assembly and asset-manifest generation |
| `tools/serve.mjs` | Loopback-only static server for Playwright against the generated production artifact |
| `manifest.webmanifest` | Install metadata for supported browsers |
| `tests/fixtures/generate-fixtures.mjs` | Deterministic synthetic PDF and image fixtures with no real user data |
| `tests/unit/` | v7 core, PDF, privacy, filename, and Word regression tests |
| `tests/browser/` | Playwright browser, responsive, privacy-egress, cache-allowlist, and offline tests |
| `playwright.config.mjs` | Single-worker Chromium configuration and generated-site test server |
| `.github/workflows/pages.yml` | Lockfile install, build, QA, deterministic-artifact verification, and Pages deployment |

The `dist/` directory is generated and is not source. GitHub Pages deploys only `dist/`.

## Runtime composition

### Application shell

`src/workbench.js` owns the route state for Home, Word, PDF, and Tools. The Compare & Combine action opens the existing Word comparison dialog. A small `window.CommentMasterWord` facade lets the new shell open a DOCX, query the loaded document, pass already selected comparison files, switch a Word tab, and request export without reaching into the legacy state object.

The reverse bridge is `window.CommentMasterWorkbench`. Word comparison and commentary operations deliver generated blobs and summaries to the workbench result dialog when it is available. They retain a direct-download fallback if the module cannot initialize.

The shell holds current files, working bytes, queues, result blobs, and save handles in JavaScript memory. It does not create a hidden document library.

### Word package model

The Word application reads a DOCX as an OPC ZIP package, parses relevant XML parts, and keeps original bytes plus a set of modified parts. Export reconstructs the package while preserving untouched entries.

Review items retain source part, type, author, date, text, range context, identifiers, and reply relationships where present. Mutations update the relevant OOXML and keep bounded undo snapshots. Existing protections include a 250 MB input cap, entry-count and expanded-size checks, comparison paragraph and token caps, and a 64 MB undo-memory cap.

The v7 comparison path:

1. Treats existing tracked revisions in each input as accepted text for the new comparison.
2. Builds paragraph models across supported story parts.
3. Aligns unchanged and similar paragraphs conservatively.
4. Uses token-level changes for structurally simple paragraphs.
5. Emits tracked insertions, deletions, and paragraph-property changes.
6. Preserves unchanged package parts and imports supported comments.
7. Fails closed with a clear error when changed or inserted nested structure cannot be revised safely at token level.

Multi-review combining compares each reviewed copy independently with the base. Identical proposals can share attribution. Overlapping alternatives remain separately attributed instead of being silently resolved. Comments are deduplicated using their source information and content.

### PDF viewer and working copy

PDF.js renders the current working bytes in a dedicated worker. The loader disables JavaScript evaluation, XFA, streaming, automatic fetching, and worker network fetches. Viewer rendering disables annotations so imported actions are not activated by the visual layer.

The PDF state tracks:

- original bytes and current working bytes;
- a virtual page order and per-position rotations;
- bounded page-operation undo snapshots;
- current page, extracted-text cache, and text item geometry;
- pending redaction marks;
- inspection results and an optional OCR worker;
- unsaved-change and file-handle state.

Virtual page changes are materialized through pdf-lib before an operation that requires final page geometry. Full permutations are reordered in the loaded document. Extraction, duplication, deletion, and selected-page products create new PDF documents from copied pages.

PDF rendering is capped at 2,000 pages and 32 million decoded pixels for a requested rendered page. These are browser safety limits, not document-format limits.

### Secure redaction

Pending redactions are normalized boxes associated with a working-copy page. They can originate from pointer drawing, a text-layer selection, plain-text search, or regular-expression search.

Apply Secure Redaction follows this sequence:

1. Materialize pending page order and rotation changes.
2. Render every page to a fresh canvas at a fixed processing scale.
3. Paint every approved mask onto its marked page canvas before export.
4. Re-encode every page canvas as PNG.
5. Create a fresh PDF containing only those raster pages, without copying source PDF page objects or catalog structures.
6. Extract text from the rebuilt document and scan output bytes for explicitly marked terms where available.

This removes original content streams and shared hidden resources from the result. It deliberately changes every page into an image and removes the existing searchable layer and source catalog structures. The result must be reviewed visually, especially for box-only redactions that have no known string to verify.

OCR of a redacted file must be run on the redacted result. The application does not carry pre-redaction OCR text into the rebuilt pages.

### OCR

Tesseract.js and its WebAssembly core are loaded only when OCR is invoked. The release ships English trained data. OCR page images and recognized text remain in the browser.

The main UI renders one page at a time, passes it to the Tesseract Web Worker, receives word bounding boxes, and converts those boxes to invisible PDF text positions. Cancellation is checked between pages and the worker reports phase progress. The worker and large canvases are released when the workspace is cleared.

### PDF sanitation, forms, and inspection

pdf-lib provides structural access for supported PDF mutations. Sanitation can detach known metadata, actions, name-tree entries, selected annotation categories, external link annotations, and stored form values. Every sanitation mode uses a fresh page-only document rebuild so detached or shared objects cannot carry removed data forward.

That rebuild intentionally does not retain catalog features. It flattens standard forms and removes outlines, tagging, page labels, attachments, signatures, and other document-level structures even for a selective clean operation. The interface discloses this before export.

Standard AcroForm text fields, check boxes, radio groups, dropdowns, and option lists are inspected and updated with explicit type handling. Text values are limited to WinAnsi-compatible Latin characters in the standard-font path. Reset runs before saving. Flattening preserves visible appearances and removes interactivity where pdf-lib supports the field. XFA and signature fields are not edited.

Inspection combines pdf-lib information with bounded raw indicator scans and PDF.js text extraction. Signature reporting is only presence detection. It is not certificate validation.

Normalize PDF parses a readable input and copies pages into a fresh PDF. This can recover some malformed cross-reference cases that the parser tolerates, but it is not a general repair engine. Lossless optimize is a pdf-lib rewrite with object streams and honest size reporting.

### Conversion and binder

Conversion uses format-specific local paths:

| Input | Local path |
| --- | --- |
| DOCX | Lazy Mammoth conversion to sanitized semantic HTML and text |
| XLSX | Text extraction from shared strings and worksheet XML |
| PPTX | Text extraction from ordered slide XML |
| ODT | Text extraction from `content.xml` |
| RTF | Bounded control-word and Unicode text decoding |
| Markdown | Marked parsing followed by DOMPurify sanitation |
| HTML | DOMPurify sanitation followed by safe text extraction |
| PDF | PDF.js text extraction or page rendering |
| TXT and CSV | Browser text decoding |
| Images | Direct PNG or JPEG embedding, with WebP and GIF first converted through Canvas |

The semantic Office paths do not run LibreOffice in the browser and do not promise exact layout. PDF output for text-bearing sources is newly typeset with standard fonts. Basic DOCX output is a simple OOXML text document.

Binder converts inputs sequentially, records an item-level error without discarding successful items, then merges the produced PDFs. Optional binder features are dividers, source filename bands, page numbers, a generated table of contents, and outline bookmarks.

Batch processing is sequential by design to limit peak memory. Each item has Ready, Processing, Complete, or Error state. Cancellation is checked between items and at page boundaries for page-aware operations. Successful results can be saved individually or packaged into a ZIP.

## Dependency and execution matrix

| Capability | Implementation | JavaScript or WebAssembly | Lazy-loaded | Offline after cache |
| --- | --- | --- | --- | --- |
| Word review, comparison, clean copy | Existing OOXML code and JSZip | JavaScript | No | Yes |
| PDF rendering and text extraction | PDF.js 6.3.289 plus PDF worker | JavaScript worker | Core asset | Yes |
| PDF mutation and export | pdf-lib 1.17.1 | JavaScript | Core asset | Yes |
| OCR | Tesseract.js 7.0.0, tesseract.js-core 7.0.0, English data 1.0.0 | JavaScript worker plus WebAssembly | Yes | Yes, after first successful load |
| DOCX semantic conversion | Mammoth.js 1.12.2 | JavaScript | Yes | Yes, after first successful load |
| Markdown parsing | Marked 18.0.11 | JavaScript | Core asset | Yes |
| HTML sanitation | DOMPurify 3.4.14 | JavaScript | Core asset | Yes |

Pinned versions and license paths are documented in `THIRD_PARTY_NOTICES.md`.

## Build output

`npm run build` removes and recreates `dist/`, then copies a fixed list of application and vendor files. It does not copy the source tree, tests, archived HTML, package manager metadata, or arbitrary repository files.

The build then:

1. Computes a build ID from the version, cache lists, paths, and file bytes.
2. Replaces service-worker placeholders with the version, build ID, core allowlist, and optional allowlist.
3. Hashes every final artifact with SHA-256.
4. Writes `dist/asset-manifest.json` with exact paths, byte sizes, hashes, and cache groups.

GitHub Actions runs the build twice and compares the full sorted SHA-256 listing. A difference fails deployment.

## Service-worker lifecycle

Core application assets are fetched from the deployment origin and stored in a cache whose name includes both version and build ID. Installation fails and deletes the partial cache if any required core asset cannot be stored.

Navigations are network-first with the exact cached `index.html` as the offline fallback. Non-navigation requests are intercepted only if their exact URL is in the core or optional allowlist. Query variants, range requests, other same-origin files, and all cross-origin requests are ignored by the worker.

The new worker waits under the standard service-worker lifecycle. The application reports when an update is ready. Activation deletes prior Comment Master asset caches but does not touch unrelated caches or document bytes. A message can delete the current optional-engine cache without deleting core assets.

## Saving and object lifetime

On secure Chromium browsers, `showOpenFilePicker` and `showSaveFilePicker` provide application-like file access. Open handles are associated with their selected `File` objects in memory. Save never writes to an original handle without an explicit save action.

Other browsers use file inputs and `download` links. Download object URLs are revoked shortly after use. Clearing the local workspace destroys the PDF document, terminates OCR, removes queues and results, and revokes remaining object URLs.

## Error and cancellation model

The UI converts thrown errors into short task-oriented messages. Long operations use a modal progress surface with an `AbortController`. OCR and PDF operations check cancellation at page boundaries. Binder, conversion, and batch operations check it at item boundaries and yield to the event loop between items. One item failure remains attached to that item and does not erase the queue.

OCR is the only heavy recognition engine in a dedicated Web Worker. PDF.js rendering also uses its own worker. Comparison, PDF writing, conversion, binder assembly, and ZIP operations are JavaScript tasks that use cooperative yields rather than separate workers. Very large inputs can still be limited by browser memory or cause brief main-thread work between yield points.

## Accessibility

The shell uses landmarks, a skip link, labeled navigation, visible current-route state, labeled dialogs, status and live regions, native controls, and visible focus treatment. The PDF workspace supports left and right arrows plus Page Up and Page Down outside form fields. Responsive rules collapse multi-column layouts and provide a navigation menu at narrow widths. Reduced-motion and forced-colors rules are included.

Generated canvas pages expose extracted page text in a keyboard-focusable adjacent region. This improves access when a PDF text layer exists, but it does not replace a fully tagged PDF reading experience.

## Compatibility boundaries

The production target is current desktop Chrome and Edge. The app also provides standard file-input and download paths for current browsers without the File System Access API. Required platform features include JavaScript modules, dynamic import, Web Workers, WebAssembly, Canvas, Blob and object URLs, `createImageBitmap`, native dialogs, and modern DOM APIs.

Service workers and the File System Access API require a secure context. GitHub Pages supplies HTTPS. Direct `file:` opening is not a complete production mode because module, worker, and service-worker behavior differs across browsers.

Encrypted PDF mutation, full certificate validation, certificate signing, XFA editing, exact desktop Office conversion, general-purpose PDF repair, and guaranteed size reduction are outside the implemented browser-only boundary.
