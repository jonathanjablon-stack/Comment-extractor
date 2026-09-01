# Privacy architecture

## Privacy statement

Comment Master processes selected documents in the user's browser. It has no document upload API, cloud conversion service, telemetry collector, analytics package, advertising code, or required third-party account.

The deployed site must serve all application code, workers, WebAssembly, and language data from the Comment Master GitHub Pages origin. Runtime CDN dependencies are not permitted.

This architecture reduces casual document leakage. It does not make a compromised browser, compromised operating system, malicious browser extension, or modified deployment trustworthy.

## Protected data

The privacy boundary treats all of the following as sensitive document data:

- source bytes and generated output bytes;
- filenames and selected folder handles;
- extracted text and OCR text;
- comments, tracked changes, authors, dates, and replies;
- metadata and custom properties;
- hyperlinks and external relationship targets;
- document hashes and structural findings;
- form field names and values;
- rendered page images and redaction coordinates.

Comment Master does not intentionally transmit these values.

## Data lifecycle

| Stage | Location | Lifetime |
| --- | --- | --- |
| File selection | Browser `File` object and optional File System Access handle | Current tab or until Clear Local Workspace |
| Word processing | In-memory original bytes, parsed XML, modified parts, and bounded undo snapshots | Current loaded-document session |
| PDF processing | In-memory original and working `Uint8Array`, PDF.js document, canvases, text cache, and pending operations | Current PDF session |
| OCR | Page canvas, Tesseract worker memory, recognized runs, and English model in the optional application-asset cache | Page canvas and text are temporary; engine assets may remain cached |
| Binder, conversion, and batch | In-memory file queue, per-item status, output blobs, and a temporary ZIP blob when requested | Current tab or until cleared |
| Saving | Explicit user-selected destination or a browser download | Controlled by the user and browser |
| Offline assets | Service-worker Cache Storage | Versioned application assets only |

Document bytes are not written to `localStorage`, IndexedDB, OPFS, or the service-worker cache. There is no implicit recent-file list or document archive.

Clear Local Workspace removes staged files, queues, results, clean-copy source state, current PDF state, OCR worker state, and tracked object URLs from the current tab. It does not delete files the user has already saved.

Clear cached optional engines deletes the service worker's optional application-asset cache. It removes OCR and semantic DOCX conversion assets that were cached for reuse, not user documents.

## Network boundary

### Content Security Policy

`index.html` declares a Content Security Policy with these important boundaries:

- `default-src 'none'` establishes a deny-by-default policy.
- `connect-src 'self' blob:` prevents application fetch, XHR, WebSocket, and beacon connections to third-party origins.
- `worker-src 'self' blob:` limits workers to local application code and browser-created URLs.
- `img-src`, `font-src`, and `script-src` do not allow third-party origins.
- `object-src 'none'`, `form-action 'none'`, and `base-uri 'none'` block embedded plug-ins, form submissions, and base URL manipulation.
- `referrer` is disabled through `no-referrer` metadata.

The existing Word application remains inline in `index.html`, so `script-src` currently includes `unsafe-inline`. The OCR WebAssembly runtime requires `wasm-unsafe-eval`. These allowances do not grant cross-origin network access. Moving the remaining inline Word code into hashed or nonce-controlled modules is a future hardening opportunity.

### Document links

Word external relationships are listed from the local OOXML package. Comment Master does not send `HEAD`, `GET`, DNS preflight, or private-network requests to those targets. The UI reports valid addresses as listed but not contacted.

PDF external link indicators are counted structurally. Viewer rendering disables PDF annotations, PDF JavaScript evaluation, XFA, auto-fetch, streaming, and worker network fetches. Comment Master does not activate imported PDF actions.

### Runtime dependencies

The production build copies pinned dependency files from the locked npm installation into `dist/vendor/`. Modules and workers import from that same deployment. Tesseract core and English data plus Mammoth are lazy-loaded from the same origin only when their features are requested.

No library is fetched from jsDelivr, unpkg, Google, Microsoft, Adobe, or another runtime CDN.

## Service-worker cache policy

The build writes exact core and optional asset URL arrays into `service-worker.js`. The service worker handles only same-origin `GET` requests without `Range` headers.

It applies these rules:

1. Navigations are network-first. The worker falls back to the exact cached `index.html` only when the network is unavailable.
2. A non-navigation request is cacheable only if its exact URL appears in the build-generated core or optional allowlist.
3. Query-string variants, arbitrary same-origin paths, file downloads, object URLs, and document-derived requests are not added to the cache.
4. Responses must be successful, full, same-origin basic responses before storage.
5. A failed core installation deletes the partial core cache.
6. Activation deletes older Comment Master application-asset caches and leaves unrelated caches alone.

Because selected local files have browser `blob:` or file-handle provenance and are never in the asset allowlist, they cannot enter the service-worker cache through normal application behavior.

## Imported-content controls

Uploaded files are untrusted input even though they never leave the device.

### ZIP and OOXML controls

- The Word application limits source size, package entry count, estimated expansion, comparison size, and undo memory.
- General ZIP-based conversion rejects unsafe absolute or parent-traversal entry names.
- General ZIP conversion rejects packages with more than 5,000 entries and entries declaring more than 64 MB of uncompressed data.
- XML parsing rejects `DOCTYPE` and `ENTITY` declarations and rejects parser errors.
- Imported macros, ActiveX objects, embedded packages, and custom UI are never executed.

