# Turning on passkeys for the iOS app: production rollout

A checklist for whoever owns production (hosting dashboard, production database,
the church's Apple Developer team). The code is in
[#308](https://github.com/Saint-Mark-s-Ministry/saint-marks-ministry/pull/308);
the design is in [`ios-passkeys.md`](ios-passkeys.md) and the web feature in
[`passkeys.md`](passkeys.md).

Nothing here is needed to ship the code. Until the settings below exist,
production answers `{"enabled":false}` from `/api/public/passkeys`, the iOS app
shows no passkey button or Account row, and everything else behaves as before.
Do the steps in order; each one is safe to stop after.

## What is needed from whom

| Item | Owner | Why it cannot be done from the repo |
| --- | --- | --- |
| Production env vars (three, below) | Whoever has the hosting dashboard | Not in source control |
| Backup, then `bun db:deploy` | Whoever has the **direct (unpooled)** production database URL | A production schema change is never applied by a build |
| Apple Team ID and a signed build | The church's **paid** Apple Developer account | A free personal team cannot use Associated Domains |
| Decision on the RP ID | A person, before anyone enrolls | It cannot be changed later without losing every passkey |

## The one irreversible decision

`PASSKEY_RP_ID` is baked into every passkey at enrollment. Change it later and
every enrolled passkey stops working (people fall back to their password and
re-enroll).

Use **`www.stmarkministry.app`**. iOS only lets an app use passkeys for a domain
that lists it at `https://<RP ID>/.well-known/apple-app-site-association`,
fetched without following redirects. Production redirects the apex
(`stmarkministry.app`) to `www`, so an apex RP ID could not serve that file.

Confirm this once, then treat it as fixed.

## Steps

### 1. Ship the code with passkeys still off

Merge #308 (after #225 or alongside it) through the normal weekly release.
Nothing changes for users yet.

Check: `curl https://www.stmarkministry.app/api/public/passkeys` still returns
`{"enabled":false}`, and `/.well-known/apple-app-site-association` returns 404.

### 2. Apply the migration

The migration is additive (`20261015120000_add_passkeys`: a `Passkey` table).

1. Take a production backup or snapshot.
2. Optionally rehearse on an isolated Neon branch first, per `passkeys.md`.
3. With the **direct/unpooled** URL: `bun db:deploy`.
4. Check `/api/health`.

If the table already exists from the web rollout, `db:deploy` reports nothing to
apply, which is fine.

### 3. Find the Team ID

In the church's Apple Developer account: **Membership details → Team ID**
(ten characters, letters and digits). The App ID is
`<Team ID>.org.stmark.ministryportal`. The bundle ID comes from
`apps/mobile/app.json`; confirm it matches the App Store Connect app record.

### 4. Set the three production variables

| Variable | Value |
| --- | --- |
| `PASSKEY_RP_ID` | `www.stmarkministry.app` |
| `PASSKEY_ORIGIN` | `https://www.stmarkministry.app` |
| `PASSKEY_IOS_APP_IDS` | `<Team ID>.org.stmark.ministryportal` |

Redeploy. Check:

```bash
curl -s https://www.stmarkministry.app/api/public/passkeys
# {"enabled":true,"rpId":"www.stmarkministry.app","ios":true}

curl -si https://www.stmarkministry.app/.well-known/apple-app-site-association
# 200, application/json, and no redirect:
# {"webcredentials":{"apps":["<Team ID>.org.stmark.ministryportal"]}}
```

The web login now offers passkeys too (that part comes from the web feature).
The iOS app still shows nothing until step 5, because the installed build has no
`webcredentials` entitlement yet.

### 5. Build and ship the iOS app

Build with the church's team so the entitlement and App ID match step 4:

- `apps/mobile/eas.json` already points the `beta` and `production` profiles at
  `https://www.stmarkministry.app`, so the config plugin derives
  `webcredentials:www.stmarkministry.app` with no extra variable.
- Enable the **Associated Domains** capability on the App ID in the Apple
  Developer portal (EAS does this when it manages credentials; check it is on).
- Do not set `PASSKEY_ASSOCIATED_MODE=developer` for this build.
- Run `eas build --profile beta --platform ios`, install through TestFlight.

### 6. Smoke test on a physical iPhone

From the TestFlight build, against production:

1. Sign in with a password. **Account → Passkeys** is listed. Add one named
   "My iPhone"; approve with Face ID.
2. Sign out. Choose **Sign in with a passkey** and approve.
3. Open **Account → Passkeys**: the last-used date is today. Remove it.
4. Sign out and confirm password sign-in still works.
5. Optional: sign in, wait ten minutes, try Add. The app shows "Sign in again
   first" and the server refuses with 403.

If a step fails, see the troubleshooting table in
[`ios-passkeys.md`](ios-passkeys.md#troubleshooting). The common cause is the
App ID in `PASSKEY_IOS_APP_IDS` not matching the team that signed the build.

### 7. Release to everyone

Submit the build for App Review as usual. Older app versions keep working and
never show passkeys, so there is no forced upgrade.

## Backing out

| To undo | Do this | Effect |
| --- | --- | --- |
| Hide passkeys in the iOS app only | Unset `PASSKEY_IOS_APP_IDS` | App hides the button and row; the association file 404s; web passkeys keep working |
| Turn passkeys off everywhere | Unset `PASSKEY_RP_ID` or `PASSKEY_ORIGIN` | All entry points hidden; stored passkeys are kept and work again when restored |
| Drop the schema | Do not | Stored credentials would be lost; leave the table |

Existing sessions and password/Google sign-in are unaffected by any of these.

## Before you start: quick checklist

- [ ] RP ID confirmed as `www.stmarkministry.app`
- [ ] #308 released with passkeys still off (step 1)
- [ ] Backup taken, migration applied, `/api/health` green (step 2)
- [ ] Team ID known; Associated Domains enabled on the App ID (steps 3 and 5)
- [ ] Three variables set and redeployed; both curl checks pass (step 4)
- [ ] Church-team-signed TestFlight build passes the smoke test (steps 5 and 6)
