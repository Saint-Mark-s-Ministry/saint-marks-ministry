# St. Mark Portal — native app

Expo / React Native for iOS and Android, in the same repository as the Next.js
website. The app covers both Servants Prep and Sunday School with role-aware
navigation and a ministry switcher, using the same accounts and API as the web
portal. The current App Store release targets iPhone (`supportsTablet: false`);
Android development and JavaScript bundle export are also configured.

## Supported workflows

- **Sunday School:** classes and staffing, children and families, lessons and
  resources, child and servant attendance, reports, visitations, feedback,
  birthdays, Elementary homework, parent child registration, application queues,
  organization settings, people, and audit activity.
- **Servants Prep:** student lessons, attendance, exams, progress, files,
  confession slips, serving rotations and signed-form uploads, assigned class
  lessons, mentor/mentee views, enrollment and registration review, async student
  review, and annual mentor confirmation through Application. Async students
  without a cohort year are shown as “No cohort year”.
- **Live exams:** native Exam Monitoring for Prep servants (read-only for
  priests), original answer-sheet configuration, opening/closing, unlocking,
  result release, retakes, and activity history; student Live Exam with
  autosaving, encrypted pending drafts, interruption pauses, and final submission.
  See [`../../docs/mobile-live-exams.md`](../../docs/mobile-live-exams.md).
- **Shared:** sign-in and password changes, Contact Book with individually
  granted access and ministry roles, notifications, Super Admin main-class
  pinning, read-only View As, and password-confirmed account deletion.
- **Lesson Scheduler:** lesson scheduling and reminders with native Expo push.

See [`../../docs/ios-release.md`](../../docs/ios-release.md) for TestFlight and
App Store setup, compliance details, and the server-first rollout.

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
`https://www.stmarkministry.app`. This is the public production web/API
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
  Passwords are not persisted. Ministry records load from the server; pending
  live-exam choices use the separate encrypted draft store described below.
  Sign-out clears local credentials even when the server cannot be reached.
- The existing API revalidates accounts and derives class permissions on the
  server. Priests can read attendance but cannot save it. Forced and voluntary
  password changes are completed in the native app.
- Sunday School data and permission-aware administration screens load from the
  existing API. Pull to refresh. In-app notifications and native Expo push are
  implemented. Push registration requires permission, a physical device, and an
  EAS project ID with platform push credentials; simulators do not register tokens.
  Push tokens are removed on sign-out and account deletion.
- Attendance loads the selected class/date, preserving all four statuses and
  existing notes. A session is created only on save. Save waits for confirmation
  and reloads the saved roster. Failed saves leave the draft available to retry.
- Account deletion uses `POST /api/account/delete` and the existing admin
  deletion protections. Super Admins cannot delete their own account; accounts
  holding protected records are directed to an administrator. Delete account is
  hidden during View As.
- Privacy Policy and Terms are reachable on Sign in and public sign-up screens;
  Forgot password opens the existing web reset flow.
- Draft attendance is memory-only and clears on sign-out/reload. Attendance has
  no offline write queue. Live exams preserve pending answers and activity in
  device-only encrypted storage; resuming after connection loss requires
  proctor clearance before those answers can retry.
- Glass is limited to navigation and selected controls. Content uses opaque
  surfaces; custom glass respects Reduce Transparency and falls back on Android.

### Interaction feedback

Haptics use one shared, best-effort policy. Custom answer choices, review stars,
attendance marks and calendar selections use a soft tick. Existing action
buttons retain light feedback; explicit save confirmations and failed actions
use short system outcome patterns. Copy feedback follows a successful copy.
Typing, score/answer autosaves, ordinary refreshes and restored state stay quiet.
Native switches and segmented controls keep their system behavior.

Feedback runs only while the app is active. A shared cooldown prevents duplicate
pulses from nested controls and rapid taps, outcomes have an additional cooldown,
and proctor warning pulses are spaced by at least eight seconds. Unsupported
hardware and native failures never block an action. Device haptic settings and
availability remain authoritative; physical devices are needed to assess feel.

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

### Search tab on iOS 27

Search sits in a separate native glass bubble beside the four main tabs in both
ministries. react-native-screens is pinned to 4.29.0 for its upstream UITab
implementation. The Search triggers pass the native search role and
`automaticallyActivatesSearch` through Expo Router’s `unstable_nativeProps`,
which detaches the search tab on iOS 27 and activates its native search field.

The previous custom UITab reconstruction is not used. A small version-pinned
Bun patch preserves an admitted native selection across React mounting, until
UIKit’s didSelectTab callback consumes it. Without this, a mount between the
shouldSelectTab and didSelectTab callbacks drops the JS focus update and leaves
newly selected content untappable until the tab is tapped a second time.
Verify tab content,
header profile/menu controls, More rows, and Search links after upgrades. The
explicit react-native-screens version is excluded from Expo’s SDK version
alignment; review compatibility when updating Expo or React Native.

### Typography

Type follows the UI/UX reference: **Newsreader 500** for the one page title per
screen, **Geist 400/500/600** for everything else, **Geist Mono** for codes.
Custom families have no synthesised weights on iOS, so `Copy` resolves the
Geist face from `fontWeight` (see `sansFamilyForWeight` in `src/theme.tsx`).
Use `Copy` for text; a raw `Text` or `TextInput` needs an explicit
`fontFamily` from `theme.tsx`. Native controls (tab bar, `Button`) keep the
system font.

### Notifications open in the app

A notification's web link and type are mapped to a native route in
`src/data/notification-routes.ts` (tests check every target is a real screen).
Tapping one in the list, or a push, opens that screen; only a link with no
native counterpart falls back to the browser.

## Repository boundaries and remaining scope

- `apps/mobile`: native UI and API transport.
- `packages/contracts`: type-only contracts; no Prisma runtime in native bundles.
- `packages/domain`: platform-independent class/date helpers.
- The root Next.js app remains the server and web application.

Google sign-in, offline sync, and profile-photo upload from settings are not
implemented. Physical-device and full accessibility testing remain before
release. Earlier screens and fresh signed-out launch were checked on an iPhone
18 Pro simulator; the consolidated app still needs a full TestFlight pass for
every role, including the newer screens.

`org.stmark.ministryportal` is a provisional bundle identifier. EAS configuration
is not linked to an account/project. Confirm naming, signing, store accounts,
and release API configuration before TestFlight or Google Play distribution.
Merging this branch does not publish a mobile app or include local env files.

### View as

Super Admins can open **Account → View as another user**. Mobile uses the same
`/api/admin/view-as/users` picker and NextAuth session update as the web portal;
the server verifies the original actor and audits each session change. A
persistent **View as · Read-only** banner identifies the viewed account. Tap the
account name to change users, or **Stop** to restore the original account.

The session survives app restarts and is revalidated when the app returns to the
foreground and every minute while active. Server expiry restores the original
account. Identity changes clear resource caches, remount portal state, and
invalidate pending responses. Mobile also blocks unsafe data requests while
viewing; the existing server read-only barrier remains authoritative.

## Remote push temporarily disabled

`extra.remotePushEnabled` is currently `false` in `app.json`. The app skips
remote push permission/token registration, and the config plugin removes
the iOS `aps-environment` entitlement so the existing signing profile can build
the app. The in-app notification list and optional local proctor alert sounds
remain available. To restore remote push later, set the flag to `true`, refresh
the APNs-enabled signing profile, and rebuild the native app.
