# Bundled PDF libraries

Mukorob PDF includes unmodified browser distributions from the pinned npm dependencies:

- PDF.js 3.11.174 (`pdfjs-dist`): `pdf.min.js`, `pdf.worker.min.js`. Apache 2.0 license in `pdfjs-LICENSE.txt`.
- pdf-lib 1.17.1 (`pdf-lib`): `pdf-lib.min.js`. MIT license in `pdf-lib-LICENSE.md`.

Files are served from the same site and included in the offline application cache. To refresh them, copy the matching browser builds from the versions in `package-lock.json`, retain the licenses, and run the browser/document tests.

Mukorob PDF is developed by Bradz Trading Enterprises CC.
