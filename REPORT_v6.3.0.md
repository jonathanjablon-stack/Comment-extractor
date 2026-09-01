# Comment Master v6.3.0

## Release scope

Version 6.3.0 builds on the completed v6.2.0 application at commit `d8d03ba8e3f2181ad3a4725fbac44e33c250c92d`. It retains the v6.2 overview, quick author and metadata actions, Word comment report, link checking, review editing, exports, forensic tools, and surgical DOCX save model.

This release adds three browser-local workflows:

- Compare Documents creates a Word redline from an original and changed DOCX. Either side can use an uploaded file or the currently loaded document, including unsaved in-memory edits.
- Compare Text accepts formatted text in two rich editors and downloads a Word redline.
- Combine Commentary compares two to twelve reviewed versions independently against one base document, then merges their revisions and comments while retaining reviewer attribution.

## Implementation and fidelity controls

- Paragraphs are aligned before their words are compared, preventing small edits from becoming whole-document replacements.
- Structurally ordinary paragraphs receive word-level tracked insertions and deletions, including formatting-only edits.
- Existing tracked changes are accepted in comparison copies before new revisions are generated. The loaded source document is not mutated.
- Independent reviewer changes are computed from the same untouched base. Identical insertions are deduplicated and share attribution; conflicting alternatives remain separate.
- Comments are imported, assigned collision-free IDs, anchored to the corresponding output paragraph, and deduplicated by content and mapped location.
- Revision IDs are globally remapped and every new revision receives an author and UTC timestamp.
- Output starts from the original ZIP package. Only changed XML parts are replaced, and unrelated binary and custom XML entries retain their original decompressed bytes.
- Transitional and Strict WordprocessingML namespaces are supported.
- Formatted-text paste is sanitized locally. Scripts, images, remote links, embedded objects, and unsupported markup are removed; readable text and common formatting are retained.
- Safety limits prevent unbounded comparison work: 30,000 paragraphs per story, 50,000 tokens per paragraph, and 12 reviewed versions per combine operation.

## User interface changes

- A persistent Compare & Combine button is available before or after opening a document.
- The comparison dialog uses three task-focused tabs, explicit numbered source cards, concise output explanations, progress states, keyboard tab navigation, and responsive single-column layouts.
- The currently loaded document is clearly identified wherever it can be selected.
- Combine Commentary provides a file list, optional reviewer-name overrides, removal controls, duplicate-file protection, and a clear readiness count.

## Test report

Automated regression tests execute the actual embedded application and DOCX comparison engine. Covered scenarios include:

- embedded JavaScript syntax, unique DOM IDs, UI-to-action mappings, and comparison controls;
- exact output filenames and existing v6.2 Word and comment-report exports;
- word-level insertion, deletion, replacement, and formatting-only changes;
- existing tracked changes accepted before a new comparison;
- whole-paragraph insertion and deletion markup;
- complex hyperlink paragraph fallback;
- multiple independent reviewers, conflicting changes, and identical-change deduplication;
- comment import, relationship/content-type creation, location-aware deduplication, and ID resolution;
- preservation of unrelated binary media and custom XML;
- CRC validation, XML parsing, unique revision IDs, required revision attributes, and prohibition of nested revision wrappers;
- Transitional and Strict WordprocessingML output;
- independent opening of standard generated packages through `python-docx`.

Five representative generated DOCX packages were also unzipped and validated independently of Comment Master's parser. Every XML and relationship part parsed, all comment references resolved, and all ZIP CRC checks passed.

## Known limitations

- Paragraphs containing fields, drawings, content controls, hyperlinks, bookmarks, or other complex structures use whole-paragraph redlines when changed. This avoids unsafe partial XML reconstruction but can be less granular.
- Imported comments retain text, author, and date, but rich formatting and native threaded-comment structures are flattened. Replies receive an explanatory text prefix.
- Imported comments are anchored to the corresponding output paragraph rather than reconstructing an exact character range.
- Story parts present only in a reviewed version, with no matching base part, are reported and omitted.
- Microsoft Word and LibreOffice were not available in the test environment. Standard outputs opened with an independent Word library; Strict WordprocessingML was validated structurally because that library does not support Strict documents.

