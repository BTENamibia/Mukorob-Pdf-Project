# Mukorob PDF v0.7

## Bradz Internal Edition

### v0.7.1
- Added a backward-compatible IndexedDB schema upgrade without deleting existing local stores.
- Added encrypted Super Admin local backup and browser-migration support using PBKDF2-SHA256 and AES-256-GCM.
- Backup deliberately excludes the active browser session token.
- Added migration coverage for users, settings, legacy/scoped recent data, annotations, drafts, audit records, and supported local document/share stores.
- Added a Super Admin-only Backup & Migration control in the application interface.
- Added explicit restore confirmation and post-restore reload.
- Fixed runtime use of the scoped recent/annotation stores in the browser database layer.
- Added persistent on-screen Rotate Left/Rotate Right controls that remain available while a document is open.
- Fixed signature and company-stamp placement so they can be dragged and resized without being redrawn during the gesture.
- Added explicit delete controls and Delete/Backspace removal for signatures and company stamps.
- Fixed duplicate signature rendering caused by overlapping legacy and interactive annotation layers.
- Made signature/stamp overlays follow page rotation while preserving document coordinates for PDF export.
- Added mouse/touch document panning inside the viewer.
- Added mobile pinch-to-zoom support.
- Added four independent branding spaces: header logo, dashboard logo, login background logo, and login icon logo.
- Hardened the PWA cache/update path so Chrome and mobile installations can detect the latest application assets instead of remaining on an old service-worker cache.
- Version marker remains `0.7.1`.

### v0.7.0
- Reorganised the application entry point into a modular ES-module feature layer while preserving the stable v0.6 core.
- Replaced iframe-based printing with an in-app browser-native print surface using `window.print()`.
- Added interactive, draggable and resizable e-signature and company-stamp annotations.
- Signature/stamp positions and sizes persist locally and are included in edited PDF export.
- Added visual Page Organiser with drag-and-drop reordering and page deletion.
- Added local draft autosave and recovery.
- Added browser-test hooks and an automated Playwright test suite scaffold.
- Added print, annotation, page-organisation and autosave audit events.
