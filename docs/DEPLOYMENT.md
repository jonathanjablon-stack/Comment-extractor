# GitHub Pages deployment

## Production model

Comment Master is a static site published directly from the root of the `main` branch. GitHub Pages serves the committed `index.html`, `assets/`, `vendor/`, service worker, manifest, and notices. There is no custom deployment workflow and no server-side document processing.

End users open the Pages URL in a browser. They do not install Node.js, run a local server, install an application, or connect to a document-processing backend.

The expected URL is:

```text
https://to-shreds.github.io/Comment-extractor/
```

## Repository settings

Configure GitHub Pages in repository Settings, Pages with:

- **Source:** Deploy from a branch
- **Branch:** `main`
- **Folder:** `/ (root)`

GitHub may display its built-in Pages publication job after a push. That job is GitHub's branch-publishing mechanism, not a custom Comment Master Action. The repository does not require `.github/workflows/pages.yml`.

## Committed production files

The runtime published from `main` has this root layout:

```text
index.html
manifest.webmanifest
service-worker.js
asset-manifest.json
THIRD_PARTY_NOTICES.md
.nojekyll
assets/
  workbench.css
  workbench.js
  workbench-core.mjs
  pdf-engine.mjs
vendor/
  dompurify/
  jszip/
  mammoth/
  marked/
  pdfjs/
  pdf-lib/
  tesseract/
```

The PDF.js directory includes its worker, character maps, standard fonts, color profile, and local image decoders. The decoder assets allow image-heavy scans, including JPEG 2000 and JBIG2 content, to remain visible during viewing and OCR.

The committed `asset-manifest.json` records the Comment Master version, a content-derived build ID, exact cache groups, and the path, byte size, and SHA-256 digest of each packaged runtime file other than the manifest itself. Service-worker cache names include both the version and build ID.

The application runtime contains only static assets. It does not contain user documents, document-derived data, analytics, or an upload path.

Branch publishing can make other tracked, non-hidden repository files reachable as static files even when the application never links to them. Do not commit secrets, real documents, confidential fixtures, obsolete distributable bundles, or archived application entries to the published branch. Version 7.0.1 removes the prior root-level legacy bundles and archived entry files; Git history remains the archive.

## Build and root synchronization

Install the locked dependencies and prepare the Pages runtime locally:

```bash
npm ci --ignore-scripts --no-audit --fund=false
npm run build:pages
```

`npm run build:pages` performs the deterministic build in `dist/`, then runs `tools/sync-pages.mjs`. The synchronization step:

1. replaces the committed root `assets/` and `vendor/` trees with the generated versions;
2. copies `service-worker.js` and `asset-manifest.json` to the repository root;
3. verifies that the root `index.html`, `manifest.webmanifest`, and `THIRD_PARTY_NOTICES.md` match the production build;
4. creates or verifies `.nojekyll` so GitHub Pages serves every runtime asset without Jekyll filtering.

`dist/` remains ignored local build output. GitHub Pages does not serve it. Do not hand-edit generated root files under `assets/`, `vendor/`, `service-worker.js`, or `asset-manifest.json`; change source or build inputs and run `npm run build:pages` again.

The build uses a fixed allowlist and does not copy tests, archived HTML, package-manager metadata, source maps, or arbitrary files into the synchronized runtime directories. The repository still contains source, synthetic tests, and documentation, which branch-based Pages may serve as ordinary static files. None of those files may contain real user documents or secrets.

## Release verification

Prepare Playwright once in a new development environment, then run the release contract locally:

```bash
npx playwright install chromium
npm run qa
npm run build:pages
```

`npm run qa` performs:

1. the deterministic production build;
2. the established Word and export regression scripts;
3. the Node unit suites for workbench core, PDF engine, fixtures, Word regressions, and privacy-sensitive link behavior;
4. the privacy and offline source and artifact suite;
5. 19 Playwright Chromium browser specifications.

The browser suite serves generated files only on `127.0.0.1`. That loopback server is a contributor test tool and is not part of the deployed application.

Before publishing:

1. Pull the latest `main` and confirm the worktree contains only intended changes.
2. Confirm package, UI, manifest, cache, changelog, and documentation versions agree.
3. Run `npm run qa` and require zero failures.
4. Run `npm run build:pages` and inspect the root runtime diff.
5. Audit all tracked root content for secrets, real documents, or obsolete browser artifacts that direct branch publishing would expose.
6. Exercise the prepared root application in current Chrome and Edge using synthetic fixtures.
7. Verify Home, DOCX review, DOCX comparison, PDF viewing, scanned-page rendering, OCR, redaction, page operations, cleanup, conversion, binder, batch, cancellation, saving, and keyboard navigation.
8. After initial assets load, confirm document work sends no document bytes, text, filenames, metadata, hashes, or document-derived URLs to any external origin.
9. Confirm Cache Storage contains only allowlisted application assets.
10. Verify core use offline. Verify OCR and semantic DOCX conversion offline after their optional engines have each been prepared once.
11. Commit the source changes and synchronized root runtime together, then push `main` or follow any applicable branch-protection policy.
12. Wait for GitHub's built-in Pages publication to complete, then verify the live site.

