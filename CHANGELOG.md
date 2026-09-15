# Mukorob PDF v0.7

## Bradz Internal Edition

### v0.7.0
- Reorganised the application entry point into a modular ES-module feature layer while preserving the stable v0.6 core.
- Replaced iframe-based printing with an in-app browser-native print surface using `window.print()`.
- Added interactive, draggable and resizable e-signature and company-stamp annotations.
- Signature/stamp positions and sizes persist locally and are included in edited PDF export.
- Added visual Page Organiser with drag-and-drop reordering and page deletion.
- Added local draft autosave and recovery.
- Added browser-test hooks and an automated Playwright test suite scaffold.
- Added print, annotation, page-organisation and autosave audit events.

