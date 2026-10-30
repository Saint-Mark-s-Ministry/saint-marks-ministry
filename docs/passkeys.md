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

Passkeys are hidden and disabled until **both** variables are configured:

```env
PASSKEY_RP_ID="stmarkministry.app"
PASSKEY_ORIGIN="https://stmarkministry.app"
```

These are examples: use the actual chosen domain. `PASSKEY_ORIGIN` must be the
exact canonical origin, including a nonstandard port if present, with no path
or trailing slash. The RP ID is a hostname without a scheme, path, or port. It
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

Unset either variable to disable passkey entry points without removing stored
credentials. Existing sessions and other sign-in methods continue to work.
`bun run build` never applies a migration.

## Native iOS app

The iOS app uses the same endpoints and the same NextAuth `passkey` provider as
the web. It differs in four ways, and each needs something from this
deployment.

1. **The RP ID host must serve the association file.** iOS only lets an app use
   passkeys for a domain that lists the app's App ID in
   `https://<RP ID>/.well-known/apple-app-site-association`, fetched **without
   following redirects**. This deployment serves it at
   `app/.well-known/apple-app-site-association/route.ts`, from
   `PASSKEY_IOS_APP_IDS`. Production redirects the apex (`stmarkministry.app`) to
   `www`, so an apex RP ID could not serve it. **Choose `www.stmarkministry.app`
   as the RP ID** (and the origin) before anyone enrolls; passkeys cannot be
   moved to a different RP ID later.
2. **`PASSKEY_IOS_APP_IDS`** is a comma- or space-separated list of
   `TEAMID.bundle.id` values, for example `ABCDE12345.org.stmark.ministryportal`.
   It is the team that signs the App Store build, not a developer's personal
   team. Unset, the iOS app is off: `/.well-known/apple-app-site-association` is
   a 404 and `GET /api/public/passkeys` reports `ios: false`. Web passkeys are
   unaffected either way.
3. **The origin differs.** Browsers report the page origin in `clientDataJSON`;
   iOS reports `https://<RP ID>`. When the RP ID is a parent of the web origin,
   the verifier also accepts `https://<RP ID>`, but only while
   `PASSKEY_IOS_APP_IDS` is set. With the recommended setup (RP ID = origin
   host) there is nothing extra to accept. Separately, the request `Origin`
   header is still compared exactly with `PASSKEY_ORIGIN`: the app sends its
   API origin, so the API host must be the configured origin.
4. **The challenge cookie is held by the app.** The app keeps the cookie-bound
   challenge in a private in-memory jar, returns it with the verify or sign-in
   request, and never stores it. The credential response is converted from
   iOS's raw fields into the browser-shaped JSON the verifier expects
   (`apps/mobile/src/data/passkeys.ts`); `__tests__/mobile/passkeys.test.ts`
   runs an iOS-shaped credential through the real verifier.

`GET /api/public/passkeys` answers `{ "enabled": true, "rpId": "...", "ios": true }`.
The app offers passkeys only when `enabled` and `ios` are true **and** `rpId` is
the domain the installed build was associated with at build time (the host of
`EXPO_PUBLIC_API_URL`, or `PASSKEY_ASSOCIATED_DOMAIN` for a parent RP ID). An
older server that sends neither field never offers them.

The Associated Domains capability needs a **paid Apple Developer team**; a free
personal team cannot sign a build with it. A build made without a domain (a
local dev client pointed at an IP address) has no entitlement and hides
passkeys.

### iOS smoke test

On a physical iPhone, with a build signed by the team named in
`PASSKEY_IOS_APP_IDS`, against the production domain:

1. Sign in with a password, open **Account → Passkeys**, name a passkey, add it.
2. Sign out. Choose **Sign in with a passkey** and approve with Face ID.
3. Confirm the list shows the last-used date, then remove the passkey.
4. Confirm password sign-in still works, and that with
   `PASSKEY_IOS_APP_IDS` unset (or `PASSKEY_RP_ID` unset) the button and the
   Account row disappear.

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
