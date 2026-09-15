# Mukorob PDF v0.7.1 — Bradz Internal Edition

Mukorob PDF is a local-first PDF Reader & Editor for Bradz Trading Enterprises CC (BTE Namibia), designed for controlled internal use.

## v0.7.1 improvements

- Added a backward-compatible local IndexedDB migration layer; existing stores are retained.
- Added **Super Admin-only encrypted Backup & Migration** for moving Mukorob local data between browsers/devices.
- Backups use PBKDF2-SHA256 key derivation and AES-256-GCM encryption.
- The active browser session token is deliberately excluded from backups.
- Migration covers the stores present in the source local database, including users, settings, recent data, annotations, drafts and audit/application records that are compatible with the destination schema.
- Added a **first-run restore path** so an empty Chrome installation can restore an existing Mukorob backup without creating a replacement Super Admin first.
- Restore requires the backup password and explicit confirmation before merging records.
- Added automated structural and browser smoke-test coverage plus GitHub Actions QA.

## v0.7 browser features

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

## v0.7.1 browser migration workflow

For the current internal pilot, browser storage is local to each browser. If existing users are in Avast Browser and Chrome is being adopted:

1. **Do not clear Avast Browser site data.**
2. Open Mukorob PDF in Avast and sign in as Super Admin.
3. Open **Backup & Migration** and create an encrypted backup using a strong backup password (minimum 12 characters).
4. Keep the `.mkb.json` backup file somewhere secure and separate from the browser.
5. Open Mukorob PDF in Chrome.
6. If Chrome is empty, use **Already have a Mukorob installation? → Restore existing Mukorob backup** on the Super Admin setup screen. Do **not** create a replacement Super Admin first.
7. If Chrome already contains Mukorob users, sign in as Super Admin and use **Backup & Migration → Restore backup**.
8. Reload Mukorob PDF and verify the original Super Admin and staff accounts, permissions and expected local data before retiring the Avast copy.

The migration backup is a **browser-transfer mechanism**, not a server backup. It does not make the current local-first authentication architecture enterprise-grade.

## Printing

Printing is implemented through `window.print()` in the current Mukorob page. Before the dialog opens, Mukorob renders the document pages into a print-optimised surface. This avoids the v0.6 iframe print failure seen in some Chromium-derived browsers such as Avast Browser.

## E-signature and company stamp

Signatures and stamps are stored as normalized page coordinates:

```text
x, y, width, height = 0..1 relative to the displayed page
```

This makes them independent of screen size and zoom. The on-screen controls support pointer/touch dragging and corner resizing. The same normalized geometry is used when exporting the edited PDF.

## Autosave

Autosave stores a local draft under the current signed-in user and document hash. Drafts include PDF source bytes, page rotations, annotation geometry, annotation content and save timestamp. A newer draft can be restored when the same document is reopened. This is a recovery mechanism, not a replacement for the final `Save As`/export action.

## Security architecture

v0.7.1 remains a **local-device internal pilot**. Passwords are salted and hashed in browser Web Crypto. Users, sessions, permissions and audit records are still local to the device. The encrypted migration feature protects exported local data, but it does not replace server-enforced authentication.

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
npm test
```

### Browser tests

```text
npm install
npm run test:browser
```

The repository also contains a GitHub Actions QA workflow that runs structural tests and Chromium browser smoke tests on pushes and pull requests to `main`.

## Next major priorities

1. Validate v0.7.1 Avast → Chrome encrypted migration with the real Bradz dataset before any destructive changes.
2. Central Mukorob authentication/API with server-side authorization.
3. Central document storage and explicit document sharing.
4. Server-side audit trail and account revocation.
5. True cryptographic PDF signatures rather than a visual signature annotation.
6. OCR for scanned PDFs.
7. Stronger PDF editing pipeline with progress indicators for large files.
8. Automated browser tests on Windows Edge/Chrome and Android Chrome in CI.
9. Signed Windows installer and native mobile packaging where distribution requirements justify it.

## Ownership

**Bradz Trading Enterprises CC (BTE Namibia)**  
Product: Mukorob PDF  
Purpose: Internal document reading, editing and management
