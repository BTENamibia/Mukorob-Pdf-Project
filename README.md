# Mukorob PDF v0.5 — Bradz Internal Edition

Mukorob PDF is a local-first PDF Reader & Editor branded for Bradz internal use.

## v0.5 highlights
- Professional Mukorob navy/gold/rock branding
- High-DPI PDF rendering and selectable text layer
- Zoom, fit width/page, page navigation, search and fullscreen
- Print button and print action in PDF tools
- Accurate per-page on-screen rotation with rotation preserved on Save/Export
- PDF page editing: rotate, delete, move, extract, merge
- Save As and edited PDF export
- E-signature and company stamp tools
- Recent-file delete controls on the home screen and Recent tab
- Super Admin-only administration
- Staff accounts with user IDs, passwords and configurable permissions
- Staff self-service password reset using a private recovery code
- Super Admin password reset for staff
- Persistent login until explicit logout
- PWA install support for Windows/Android/iOS-capable browsers
- Windows local-server helper (`serve.ps1`) for the installed desktop build

## Security note
The v0.5 account system is local-device authentication for controlled internal use. It is not a substitute for a server-side identity provider. For organisation-wide deployment, move users, sessions, permissions and audit logs to the Mukorob server/API so Super Admin authorization is enforced outside the browser.

## Windows
Run `Mukorob-PDF-Setup.exe` from the distribution package. The installer places the application under `%LOCALAPPDATA%\\Mukorob PDF`, creates Start Menu/Desktop shortcuts, registers PDF files for the current Windows user, and starts the local server through PowerShell.

## Android
See `mobile/ANDROID-SETUP.md`. The recommended deployment is HTTPS + Chrome + Install/Add to Home screen.
