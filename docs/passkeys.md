# Passkey login

Passkeys supplement password and Google login. An existing user signs in, opens
**Settings → Passkeys**, names a passkey, and registers it with their device or
security key. Registration requires a discoverable credential and user
verification (biometric or PIN). Login does not require entering an email.

Users can view creation/last-use dates and remove their own passkeys. Adding or
removing a passkey requires a real sign-in within the previous ten minutes;
refreshing/updating a session does not renew this window. Older sessions can
still list passkeys. Sign out and sign in again when prompted. Password and
Google login remain available, including after removing the last passkey.

## Configuration and rollout

Passkey setup and login are enabled only when **both** variables are configured.
My account always shows the Passkeys section, with an availability message and
retry action when setup cannot be enabled:

```env
PASSKEY_RP_ID="stmarkministry.app"
PASSKEY_ORIGIN="https://www.stmarkministry.app"
```

These are examples: use the actual chosen domain. `PASSKEY_ORIGIN` must be the
exact origin, including a nonstandard port if present, with no path, query, or
fragment. Surrounding whitespace and a root trailing slash are normalized. The
RP ID is a hostname without a scheme, path, or port; its case is normalized. It
must equal the origin hostname or be its parent domain. Do not use a public
suffix or shared hosting parent such as `vercel.app` as the RP ID.

For local development:

```env
PASSKEY_RP_ID="localhost"
PASSKEY_ORIGIN="http://localhost:3000"
```

HTTPS is required except for localhost. Origin and RP ID are never inferred from
request headers or preview URLs. Only one exact origin is accepted per
deployment; configure preview deployments separately with their own database.

1. Choose the production domain before inviting people to enroll passkeys.
2. Test the additive `20261015120000_add_passkeys` migration against an isolated
   Neon branch and exercise the preview there. Do not point a preview at the
   production database. The development validation also applies this migration
   to a local PostgreSQL database and checks that it matches the Prisma schema.
3. For production, take a backup/snapshot and explicitly apply committed
   migrations with `bun db:deploy` using the direct/unpooled connection. Verify
   `/api/health`, then deploy the code with the two variables set.
4. Smoke-test enrollment, sign-out, passkey login, removal, and password/Google
   fallback on the chosen domain. Check an actual iOS/Android device and a
   security key as applicable. Hardware must support resident credentials and
   user verification.

Unset either variable to disable passkey setup and login without removing stored
credentials. My account still displays an unavailable state. Existing sessions
and other sign-in methods continue to work.
`bun run build` never applies a migration.

The uncached `/api/public/passkeys` endpoint reports `enabled: true` when the
running deployment accepts the configuration. When disabled, `reason` identifies
`missing_environment`, `invalid_origin`, `https_required`, `invalid_rp_id`, or
`rp_id_mismatch`; a missing-environment response also names the missing variables.
It never echoes their values. Correct variables in Vercel's settings must be
included in the current deployment, so redeploy after saving changes.

## Domain changes

Passkeys are bound to the RP ID. Keep it stable even when changing hosting
providers. When moving between subdomains of a domain you control, passkeys can
continue working if they were originally registered using that common parent
RP ID; update the exact origin configuration for the destination deployment.

Moving to an unrelated domain generally requires users to sign in using their
password or Google, then enroll a passkey on the new domain. Keep the old domain
available during the transition. This implementation does not configure WebAuthn
Related Origin Requests or cross-domain credential migration.

## Security and storage

- SimpleWebAuthn verifies signatures, challenges, exact origin, RP ID, user
  presence, and user verification. Private keys and biometric data never reach
  the server. The database stores public credentials and authenticator metadata.
- Five-minute challenges are bound to an HttpOnly, host-only, SameSite=Strict
  browser cookie. HTTPS uses a Secure `__Host-` cookie. Only the cookie token's
  SHA-256 hash is stored. Atomic consumption prevents challenge replay across
  server instances. Expired challenges are cleaned up on options requests.
- Public options expose no user/credential lists. Options, registration, and
  credential verification are rate-limited. Mutations check an exact Origin and
  JSON content type. Login also passes through NextAuth's CSRF-protected
  Credentials callback and creates the usual JWT session.
- Registration binds the challenge to the current user and auth version.
  Management rechecks disabled state, auth version, password-change requirement,
  recent sign-in, and ownership in the database. View as mode is denied.
  Self-service account security is available to all active roles, including
  priests; it grants no ministry record permissions.
- Sign-in checks the credential's owner and user handle, disabled state,
  signature counter, and auth version. Password-change requirements remain in
  the session and are enforced by the existing proxy and route guards.
- Removing a passkey stops future logins with it. It does not revoke sessions
  already issued using that passkey. Account disablement/auth-version changes
  continue to use the existing session revocation behavior. Password resets do
  not remove passkeys; remove a compromised passkey explicitly.
- Each user may register up to ten passkeys for the current RP ID. Management
  responses exclude public keys, raw credential IDs, and signature counters.
  Successful passkey logins, additions, and removals use the audit log.

## Validation

Automated security tests cover challenge expiry/replay, request origins,
ownership, stale sessions, disabled accounts, forced password changes,
impersonation, user-handle and RP mismatches, verifier failure, signature-counter
conflicts, and rate limits. Chromium's CDP virtual authenticator can exercise
resident credential enrollment and real signature verification without hardware.
Physical device prompts and cross-device syncing still need a production-domain
smoke test.
