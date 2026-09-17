# Mukorob PDF — Central Authentication Plan

## v0.7.1 internal edition
The current Bradz internal build is local-first. User accounts and local session state live in the browser's IndexedDB/local storage, so the same account does not automatically exist in another browser/device. The encrypted Backup & Migration workflow is the safe bridge between browsers during this internal phase.

## Next production authentication layer
When the Supabase connection is available, Mukorob PDF should add a central authentication service while retaining local document caching for offline work.

### Core tables
- `profiles`: user ID, full name, role, organisation, status, created/updated timestamps.
- `organisations`: organisation/tenant identity and subscription/package.
- `organisation_members`: user-to-organisation membership and role.
- `permissions`: named application permissions.
- `member_permissions`: explicit permission grants/revocations where required.
- `subscriptions`: package, status, renewal/expiry and limits.
- `sessions`: server-side session/device records if required by the chosen auth flow.
- `audit_events`: security and application audit events.
- `documents`: document metadata and ownership.
- `document_shares`: controlled document sharing between permitted users.

### Login/device limits
For Bradz internal operations, users can be allowed to sign in from approved devices without subscription limits. For public packages, enforce a server-side `max_active_devices` or `max_sessions` value associated with the subscription. The client must never be the authority for this limit.

Example package policy fields:
- Free: limited active sessions/devices.
- Pro: higher active-session limit.
- Business/Family: organisation-defined limit.
- Bradz Internal: controlled by organisation administrator.

Exact commercial limits will be defined later; no limits are hard-coded into v0.7.1.

## Security requirements
- Use Supabase Auth for credential/session handling rather than storing raw passwords in Mukorob application tables.
- Never expose a Supabase service-role key in the browser.
- Use only the public/anon client configuration in the browser.
- Enforce tenant membership, role and document access with server-side policies/RLS.
- Keep local IndexedDB as a cache/offline workspace, not the authoritative identity store.
- Provide an account/device management screen for authorised administrators.
- Keep the existing encrypted local backup as a disaster/browser-migration mechanism.

## Migration requirement
Existing v0.7.1 local users must be migrated deliberately. A migration utility should map the existing local user ID/full name/role to the central account without deleting the local data first. Passwords should not be copied into a new custom password table; the user should complete the supported Supabase Auth account setup/reset flow.

## Connection required
Before implementing the central auth layer, the Supabase project must be connected to ChatGPT. Required non-secret project information will be obtained through the Supabase integration. Never commit service-role credentials or other privileged secrets to this repository.
