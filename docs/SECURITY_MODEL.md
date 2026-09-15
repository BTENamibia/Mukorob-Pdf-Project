# Mukorob PDF v0.6 security model

## Current internal pilot

Mukorob PDF v0.6 uses local browser storage for users, permissions, Recent documents, annotations and audit entries.

### Protections implemented
- Passwords are salted and derived with PBKDF2-SHA-256.
- Super Admin is the only role allowed to open the administration panel.
- Super Admin receives all permissions automatically.
- Staff permissions are checked before sensitive UI actions.
- Recent documents and annotations are scoped by signed-in user ID.
- Legacy v0.5 document history is migrated only to the Super Admin account.
- The internal access code is not exported with staff configuration files.
- Recent cache is bounded.
- Local audit records capture key security/workflow events.

## What local authentication cannot guarantee

A static/PWA application cannot make a browser-stored account system tamper-proof. A user with developer tools, filesystem access to the browser profile, or modified application JavaScript can potentially bypass client-side checks.

Therefore v0.6 is suitable for a controlled Bradz pilot, not as the final security boundary for confidential enterprise documents.

## v1.0 security target

Move these controls to a server/API:

- authentication
- sessions and refresh tokens
- user lifecycle
- password reset
- role/permission enforcement
- document ownership
- document sharing
- audit logs
- stamp/signature authorization

The server must reject unauthorized operations even if the client UI is modified.

## Important cryptography distinction

The current e-signature is a visual signature annotation. It is not a cryptographic PDF digital signature with certificate validation. A production signing workflow should use certificate-backed signatures and a secure signing/key-management service.
