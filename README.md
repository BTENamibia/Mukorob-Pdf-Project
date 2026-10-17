# Mukorob PDF v0.10.0 — Bradz Internal Edition

Mukorob PDF is a local-first PDF Reader & Editor for Bradz Trading Enterprises CC (BTE Namibia), designed for controlled internal use.

## v0.10.0 — responsive zoom and document navigation

- Zoom resizes the existing bitmap immediately and sharpens nearby pages after a 140 ms pause. Duplicate requests are coalesced, superseded renders are cancelled, and only two page renders run concurrently. Distant pages remain virtualized.
- Native device-resolution rendering with a 6 MP mobile / 12 MP desktop bitmap budget, cached text content, and a selectable text layer that scales with the preview.
- Zoom preserves the visible document point where scrolling permits. Mixed page sizes and page rotation retain their own dimensions.
- Direct 30–400% entry on desktop and mobile, Ctrl/Cmd + mouse wheel anchored at the pointer, keyboard +/− and Ctrl/Cmd+0, and two-finger mobile pinch anchored at the gesture midpoint.
- Hand tool for dragging enlarged pages with a mouse or pen; touch keeps native one-finger scrolling.
- Document tools → Combine PDFs: visible file list with move-up/down ordering, saved as a new copy.
- Document tools → Extract pages: validated ranges, current rotations and annotations included, saved as a new copy. Combine/extract flatten interactive form values in the copy to avoid orphaned form widgets; the source remains editable.

This release improves the reader and existing workflows; it is not complete Adobe Acrobat feature parity. OCR, replacement of existing PDF text/images, Office conversion, secure redaction, certificate-based digital signatures, PDF/A validation, accessibility remediation and cloud collaboration remain separate implementation projects. A drawn signature is a visual annotation, not a certificate signature. No Adobe proprietary implementation is included.

## v0.9.2 — reliable opening and offline recovery

Repair and app pages now have separate cache entries. A missing offline shell shows a retry page instead of a browser network error. Cache storage failures no longer discard successful downloads. PDF.js 3.11.174 and pdf-lib 1.17.1 ship locally with their licenses so opening PDFs does not require a third-party CDN. Stored accounts, PDFs, drafts and settings are retained.

## v0.9.1 — update recovery

Installed-app updates now wait for the replacement worker, checkpoint edits before reloading, and report retryable failures. Opening the app fetches fresh application files with an offline fallback. Existing browser data is retained. If a previous release keeps showing its update prompt, open `recover.html` on the same site in the browser used for that installation, select **Repair and open Mukorob**, then reopen the installed app. The repair removes only Mukorob application responses and its worker registration; it preserves IndexedDB/localStorage, PDF files, unrelated caches and cached PDF libraries.

## v0.9.0 — official blue identity and document tools

The official logo is the blue square Mukorob rock/M emblem supplied by Bradz Trading Enterprises CC on 9 October 2026. The supplied JPEG is preserved unchanged as `icons/mukorob-official-blue.jpg`; PNG sizes and an Android-safe padded maskable icon are derived from it. The web header, dashboard, authentication screens, favicon, Apple touch icon, PWA launcher and shortcut icons use this identity. Old built-in branding references migrate automatically; custom administrator uploads remain intact.

- PDFs fit to the mobile screen on opening; fit controls respect current page rotation.
- Navy/blue/gold interface with Dark, Light, Sepia and High Contrast reading themes.
- **Document tools → Create PDF from images:** PNG/JPEG images become a new A4 PDF, one image per page, in selected order.
- **Document tools → Fill PDF form:** fill standard AcroForm text, checkbox, dropdown, radio and list fields; optionally flatten supported fields in the exported copy. Read-only fields remain read-only. XFA/scanned forms and certificate signing are not supported. Current text tools use the standard PDF Latin font encoding.
- **Document tools → Watermarks & page numbers:** add text and/or numbering to all pages or a validated range such as `1,3-5`. Output is a new copy; the open source stays unchanged.
- Save As includes current rotations and annotations. Export and native printing use one rotation-aware PDF pipeline for signatures, stamps, highlights, notes and ink.
- Local drafts recover before the Recent timestamp changes. Draft source bytes are restored along with annotations and page rotations. Writes wait for IndexedDB transaction commit, and checkpoints run before close and on backgrounding where the browser permits.
- Desktop and mobile browser regression tests exercise the actual PDF workflows with generated fixtures. Tests isolate external identity services and do not operate on live staff accounts.

### Installed app update and Android defaults

After this release is published at the existing HTTPS hosting address, reopen Mukorob and accept its update prompt. Android/Chrome controls when the installed launcher icon refreshes; changing the web files does not immediately replace every already-installed icon. Do not clear browser storage or uninstall without an encrypted backup, because local Recent documents and drafts belong to that browser profile.

The current repository is a PWA, not a native Android APK. Chrome's PWA File Handling API is currently desktop-only; adding PDF entries to the web manifest does **not** register an Android default PDF viewer. Use Open PDF inside Mukorob on Android for now. A signed native Android package with PDF ACTION_VIEW/content-URI handling is required for an Android default-viewer release. Mukorob does not yet open Word, Excel or all other document formats.

### Current identity architecture

The code already contains a Supabase identity bridge plus local-account fallback. PDFs, drafts and Recent remain local. The checked-in SQL foundation and identity bridge currently use different company table/field names; the deployed schema and privileged admin Edge Function must be reconciled and independently verified before claiming production central authorization. The Edge Function source is not included here. Local fallback is retained for compatibility in this release.

## v0.8.0 branding and icon release

- Added the modern horizontal **Mukorob PDF Reader & Editor** brand mark.
- Added the icon-only Mukorob heritage emblem for app icons, PWA launchers, authentication and social/app contexts.
- Removed the old “One Platform. One Organisation. One View.” wording from the visual application branding.
- Header/dashboard branding and login icon/background remain independently configurable.

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

## Updates and device data

- Mukorob PDF now checks the published repository version and shows an **Update available** prompt on supported online PWA/browser installations.
- PWA updates refresh application files without deleting the browser's IndexedDB/localStorage data. Users, settings, Recent PDFs, annotations and drafts remain in the same browser profile.
- Browser/device storage is **not shared automatically** between Avast, Chrome, Edge, Android Chrome, iOS browsers or separate Windows browser profiles. Moving an existing installation still requires the encrypted **Backup & Migration** workflow described above.
- On the Windows local build, the application also checks for a newer release. When one is available, the user is directed to close Mukorob PDF and run **Mukorob PDF Update** from the Desktop or Start Menu. The updater downloads the latest repository package and replaces application files without intentionally removing browser-stored Mukorob data.
- Version metadata is maintained in `VERSION.txt`; each release should increment that file and deploy the corresponding application/service-worker changes.

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

The compatibility local-account path remains a **local-device internal pilot**. Passwords are salted and hashed in browser Web Crypto. Local fallback users, permissions and audit records remain device-local; the Supabase bridge adds central identity but requires backend verification. The encrypted migration feature protects exported local data, but it does not replace server-enforced authentication.

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
npm ci
npx playwright install chromium
npm run test:browser
```

The repository also contains a GitHub Actions QA workflow that runs structural tests and Chromium browser smoke tests on pushes and pull requests to `main`.

## Next major priorities

1. Validate v0.7.4 Avast → Chrome encrypted migration with the real Bradz dataset before any destructive changes.
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
Developer: Bradz Trading Enterprises CC
Product: Mukorob PDF  
Purpose: Internal document reading, editing and management
