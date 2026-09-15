# Mukorob PDF v0.7 — Bradz Internal Edition

Mukorob PDF is a local-first PDF Reader & Editor for Bradz Trading Enterprises CC (BTE Namibia), designed for controlled internal use.

## v0.7 improvements

- Modular ES-module entry point with separate feature modules for print, annotations, page organisation, autosave and browser-test hooks.
- **Native in-app printing:** no `window.open()` and no hidden PDF iframe. Mukorob builds a print surface in the current application context and invokes the browser's native print dialog.
- High-DPI PDF rendering with an adaptive bitmap-pixel cap for clearer scanned/image-based text without uncontrolled RAM usage.
- Selectable PDF text layer aligned to page rotation.
- Accurate per-page rotation with mixed page sizes.
- **Interactive e-signature:** place anywhere, drag to reposition, resize from the corner, and save/export the final position and size.
- **Interactive company stamp:** place anywhere, drag, resize, reposition and save/export.
- Visual **Page Organiser** with thumbnail grid, drag-and-drop page reordering, page deletion and duplicate-page workflow.
- Page reordering/deletion preserves existing annotations and per-page rotations where possible.
- **Local autosave/draft recovery** for the current document, annotations and page rotations.
- Recent documents store PDF bytes locally and reopen without requiring the original file picker when storage permits.
- User-scoped Recent and annotation storage.
- Super Admin-only administration with staff accounts and configurable permissions.
- Local audit log and CSV export.
- Persistent login until explicit logout.
- PWA installation for supported Windows/Android/iOS browsers and PDF file handling.
- Mukorob navy/gold/rock branding retained.

## Printing

Printing is implemented through `window.print()` in the current Mukorob page. Before the dialog opens, Mukorob renders the document pages into a print-optimised surface. This avoids the v0.6 iframe print failure seen in some Chromium-derived browsers such as Avast Browser.

## E-signature and company stamp

Signatures and stamps are stored as normalized page coordinates:

```text
x, y, width, height = 0..1 relative to the displayed page
```

This makes them independent of screen size and zoom. The on-screen controls support pointer/touch dragging and corner resizing. The same normalized geometry is used when exporting the edited PDF.

## Autosave

Autosave stores a local draft under the current signed-in user and document hash. Drafts include:

- PDF source bytes
- page rotations
- annotation geometry
- annotation content
- save timestamp

A newer draft can be restored when the same document is reopened. This is a recovery mechanism, not a replacement for the final `Save As`/export action.

## Security architecture

v0.7 remains a **local-device internal pilot**. Passwords are salted and hashed in browser Web Crypto. Users, sessions, permissions and audit records are still local to the device. This is not server-enforced enterprise authentication.

For production organisation-wide deployment, Mukorob PDF should move authentication, sessions, permissions, document sharing and audit authorization to a server-side Mukorob API/identity service. The Super Admin role must then be enforced server-side.

## Windows

The repository contains PowerShell helpers for the local desktop build:

- `serve.ps1` — local application server
- `open-pdf.ps1` — opens an associated PDF through the local server
- `install.ps1` — current-user installation, shortcuts and PDF association
- `uninstall.ps1` — removes the current-user installation

A separately signed enterprise installer should be produced for production distribution.

## Android

See `mobile/ANDROID-SETUP.md`. The recommended deployment is HTTPS + Chrome + Install/Add to Home screen.

## Testing

### Structural smoke tests

```text
node tests/smoke-test.mjs
```

These run locally without a browser and validate syntax, module wiring, critical controls, storage schema, print implementation, autosave and PWA configuration.

### Browser tests

Install Playwright in a development environment and run:

```text
npm install
npm run test:browser
```

Set `MUKOROB_BASE_URL` if the application is served somewhere other than `http://127.0.0.1:4173`.

The browser suite is designed to run against the real application in Edge/Chromium and should be included in CI before production releases.

## Recommended v0.8 priorities

1. Central Mukorob authentication/API with server-side authorization.
2. Central document storage and explicit document sharing.
3. Server-side audit trail and account revocation.
4. True cryptographic PDF signatures rather than a visual signature annotation.
5. OCR for scanned PDFs.
6. Stronger PDF editing pipeline with progress indicators for large files.
7. Automated browser tests on Windows Edge/Chrome and Android Chrome in CI.
8. Signed Windows installer and native mobile packaging where distribution requirements justify it.

## Ownership

**Bradz Trading Enterprises CC (BTE Namibia)**  
Product: Mukorob PDF  
Purpose: Internal document reading, editing and management