The expanded workbench limits a selection to 100 files, 250 MB per file, and 500 MB combined. These limits reduce accidental memory exhaustion but are not a complete defense against every compressed-data attack. Browser memory remains the final boundary.

### HTML and rich text

Markdown is parsed with Marked and immediately sanitized with DOMPurify. Imported HTML and Mammoth-produced DOCX HTML are also sanitized. The allowed profile excludes scripts, style blocks, frames, objects, embeds, SVG, MathML, forms, links, metadata elements, and `srcset`. Data attributes are disabled.

Mammoth is invoked with external file access disabled. Imported markup is not placed into an execution context before sanitation.

### PDF controls

- PDF.js disables script evaluation and XFA, does not render annotations, and operates on provided local bytes.
- Rendered pages are subject to a decoded-pixel limit.
- pdf-lib mutation paths reject encrypted inputs instead of treating `ignoreEncryption` as decryption.
- Password entry is not implemented. Encrypted PDFs are outside editable operations.
- Mutations always create a working copy or new output and do not automatically overwrite the source.

## Secure redaction boundary

Visual rectangle overlays are not treated as secure redaction.

Secure Redaction renders every page into a new canvas, paints approved masks onto marked pages, creates new PNGs, and constructs a fresh PDF containing only those raster pages. No source page or catalog object is copied into the output. This removes original text and image content streams plus shared hidden resources from the result.

If a mark came from selected or searched text, the result is checked in two ways:

- PDF.js extracts text from the rebuilt document and checks for the marked term.
- A case-insensitive raw-byte scan checks the output for the marked term.

These checks are evidence, not a universal proof. A term may occur elsewhere, use another encoding, or have no text representation. Drawn boxes have no known term to test. Users should visually inspect the exported result.

Every page is a raster image after redaction. OCR should be run only on the redacted result if searchable text is required. Running OCR on the masked output prevents removed text from being reintroduced through a pre-redaction text layer.

Fresh reconstruction can remove metadata, forms, attachments, outlines, tags, or signatures and can invalidate existing signatures. The UI and documentation disclose this tradeoff.

## Cleanup boundaries

### Word

Create Clean Word Copy previews selected operations before changing a new copy. It can accept supported revisions and remove selected comments, review attributes, personal core properties, hidden runs, custom properties, external relationships, and embedded or active package parts.

It does not claim to update every field, refresh a table of contents through the Word calculation engine, or prove that all possible custom OOXML extensions are clean. Users should open and review the generated DOCX before sharing.

### PDF

Selective sanitation removes known catalog, page, annotation, metadata, name-tree, and form categories. Every sanitation mode rebuilds a fresh page-only document to avoid leaving detached or shared indirect objects in the output.

That conservative rebuild flattens forms and discards advanced document-level structures even for a selective preset. Maximum Sanitize is not a substitute for Secure Redaction, and selective metadata removal is not a claim that every vendor-specific private object has been interpreted.

## Signatures and encryption

Comment Master detects standard signature fields and structural signature indicators. It does not:

- validate a certificate chain;
- query OCSP or CRL services;
- establish current trust or revocation status;
- establish signer identity;
- create a certificate-based signature;
- promise that a displayed signature remains valid after editing.

Any saved change can invalidate a prior signature.

Encrypted and password-protected PDF editing is unsupported. The application does not attempt to bypass encryption. Users must supply a legitimately decrypted copy outside Comment Master before using edit operations.

## Verification

The automated regression suite includes a Word link-privacy test that installs a failing `fetch` stub, isolates the production link-inventory implementation, confirms that no network primitive is present in that path, and verifies a zero-fetch result. Unit fixtures use synthetic canaries rather than confidential data.

The Playwright suite also contains a runtime request-interception specification that opens a DOCX with an external-link canary and a PDF with active-content canaries, blocks any request outside the test-site origin, and requires an empty external-request list. A second specification inspects Cache Storage against the generated manifest and reloads the application shell offline. These browser specifications require a prepared Playwright Chromium executable and must not be reported as passed unless they run to completion.

The deterministic build and Pages workflow verify that the deployed artifact contains only allowlisted files and that the service-worker placeholders and cache lists are fully generated. Browser release verification should additionally intercept requests after assets load and exercise local DOCX, PDF, OCR, redaction, conversion, and batch workflows while confirming that no document-derived request is emitted.

## Deployment review checklist

Before a production release:

- Run `npm ci --ignore-scripts --no-audit --fund=false` from the committed lockfile.
- Run `npm run qa` and require a clean exit.
- Verify the deterministic build comparison in GitHub Actions.
- Confirm GitHub Pages deploys only `dist/`.
- Confirm the live `asset-manifest.json` version and build ID match the workflow artifact.
- Inspect browser Network after application load while processing canary documents.
- Inspect Cache Storage and confirm it contains application assets only.
- Test the app offline after core installation and after first OCR and DOCX-conversion use.
- Verify that Clear Local Workspace and Clear cached optional engines affect only their documented scopes.

## No compliance claim

The local-processing design is useful for sensitive documents, but the application does not make a HIPAA, GDPR, legal-privilege, records-management, or other compliance certification. A deployment owner must evaluate browser, endpoint, access-control, retention, organizational, and legal requirements for the intended environment.
