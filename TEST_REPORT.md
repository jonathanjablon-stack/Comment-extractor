# Comment Master v7.0.0 test report

Date: 2026-09-01  
Release contract: `npm run qa`  
Local runtime used for the recorded run: Node.js 24.19.0, npm 11.9.0

## Release status

The production build, both legacy scripts, all 29 non-privacy Node unit tests, and all 4 dedicated privacy tests are green. Playwright discovery finds 19 Chromium specifications. Those browser specifications have not been executed for this recorded result and remain pending CI, so this report does not claim that the complete `npm run qa` contract has passed.

Manual Chrome and Edge verification is **pending**. The bounded placeholder near the end of this report must be replaced after the deployed Pages artifact is exercised. This report does not claim that browser verification is complete.

## Automated result

Verified local commands:

```bash
npm run build
npm run test:legacy
npm run test:unit
npm run test:privacy
```

Result:

| Stage | Result |
| --- | --- |
| Production static build | Passed |
| Established export regression script | Passed |
| Established Word comparison regression script | Passed |
| Node unit tests | 29 passed, 0 failed, 0 skipped, 0 cancelled |
| Dedicated privacy tests | 4 passed, 0 failed, 0 skipped, 0 cancelled |
| Playwright browser specifications | 19 discovered; execution pending CI |
| Overall `npm run qa` | Pending browser execution; no full-pass claim in this report |

The recorded build produced Comment Master v7.0.0 and completed the generated service-worker and asset-manifest steps without an error.

## Automated coverage

### Established Word and export regressions

`npm run test:legacy` executes two established scripts:

- `tests/comment_master_exports.test.js`
- `tests/comment_master_v6_3.test.js`

The export script verifies the application syntax and UI contract, output filenames, long comment context handling, reply association, and generated DOCX report packages in portrait and landscape layouts.

The comparison script verifies:

- required Compare Documents, Compare Text, and Combine Commentary controls;
- unique IDs and mapped Word UI actions;
- minimal word-level insertion and deletion behavior;
- one-word and punctuation-aware comparison primitives;
- formatting-aware token comparison;
- existing tracked revisions treated as accepted text for a new comparison;
- insertion and deletion of paragraphs;
- imported comments and reviewer attribution;
- multi-reviewer commentary combining with separately attributed alternatives;
- comment deduplication;
- Strict WordprocessingML input;
- preservation of untouched custom XML and binary media parts;
- readable comparison filenames using the local `d.m.yy` convention.

Both scripts passed.

### Workbench core

`tests/unit/workbench-core.test.mjs` contains eight tests covering:

- v7 version constant and format detection;
- exact edited and product filename rules, including uppercase source extensions and unencoded spaces;
- long product filenames that preserve the complete suffix and target extension;
- ordered page-range parsing, descending ranges, duplicate removal, and invalid input;
- contextual task suggestions for one DOCX, two DOCX files, several DOCX files, one PDF, several PDFs, mixed files, and text;
- selection admission limits, readable-file checks, path safety, the 250 MB per-file cap, the 500 MB aggregate cap, and the 100-file cap;
- size formatting, rotation normalization, and HTML escaping;
- cancellation before and after a cooperative event-loop yield.

All eight tests passed.

### PDF engine and generated fixtures

`tests/fixtures/generate-fixtures.mjs` creates deterministic synthetic PDFs and PNG data. The fixtures contain no real documents, personal data, PHI, or confidential material.

The fixtures exercise:

- stable page dimensions and rotation;
- metadata canaries;
- text, check-box, and dropdown form fields;
- comments and annotations;
- an external link canary;
- an embedded-file canary;
- JavaScript and automatic-action indicators;
- a deliberately damaged cross-reference location that the parser can normalize;
- a raw secret-string canary for redaction reconstruction.

`tests/unit/pdf-engine.test.mjs` contains 12 tests covering:

- byte-for-byte deterministic fixture generation;
- structural inspection of metadata, forms, page sizes, annotations, links, attachments, JavaScript, actions, and catalog actions stored inside object streams;
- merge, page reorder, duplicate page selection, rotation, extraction, split output, progress phases, and invalid page rejection;
- Unicode binder labels rendered safely while bookmarks retain the source title;
- form fill, strict Boolean check-box values, reset across supported controls, and flattening;
- clearing dropdown and radio canaries before form flattening;
- fresh page-only rebuilding for every sanitation mode, including physical removal of page-scoped metadata and attachments;
- fresh-context sanitation that does not retain detached canary objects;
- maximum sanitation of metadata, active content, attachments, annotations, links, actions, and form interactivity;
- fresh raster-page replacement without retaining the source secret canary or metadata;
- readable normalization and lossless-rewrite outputs, result-size accounting, Blob MIME type, and friendly unreadable-PDF failure.

All 12 tests passed.

### Word v7 focused regressions

`tests/unit/word-v7-regressions.test.mjs` contains nine tests covering:

- paragraph-formatting-only comparison and tracked `w:pPrChange` output;
- one minimal paragraph-formatting revision with combined attribution when reviewers propose the same formatting change;
- fail-closed handling for changed or inserted structurally complex paragraphs instead of flattened whole-paragraph replacement;
- paragraph-aligned comparison preview rows;
- preservation of a base header when a reviewed copy does not include that story part;
- acceptance of table cell revisions and move and custom-XML range markers;
- local-only external link inventory with a failing fetch stub and zero production fetch calls;
- exact edited, comparison, and combined-commentary filenames;
- complete clearing of prepared comparison state.

All nine tests passed.

### Privacy, offline, and production artifact

`tests/unit/privacy-offline.test.mjs` contains four tests covering:

