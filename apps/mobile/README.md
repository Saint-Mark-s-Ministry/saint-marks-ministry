# St. Mark Portal — native app

Expo / React Native for iOS and Android, in the same repository as the Next.js
website. This milestone covers the Sunday School experience across servant,
coordinator, priest, and administrator roles: sign-in and password changes,
classes and staffing, children and families, lessons and resources, child and
servant attendance, reports, visitations, feedback, notifications, application
queues, organization settings, people, and audit activity.

## Connect to the local database

The phone talks to the Next.js API. Only that server connects to PostgreSQL.
No database credentials belong in the native app.

1. Keep existing server secrets in the root `.env`. Create a root `.env.local`
   with `SP_DATABASE_URL` and `SP_DATABASE_URL_UNPOOLED` pointing to the existing
   local `servants_prep` database, and `NEXTAUTH_URL=http://127.0.0.1:3000`.
   Next.js and the Prisma CLI prefer this override to `.env`; explicit process
   environment values retain precedence.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`, and set
   `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_DATA_LABEL` for the local server.
   These values are public and included in the app bundle. Both `.env.local`
   files are ignored by Git.
3. From the repository root, start the two development servers:

```bash
bun install
bun dev --hostname 127.0.0.1
# In a second terminal:
NODE_OPTIONS=--dns-result-order=ipv4first bun run mobile:ios -- --localhost
```

If Expo Go on a newer simulator cannot reach a loopback-only Metro server, run
`bun run mobile -- --lan` and open its LAN URL. The app can still use the local
API origin on iOS Simulator.

Sign in with an existing **local** account. Saved attendance and notification
read status persist in that local database. The app no longer uses fictional
in-memory fixtures. The root `.env` and deployed environments are unaffected
by the ignored local override. Restart the relevant servers after env changes.

For Android's standard emulator, use `http://10.0.2.2:3000` as the mobile API
origin and run `bun run mobile:android`. Physical devices need the computer's
LAN address and a server listening on that interface. Release builds require
an explicitly configured HTTPS API origin.

The EAS `beta` and `production` profiles use
`https://servants-prep-app.vercel.app`. This is the public production web/API
origin; database credentials remain on the server and are never bundled into
the app. The `beta` profile creates a directly installable internal build, while
the `production` profile is reserved for App Store Connect/TestFlight.

The IPv4 option above avoids a localhost mismatch on systems where Node binds
to `::1` while Expo sends the simulator to `127.0.0.1`.

## Authentication and data behavior

- Uses the existing NextAuth CSRF, credentials callback, session, and sign-out
  endpoints. No alternate login endpoint or permission bypass is introduced.
- Uses `expo/fetch` with an explicit cookie jar, separate from Expo Go's shared
  cookie store. Requests stay on the configured origin and do not follow redirects.
- Session cookies are stored with Expo SecureStore, scoped to the API origin.
  Passwords and ministry records are not persisted on the device. Sign-out clears
  local credentials even when the server cannot be reached.
- The existing API revalidates accounts and derives class permissions on the
  server. Priests can read attendance but cannot save it. Forced and voluntary
  password changes are completed in the native app.
- Sunday School data and permission-aware administration screens load from the
  existing API. Pull to refresh. Notifications here are in-app records; native
  push delivery is a later milestone.
- Attendance loads the selected class/date, preserving all four statuses and
  existing notes. A session is created only on save. Save waits for confirmation
  and reloads the saved roster. Failed saves leave the draft available to retry.
- Draft attendance is memory-only and clears on sign-out/reload. There is no
  offline write queue. A lost connection shows an error and retry action.
- Glass is limited to navigation and selected controls. Content uses opaque
  surfaces; custom glass respects Reduce Transparency and falls back on Android.

## Verification

```bash
bun run mobile:typecheck
bun run mobile:export       # iOS and Android JS bundles; not signed IPA/APK
bun test:run __tests__/mobile
# With the local API running and root .env.local configured:
bun scripts/check-mobile-local.ts
# From apps/mobile:
bunx expo-doctor
```

The integration check refuses non-loopback database/API hosts and any database
name other than `servants_prep`. It creates isolated temporary users, class,
child, and attendance; verifies sign-in, cookie restoration, class scope,
save/read-back, sign-out, and priest write denial; then removes its fixtures.
Existing records are preserved; normal sign-in audit events may remain.

React is pinned to 19.2.4 in both apps to avoid duplicate React copies. It is
within React Native 0.86's peer range. Expo's exact 19.2.3 recommendation is
excluded for React only. Keep both apps aligned when upgrading dependencies.

## Repository boundaries and remaining scope

- `apps/mobile`: native UI and API transport.
- `packages/contracts`: type-only contracts; no Prisma runtime in native bundles.
- `packages/domain`: platform-independent class/date helpers.
- The root Next.js app remains the server and web application.

Google sign-in, offline sync, Servants Prep screens, profile-photo upload, and
native push delivery are not implemented. Physical-device and full accessibility
testing remain before release; the current iOS build has been exercised on an
iPhone 18 Pro simulator running iOS 27.

`org.stmark.ministryportal` is a provisional bundle identifier. EAS configuration
is not linked to an account/project. Confirm naming, signing, store accounts,
and release API configuration before TestFlight or Google Play distribution.
Merging this branch does not publish a mobile app or include local env files.
