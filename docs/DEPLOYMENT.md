# GitHub Pages deployment

## Production model

Comment Master is deployed as a static site from the generated `dist/` directory. End users open the GitHub Pages URL in a browser. They do not install Node.js, run a local server, install an application, or connect to a document-processing backend.

The canonical production entry remains `index.html`, so existing repository-root Pages bookmarks continue to resolve through the generated artifact.

## Prerequisites

- The canonical repository default branch is `main`.
- GitHub Pages Source is set to **GitHub Actions** in repository Settings, Pages.
- The committed `package-lock.json` matches `package.json`.
- Repository Actions are allowed to use the pinned actions in `.github/workflows/pages.yml`.
- No deployment secret is required for the standard GitHub Pages flow.

The workflow uses Node.js 24 and `npm ci --ignore-scripts --no-audit --fund=false`. GitHub Actions dependencies are pinned to full commit SHAs.

## Production artifact

`npm run build` creates this top-level layout:

```text
dist/
  index.html
  service-worker.js
  manifest.webmanifest
  asset-manifest.json
  THIRD_PARTY_NOTICES.md
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

The build uses an explicit source-to-destination allowlist. It does not publish tests, archived HTML files, npm metadata, source maps, repository administration files, or arbitrary root files.

`asset-manifest.json` records:

- schema version;
- Comment Master version;
- content-derived build ID;
- exact core and optional cache groups;
- every output path, byte size, and SHA-256 digest.

The service-worker cache names include both product version and build ID, so a byte-level application change creates a new cache namespace even if a developer forgets to change the semantic version.

## Local release verification

Install exactly the locked dependencies and run the release contract:

```bash
npm ci --ignore-scripts --no-audit --fund=false
npx playwright install chromium
npm run qa
```

`npm run qa` performs:

1. the production build;
2. the established Word and export regression scripts;
3. the Node unit suites for workbench core, PDF engine, fixture determinism, Word v7 regressions, and privacy-sensitive link behavior;
4. the dedicated source and generated-artifact privacy suite;
5. 19 Playwright Chromium browser specifications.

To inspect only the production assembly:

```bash
npm run build
```

The repository also contains 19 Playwright Chromium specifications:

```bash
npx playwright install chromium
npm run test:e2e
```

The suite builds `dist/`, serves it only on `127.0.0.1`, and tests desktop and mobile Home, routing, local fixtures, navigable comparison output, PDF work, OCR, redaction, sanitation, binder, conversion, batch inspection, Clean Word, external request interception, exact Cache Storage allowlists, and offline reload. It is included in `npm run qa`. The Pages workflow invokes the lockfile-installed Playwright CLI to install its matching Chromium browser and runner dependencies before the full QA contract. Do not describe a local run as passing when the browser executable or another environment prerequisite prevents execution.

For local development preview, serve `dist/` through any trusted static HTTPS or loopback development server. Direct `file:` opening is not a full production test because JavaScript modules, workers, File System Access, and service workers have browser-specific restrictions. A local server is a contributor tool only and is not required for end users.

Do not edit files inside `dist/`. Change source files and rebuild.

## GitHub Actions flow

`.github/workflows/pages.yml` runs for pull requests to `main`, pushes to `main`, and manual dispatch.

### Build job

The build job:

1. checks out source without persisting credentials;
2. installs Node.js 24 with npm caching;
3. installs the committed lockfile with lifecycle scripts disabled;
4. invokes the lockfile-installed Playwright CLI and installs its matching Chromium browser plus required runner dependencies;
5. runs `npm run qa`, including the browser suite;
6. verifies the expected top-level artifact layout and absence of symlinks;
7. verifies that service-worker template placeholders are gone;
8. hashes every output file;
9. rebuilds and requires the second full hash listing to match;
10. uploads `dist/` as the Pages artifact only for a push to `main`.

Pull requests receive the build and test checks but do not receive Pages deployment credentials and do not upload a deployable Pages artifact.

### Deploy job

The deploy job runs only for a non-pull-request event on `refs/heads/main` after the build job succeeds. Its permissions are limited to `pages: write` and `id-token: write`. It deploys the previously uploaded static artifact into the `github-pages` environment.

The build job itself has read-only repository contents permission.

## Release procedure

1. Pull the current `main` and confirm the worktree contains only intended release changes.
2. Confirm `package.json`, UI version strings, service-worker build input, `CHANGELOG.md`, and release documentation agree on the version.
3. Run `npm ci --ignore-scripts --no-audit --fund=false` from a clean dependency state when practical.
4. Run `npm run qa` and require zero failures.
5. Exercise the release build in current Chrome and Edge using synthetic fixtures.
6. Check Home, one DOCX, one PDF, two DOCX files, several mixed files, OCR, redaction, page operations, form work, clean copies, conversion, binder, batch, cancellation, saving, and keyboard navigation.
7. Check browser Network after initial asset loading and confirm local document processing emits no document-derived request.
8. Check Cache Storage and confirm only allowlisted application assets are present.
9. Disconnect from the network and verify cached core behavior. Also verify OCR and Mammoth conversion after each has completed one successful online preparation.
10. Commit the release and push `main`, or follow repository branch protection and merge an approved pull request.
11. Wait for the `Test and deploy Pages` workflow to finish successfully.
12. Verify the live artifact as described below.

## Live verification

For the current repository, the expected base URL is:

```text
https://to-shreds.github.io/Comment-extractor/
```

Basic artifact checks:

```bash
base=https://to-shreds.github.io/Comment-extractor

