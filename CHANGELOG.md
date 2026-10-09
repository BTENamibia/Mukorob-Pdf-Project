## v0.9.2 — loading and recovery

- Keep repair navigation separate from the offline app shell.
- Show a retry page when the offline shell is missing.
- Serve successful downloads even if cache writes fail.
- Ship licensed PDF libraries locally for reliable startup and offline use.
- Preserve local accounts, documents, drafts, sessions and settings.

## v0.9.1 — installed app update recovery

- Fetch the opening page from the network with an offline fallback instead of retaining the previous release.
- Bound and parallelise local worker installation; third-party CDN requests no longer block activation.
- Verify the installed worker version before reloading, save drafts first, and show retryable errors.
- Retain IndexedDB/localStorage and unrelated caches; preserve cached PDF libraries.

## 0.9.0 — 2026-10-09

- Adopt the supplied official blue Mukorob logo throughout web/mobile branding and themes.
- Add valid PNG launcher, favicon, Apple and maskable icons; migrate built-in branding references without replacing custom uploads.
- Add PDF images, AcroForm filling/flattening, watermarks and page numbering.
- Unify rotation-aware Save As, annotation export and native printing.
- Fix draft recovery ordering, restore stored bytes and checkpoint before close/backgrounding.
- Resolve local writes only after database transaction commit; close the open document on central logout.
- Add real PDF-engine tests and desktop/mobile browser workflow regressions.
- Retain developer credit: Bradz Trading Enterprises CC.

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
