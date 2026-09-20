# Mukorob PDF v0.7.4 — Central Identity & Pilot

Mukorob PDF remains local-first for PDF files, annotations, drafts and offline application state, but identity is now backed by Supabase Auth so the same registered account can be used on Windows, web and mobile/PWA.

## Supabase project
- Project: Mukorob-Core
- Region: eu-west-2
- Identity endpoint: the project Supabase URL
- Client uses the Supabase publishable key only. No service-role key is shipped to the browser.

## Pilot organisations
1. Hydraform Interlocking Solutions CC — Construction and Building
2. Stratsure Insurance (Pty) Ltd. — Insurance Agency

Each organisation was created with a 30-day pilot window beginning 20 September 2026 and ending 20 October 2026.

## Identity model
- Supabase Auth owns passwords and sessions.
- `profiles` stores Mukorob user identity and role.
- `organization_members` stores company membership and permissions.
- IndexedDB remains an offline/local cache and must not be treated as the authoritative cross-device user directory.
- Existing local users can be migrated on first central sign-in. Their password hash is never copied to Supabase; the entered password is used to establish a new Supabase Auth credential.
- Super Admin provisions new pilot users through the protected `mukorob-admin` Edge Function.

## Security
- Row Level Security is enabled on all pilot tables.
- The Edge Function requires a valid authenticated JWT and checks the caller's central Super Admin profile before creating users.
- The service-role credential exists only in the Edge Function runtime and is never included in the browser application.
- Security advisors were re-run after the migration; no security lints remain.

## Important first-run setup
For the existing local Super Admin to migrate automatically using the same user ID/password, the Supabase Auth project must allow the internal password-signup migration without requiring an email confirmation to an artificial `@users.mukorob.app` address. If email confirmation remains enabled, use a real recovery/invitation flow before migrating staff.

## Pilot workflow
1. Super Admin signs in centrally.
2. Super Admin registers each staff member and selects Hydraform or Stratsure.
3. The central Edge Function creates the Auth account, profile and company membership.
4. Staff use the same user ID/password on any supported device.
5. Trial status and company membership are checked centrally.
6. Pilot feedback will be stored in `feedback_reports` and used for the Mukorob improvement programme.