curl -fsS "$base/asset-manifest.json" | jq '.version, .buildId'
curl -fsS "$base/THIRD_PARTY_NOTICES.md" >/dev/null
curl -fsS "$base/service-worker.js" | sha256sum
curl -fsS "$base/asset-manifest.json" |
  jq -r '.files["./service-worker.js"].sha256'
```

The computed service-worker digest should equal the manifest value. The manifest version should equal the release version.

Browser checks:

- Open DevTools Application and verify a service worker is installed for the repository scope.
- Verify core and optional cache names include the manifest build ID.
- Open a local document and confirm it does not appear in Cache Storage.
- Confirm no third-party runtime script, worker, WebAssembly, language model, or font request occurs.
- Reload online, then offline, and confirm the exact cached entry opens.
- Invoke OCR once online, reload offline, and confirm the English engine can be reused.
- Invoke DOCX semantic conversion once online, reload offline, and confirm the cached Mammoth bundle can be reused.

## Service-worker updates

The application does not force an installed worker to take control of active sessions. A newly installed worker follows the standard waiting lifecycle. The UI reports that an update is ready and allows the user to reload when convenient.

After the old clients close, the new worker activates, deletes older Comment Master asset caches, and uses the new build-specific allowlists. It does not clear current in-memory work, local files, browser downloads, unrelated caches, or user storage.

If a release changes optional engine paths or versions, the build ID and optional cache name change automatically. Users can also clear the current optional-engine cache from the Tools workspace.

## Static path requirements

Production source and worker URLs are repository-relative, not domain-root absolute. This is required for project Pages under `/Comment-extractor/` and for forks deployed under another repository name.

Do not introduce:

- runtime CDN URLs;
- dynamic imports from third-party origins;
- document uploads or remote conversion calls;
- a route that depends on server-side rewriting;
- service-worker caching for arbitrary same-origin URLs;
- absolute `/assets` or `/vendor` paths that ignore the Pages project prefix.

If a custom domain is added, keep all application assets on the same origin or update the privacy and Content Security Policy review before deployment.

## Rollback

Use source control for rollback:

1. Revert the faulty release commit or restore a known-good source commit through the repository's normal policy.
2. Run `npm run qa` on the rollback commit.
3. Push or merge the rollback to `main`.
4. Wait for the Pages workflow to create and deploy the prior content under a new content-derived build ID.

Do not manually upload a stale `dist/` directory or edit the live Pages artifact. A source-controlled rebuild preserves auditability and ensures the service-worker cache version matches the deployed files.

## Troubleshooting

### Build is not deterministic

- Confirm no timestamps, random values, host paths, or dependency-generated transient files enter `dist/`.
- Confirm `package-lock.json` is committed and `npm ci` is used.
- Compare the two sorted SHA-256 listings produced by the workflow.
- Verify vendor source versions have not changed outside the lockfile.

### Pages shows the old application

- Confirm the deployment job succeeded and inspect its published URL.
- Compare the live manifest build ID with the workflow build log.
- Close all tabs in the old service-worker scope, then reopen the site.
- In a development browser only, unregister the old worker and reload to diagnose lifecycle issues.

### Offline mode fails

- Confirm the site was loaded successfully over HTTPS at least once.
- Confirm the worker completed installation rather than leaving a partial cache.
- Confirm requested core URLs exactly match the build-generated allowlist.
- Remember that OCR and Mammoth are optional and require one successful preparation before offline use.

### Optional engine preparation fails

- Confirm the requested Tesseract or Mammoth file exists in `dist/vendor/` and in `asset-manifest.json`.
- Confirm GitHub Pages serves WebAssembly with an acceptable content type. Tesseract's loader has a JavaScript fallback wrapper, but incorrect static hosting headers can still affect startup.
- Clear cached optional engines and retry while online.

### A local document appears in network or cache logs

Stop the release. Record the exact request URL, initiator, request body, headers, and active service-worker version. Do not ship until the path is removed and a regression test proves the corrected behavior.