- a production Content Security Policy that limits runtime connections to the same origin and blob URLs;
- absence of external network probes and persistent document archive APIs in document workflows;
- exact allowlist behavior in the service worker, including rejection of range requests, query variants, arbitrary same-origin files, and cross-origin requests;
- resolution of every generated offline asset from `asset-manifest.json` and absence of source or test archives in the production artifact.

All four tests passed.

The Word v7 link test separately evaluates the production link-inventory function with a `fetch` stub that would fail if called. Together, these tests cover the source-level and generated-artifact privacy contract without using real documents.

### Playwright browser specifications

`tests/browser/workbench.spec.mjs` contains 19 Chromium specifications covering:

- desktop Home hierarchy and lack of horizontal overflow;
- focused global route navigation;
- mixed-file staging and contextual suggestions;
- single-column mobile Home and responsive navigation;
- generated DOCX opening in the preserved Overview-first Word workspace and surviving route changes;
- generated PDF rendering, search, page reorder, unsaved state, and export summary;
- two staged DOCX files prefilling Compare Documents;
- navigable inline, original, revised, and synchronized side-by-side comparison views plus parsed redline DOCX output;
- direct staged-DOCX handoff to Create Clean Copy;
- local OCR of a generated image-only page into searchable output;
- secure redaction export as a fully rasterized PDF without the approved text;
- maximum sanitation export as a passive flattened PDF;
- binder creation from PDF and TXT inputs with parsed page-count verification;
- TXT conversion into a parsed one-page PDF;
- batch inspection packaging parsed PDF and DOCX health reports;
- Clean Word export with revisions accepted and review data removed;
- runtime interception of external requests while opening a DOCX link canary and active-content PDF canary;
- hostile imported HTML without remote image, link, or style requests;
- exact service-worker cache allowlists and an offline shell reload.

Specification discovery reports all 19 tests. They were not executed for this recorded result. No browser assertion is marked passed or failed here.

To execute the suite in a Playwright-capable test environment:

```bash
npx playwright install chromium
npm run test:e2e
```

The browser suite is part of `npm run qa`. The Pages workflow reads the Chromium revision from the installed lockfile package, installs the matching browser plus its runner dependencies, and then invokes the full QA command. A green CI or equivalent browser run must be recorded before these 19 specifications are reported as passed.

## Build and deployment checks

The GitHub Pages workflow prepares the browser environment and adds release checks beyond the local non-browser results:

- installs only from the committed lockfile with lifecycle scripts disabled;
- reads the pinned Playwright Chromium metadata and installs the matching browser and required runner dependencies;
- runs the complete QA contract, including all 19 browser specifications;
- verifies required top-level production files;
- rejects unexpected top-level artifacts and symlinks;
- requires all service-worker template placeholders to be replaced;
- hashes the complete `dist/` tree;
- rebuilds the artifact and requires an identical full hash listing;
- uploads only `dist/`;
- deploys only from `main` after a successful build job.

The local result in this report confirms the build, legacy, unit, and privacy code paths only. It does not confirm any browser assertion. Final workflow and live Pages status belong in the release handoff after the commit is pushed.

## Manual browser verification placeholder

Status: **Pending**

The release owner must replace this section with dated results for the final deployed or final production-equivalent artifact. At minimum, record current desktop Chrome and Edge results for:

- first-launch Home clarity at common desktop widths;
- keyboard navigation, visible focus, dialogs, and no modal traps;
- file picker and drag-and-drop behavior;
- one DOCX in the existing review workspace;
- two DOCX files in Compare Documents;
- formatted Compare Text;
- several reviewed DOCX files in Combine Commentary;
- one text PDF and one scanned PDF;
- PDF thumbnails, navigation, search, zoom, text selection, and page organization;
- OCR progress, cancellation, English searchable output, and offline reuse after first preparation;
- drawn, selected-text, search, and regular-expression redaction marks;
- secure redaction output inspection, including absence of recoverable marked text where testable;
- sanitation presets, health report, form fill, reset, and flatten;
- mixed-file binder, item-level error continuation, bookmarks, table of contents, labels, and numbering;
- semantic conversion outputs and clear fidelity notices;
- batch status, error isolation, cancellation, individual saves, and ZIP output;
- File System Access save path where supported and download fallback;
- browser Back behavior where relevant;
- unsaved PDF navigation warning;
- Clear Local Workspace and optional-engine cache clearing;
- offline core use, stale-cache replacement, and update-ready behavior;
- Network interception after application assets load, confirming no filename, source bytes, extracted text, metadata, hash, or document-derived URL leaves the origin;
- Cache Storage inspection confirming that no document or arbitrary request was cached;
- visual clipping, overlap, blank states, horizontal overflow, tiny controls, and responsive navigation.

No entry in this placeholder should be treated as passed until the final report records the browser version, platform, fixture, outcome, and any defect resolution.

## Test boundaries

The passing Node suite does not by itself establish:

- browser rendering fidelity or PDF.js text-layer alignment;
- OCR accuracy for a particular scan, font, language, or page orientation;
- maximum-memory behavior for every device and browser;
- cryptographic PDF signature validity, certificate trust, or revocation status;
- exact Office conversion layout fidelity;
- repair of every malformed PDF;
- guaranteed PDF size reduction;
- successful password entry or encrypted PDF editing;
- complete accessibility of untagged source PDFs;
- runtime network behavior of a modified browser extension or compromised browser.

The 19 Playwright browser specifications are part of `npm run qa`, but their execution is pending CI for this recorded result. The mandatory manual browser verification above remains a separate release gate for this version even after automated Playwright passes.

## Conclusion

The production build, both established regression scripts, all 29 current Node unit tests, and all 4 dedicated privacy tests pass. All 19 Playwright specifications are discovered, but their execution and the complete `npm run qa` result remain pending CI. Manual Chrome and Edge verification is not yet documented as complete.
