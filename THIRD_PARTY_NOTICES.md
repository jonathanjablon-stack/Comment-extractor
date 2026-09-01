# Third-party notices

Comment Master distributes the following third-party software. This file records third-party terms only and does not grant a license to Comment Master itself.

The Pages build copies this notice to `/THIRD_PARTY_NOTICES.md` and copies the license files supplied by each package under `/vendor`. Source links below identify the corresponding upstream projects.

## Directly distributed components

| Component | Version | License used | Source | Deployed license |
| --- | ---: | --- | --- | --- |
| JSZip | 3.10.1 | MIT option from `(MIT OR GPL-3.0-or-later)` | <https://github.com/Stuk/jszip> | `/vendor/jszip/LICENSE.markdown` |
| PDF.js | 6.3.289 | Apache-2.0 | <https://github.com/mozilla/pdf.js> | `/vendor/pdfjs/LICENSE` |
| pdf-lib | 1.17.1 | MIT | <https://github.com/Hopding/pdf-lib> | `/vendor/pdf-lib/LICENSE` |
| Mammoth.js | 1.12.2 | BSD-2-Clause | <https://github.com/mwilliamson/mammoth.js> | `/vendor/mammoth/LICENSE` |
| Marked | 18.0.11 | MIT | <https://github.com/markedjs/marked> | `/vendor/marked/LICENSE` |
| DOMPurify | 3.4.14 | Apache-2.0 option from `(MPL-2.0 OR Apache-2.0)` | <https://github.com/cure53/DOMPurify> | `/vendor/dompurify/LICENSE` |
| Tesseract.js | 7.0.0 | Apache-2.0 | <https://github.com/naptha/tesseract.js> | `/vendor/tesseract/LICENSE` |
| tesseract.js-core | 7.0.0 | Apache-2.0 | <https://github.com/naptha/tesseract.js-core> | `/vendor/tesseract/core/LICENSE` |
| English Tesseract trained data | 1.0.0 | MIT, as declared by package metadata | <https://github.com/naptha/tessdata> | This file, under "English trained data MIT notice" |

The Tesseract minified files refer to generated license notices. Those notices are deployed beside the files as `/vendor/tesseract/tesseract.min.js.LICENSE.txt` and `/vendor/tesseract/worker.min.js.LICENSE.txt`.

## Components embedded in browser bundles

The published Mammoth.js browser bundle declares these embedded modules in its own license header: `@xmldom/xmldom` 0.8.6 (MIT), `base64-js` 1.5.1 (MIT), `bluebird` 3.4.7 (MIT), `buffer` 4.9.1 (MIT), `dingbat-to-unicode` 1.0.1 (BSD-2-Clause), `ieee754` 1.1.8 (BSD-3-Clause), `isarray` 1.0.0 (MIT), `jszip` 3.7.1 (MIT option), `lop` 0.4.2 (BSD-2-Clause), `option` 0.2.4 (BSD-2-Clause), `process` 0.11.9 (MIT), `underscore` 1.13.1 (MIT), and `xmlbuilder` 10.0.0 (MIT).

The JSZip browser bundle also contains Pako. Pako 1.0.11 is licensed under `(MIT AND Zlib)` and its supplied license is deployed as `/vendor/jszip/pako-LICENSE`.

The pdf-lib bundle contains TypeScript helper code whose Apache-2.0 notice remains in the minified file. PDF.js and DOMPurify also retain their upstream license banners in the deployed modules.

## Repository-only legacy artifacts

The source repository contains legacy browser artifacts that are not copied into the Pages build:

| File | Component | Version | License |
| --- | --- | ---: | --- |
| `FileSaver.min.js` | FileSaver.js | 2.0.5 | MIT |
| `xlsx.bundle.js` | xlsx-js-style, based on SheetJS | 1.2.0 / 0.18.5 | Apache-2.0 |
| `jszip.min.js` | JSZip | 3.10.1 | MIT option |

## English trained data MIT notice

The `@tesseract.js-data/eng` 1.0.0 package metadata identifies Balearica as the author and declares the package license as MIT. The package does not include a separate license file. The MIT terms are reproduced here with that package attribution:

Copyright (c) Balearica

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