No custom GitHub Action is required to build, test, or deploy the application. Those checks remain a local release responsibility unless the repository owner later chooses to add separate CI.

## Live verification

Basic artifact checks:

```bash
base=https://to-shreds.github.io/Comment-extractor

curl -fsS "$base/asset-manifest.json" | jq '.version, .buildId'
curl -fsS "$base/THIRD_PARTY_NOTICES.md" >/dev/null
curl -fsS "$base/service-worker.js" | sha256sum
curl -fsS "$base/asset-manifest.json" |
  jq -r '.files["./service-worker.js"].sha256'
```

The computed service-worker digest should equal the manifest value. The manifest version should equal the intended release version.

Browser checks:

- Verify the Home screen and navigation load without missing assets.
- Open DevTools Application and verify a service worker is installed for the repository scope.
- Confirm core and optional cache names include the manifest build ID.
- Open a local document and confirm it does not appear in Cache Storage.
- Confirm no runtime script, worker, WebAssembly module, OCR data, font, or decoder is requested from a third-party origin.
- Open a scanned JPEG 2000 or JBIG2 PDF and confirm the source page remains visible before and after OCR.
- Reload online, then offline, and confirm the cached application opens.
- Invoke OCR once online, reload offline, and confirm the English engine can be reused.

## Service-worker updates

The application does not force a newly installed worker to take control of an active session. The UI reports that an update is ready and allows the user to reload when convenient.

After old clients close, the new worker activates, deletes older Comment Master asset caches, and uses the new exact allowlists. It does not clear current in-memory work, local files, browser downloads, unrelated caches, or user storage.

If a release changes optional engine paths or versions, the build ID and optional cache name change automatically. Users can clear the optional-engine cache from the Tools workspace.

## Static path requirements

Runtime URLs are repository-relative, not domain-root absolute. This is required for project Pages under `/Comment-extractor/` and for forks deployed under another repository name.

Do not introduce:

- runtime CDN URLs;
- dynamic imports from third-party origins;
- document uploads or remote conversion calls;
- a route that depends on server-side rewriting;
- service-worker caching for arbitrary same-origin URLs;
- absolute `/assets` or `/vendor` paths that ignore the Pages project prefix.

If a custom domain is added, keep all application assets on the same origin or repeat the privacy and Content Security Policy review before deployment.

## Rollback

Use source control for rollback:

1. Revert the faulty release commit or restore a known-good commit through the repository's normal policy.
2. Run `npm run qa` and `npm run build:pages` on the rollback source.
3. Confirm that the synchronized root runtime matches the restored source.
4. Push or merge the rollback to `main` and wait for GitHub's built-in Pages publication.

Do not replace only `index.html` with an older copy while leaving incompatible root assets in place. The entry file, assets, manifest, and service worker form one versioned runtime.

## Troubleshooting

### Pages shows the old application

- Confirm the latest commit contains the synchronized root runtime.
- Compare the live and committed manifest build IDs.
- Wait for GitHub's built-in Pages publication to finish.
- Close all tabs in the old service-worker scope, then reopen the site.
- In a development browser only, unregister the old worker and reload to diagnose lifecycle behavior.

### A scanned PDF loads with blank page content

- Confirm `vendor/pdfjs/wasm/`, `vendor/pdfjs/cmaps/`, `vendor/pdfjs/standard_fonts/`, and `vendor/pdfjs/iccs/` are present at the live origin.
- Confirm the live PDF.js configuration points to those repository-relative directories.
- Check the browser console for a missing JPEG 2000, JBIG2, font, character-map, or color-profile asset.
- Run `npm run build:pages` again and commit the complete synchronized PDF.js runtime rather than only the entry file.

### Offline mode fails

- Confirm the application loaded successfully over HTTPS at least once.
- Confirm worker installation completed rather than leaving a partial cache.
- Confirm requested core URLs exactly match the committed manifest allowlist.
- Remember that OCR and Mammoth are optional and require one successful preparation before offline use.

### A local document appears in network or cache logs

Stop the release. Record the request URL, initiator, request body, headers, and active service-worker version. Do not publish until the path is removed and a regression test proves the corrected behavior.
