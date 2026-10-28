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
- **Live exams:** native Exam Monitoring for Prep servants and priests,
  original answer-sheet configuration, opening/closing, unlocking,
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
  server. Priests edit ministry records, including attendance. Forced and
  voluntary password changes are completed in the native app.
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

## Who can edit what in the app

The app follows the web's October 16 policy: a **priest edits ministry records in both
programs**. Which controls appear comes from the API where it offers a flag and from the
server's own role helpers where it does not; every write is still authorized on the server.

| Area | Priest | How the app decides |
|---|---|---|
| Servants Prep: attendance, curriculum and lessons, exams and scores, enrollments and mentor assignment, registration review, invite codes, async rotation-form review, confession slips, calendar | Edits | the admin roles (`SUPER_ADMIN`, `PRIEST`, `SERVANT_PREP`), mirroring `isAdmin` in `lib/roles.ts` |
| Sunday School: class attendance, lessons, children, staffing, homework, visitations and priority visits, servant meetings | Edits | the API's `canServe`/`canCoordinate`/`canEdit` flags and the dashboard's `standing.isAdmin` (`useMinistryAdmin`) |
| Live exam monitoring: open, close, unlock, release | Manages | the API's `canManage` flag |
| Sunday School phone calls and check-in responsibility | Read only | the server refuses priests; the app hides "Log a call" for them |
| User accounts, access tags, Contact Book grants, audit log, servant applications, organization, MCP tokens | Not offered | Super Admin only (or the separate Contact Book grant); ministry editing never confers them |
| Feedback moderation | Not offered | the API's `viewer.canModerate` |
| Confidential notes to priests | Priests read every note, other authors only their own; Super Admins (even if also tagged Priest) and every View as session are excluded, and the app doesn't even ask | the visitations response's `standing.canReadPrivateNotes` and `isPriest`; the private-note route only |

**View as is read-only whoever starts it.** The app refuses every write while viewing as
(`ViewAsReadOnly`, before the request is sent), hides the controls it owns, and the server
blocks the same writes. A priest's own editing rights never apply inside a View as session.
Starting View as needs the server's capability (below), not a role.

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

### Ministry tint and role landing

- **Tint** (gold for Sunday School, maroon for Servants Prep) is chosen once at
  the root from the active route (`ministryForSegments`, `src/data/navigation.ts`),
  so a pushed screen's header, toolbar and body always agree. Shared screens
  (account, notifications, readings, calendar day) keep the ministry you came
  from. Don't tint a screen by hand.
- **Which ministry a role lands in** follows the web: administrators and mentors
  with class access get both; servants and parents are Sunday School only (a
  parent's tabs are Home, Calendar, Children, More); students are Prep only even
  when assigned to a class as a pupil. "Has a class" never means "serves".
- **Tab roots share one header**: ministry switcher on the left, notifications
  and the account avatar on the right. Pushed screens show a back button and
  only their own actions, and one search placement (`stacked`).

### Daily readings

`/readings` shows the day's Katameros and Synaxarium from `/api/liturgical/*`
(Coptic IO), with the Coptic date leading, a day stepper, an English/Arabic
switch and tap-to-expand readings. Home and More link to it, and a day on the
Calendar opens it for that date. Pure helpers are in `src/data/readings.ts`.

### Notifications open in the app

A notification's web link and type are mapped to a native route in
`src/data/notification-routes.ts` (tests check every target is a real screen).
Tapping one in the list, or a push, opens that screen; only a link with no
native counterpart falls back to the browser.

**Tuesday teaching reminders** (server: `lib/sunday-school-lesson-reminders.ts`)
arrive as an `ANNOUNCEMENT` whose `metadata` is `{ kind: "sunday-school-lesson-reminder",
lessonId }`; the same two fields ride in the native push `data`. The app opens
`/lesson/<lessonId>` (falling back to the lessons list if the id is unusable). The
feed is the source of truth: it is re-read when a push arrives and when the app
resumes, so a reminder is there with push denied, undelivered, or retried, and a
repeat of the same reminder id is one row. `usePushNotificationRegistration`
(called from the root layout, bound to the signed-in person and never to a
viewed-as account) registers the device and handles taps, including a push that
launched the app.

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

Super Admins, and **individually enabled priests**, can open **Account → View as another user**. Mobile uses the same
`/api/admin/view-as/users` picker and NextAuth session update as the web portal;
the server verifies the original actor and audits each session change. A
persistent **View as · Read-only** banner identifies the viewed account. Tap the
account name to change users, or **Stop** to restore the original account.

The session survives app restarts and is revalidated when the app returns to the
foreground and every minute while active. Server expiry restores the original
account. Identity changes clear resource caches, remount portal state, and
invalidate pending responses. Mobile also blocks unsafe data requests while
viewing; the existing server read-only barrier remains authoritative.

**Priests.** A Priest role or tag alone gives nothing. The entry appears when the
refreshed session says `canUseViewAs` (or the account is a Super Admin), is hidden
during a forced password change, and the server re-checks the actor on every
request (`hasViewAsAccess`). The banner shows the time left in the 30-minute preview.
When a preview ends without Stop (it expires, the viewed account is disabled, or the
grant is revoked) the next session refresh, which the app also forces at expiry,
clears the viewed account's caches; the app leaves the screens that belonged to that
person and shows why. If the server closes the whole session (grant revoked,
actor disabled) the app signs out with a message. Previews stay read-only and
confidential priest notes are never loaded in them.

A Super Admin grants it in **People → account → Allow View as**, shown for an active
priest (or while a grant exists, so it can be removed after the Priest tag goes). It saves
through `PUT /api/admin/users/[id]/view-as-access` with `{ canUseViewAs }`, never through
the profile update, the role update or a session update, and is off for priests and
every other role, for disabled accounts, and inside View as. Apply the
`20261016171000_add_priest_view_as_access` migration before using it.

### Async students' attendance

A current async student's Servants Prep attendance is **rotation attendance**: only the
serving-rotation weeks that have started count, and normal lessons never do, including lesson
records from before the student became async (web PRs #245 and #246). The server computes it; the
app only labels it. Rotation attendance and rotation weeks are the words on the student's progress
screen, the staff student view, the mentee views and the list rows. No lesson-absence buffer or
"attend the next lessons in a row" advice is shown to an async student.

- A week that has not started is "Upcoming", never missed. A started week with no credit reads "Not
  credited" until a servant approves the signed four-week form, which credits all four weeks.
- No data is "—" and "No rotation weeks counted yet", never 0%.
- Finishing all ten approved rotations is a separate requirement from the 75% attendance goal, with
  its own row. A student with no rotation assigned is told a servant assigns one (servants are
  pointed to Async students).
- The roll call leaves async students off. A student who becomes async while a roll call is open
  is removed on the next roster check (every 30 seconds, on return to the app, and just before Save),
  their draft marks are discarded, and a notice says so. The server enforces the same rule.
- Shapes are shared type-only contracts in `packages/contracts/src/prep-analytics.ts`.

### Mentors and fathers of confession on the roster

Student rows (Roster, Students) show the current mentor and father of confession by name. The
student detail adds the mentor's email and phone and the father of confession's church and phone,
each with native Call, Message and Email actions. A missing value reads "Not provided" (web PR #243).

- The mentor shown is the server's resolved `mentorContact`, which prefers the student's confirmed
  annual mentor details over the raw enrollment and account fields, so a stale assigned account is
  never presented as the contact. A Year 2 student who hasn't confirmed this year reads "awaiting
  this year's confirmation". When the confirmed contact differs from the assigned account, the card
  says which account is assigned.
- Mentor candidates come from `GET /api/mentor-options` (the same list the web uses), never from a
  role filter on the user list. An enabled Sunday School servant with an eligible tag is selectable
  even when their primary role differs. The server re-checks eligibility on save.
- "Change mentor" is offered only to Super Admins, priests and Servants Prep servants (the roles the
  server allows). Eligibility or assignment grants no Servants Prep authority in the app: every
  screen still checks the signed-in user's own role.
- After a reassignment or removal the enrollment, the mentor views and the student's own screen
  are refetched. Shapes are in `packages/contracts/src/prep-roster.ts`.

## Remote push temporarily disabled

`extra.remotePushEnabled` is currently `false` in `app.json`. The app skips
remote push permission/token registration, and the config plugin removes
the iOS `aps-environment` entitlement so the existing signing profile can build
the app. The in-app notification list and optional local proctor alert sounds
remain available, and so do teaching reminders (they are in the feed regardless
of push). To restore remote push later, set the flag to `true`, refresh
the APNs-enabled signing profile, and rebuild the native app.

## iPhone Duo and wide windows (iOS 27.1)

On a window at least 700 pt wide after the vertical bar's inset (the iPhone Duo fully open), Roster, Take
attendance, Visitations, Search, Homework and Birthdays show **two panes**: the list on the left and the selected child's history (Attendance,
Notes, Visitations) on the right. Tapping a child, or the clock button, selects them in the pane instead of
opening a sheet, so the list, its scroll position and any unsaved attendance marks stay put. Phones are
never that wide and keep the single column. The rule uses width, not the device name. On a foldable the
panes meet at the hinge: the system's crease region when it reports one (active or not), otherwise the
middle of the window, with the vertical bar's inset kept clear on the trailing edge. The **Calendar** (Sunday
School and Servants Prep) becomes the desktop month grid on a wide window: Sunday-first columns, each day with up
to three coloured event chips and "+N more", a Today marker, a Fast tag and a legend. It fills the window
(`Screen fullWidth`), and its columns break at the hinge, Sunday to Wednesday on the left and Thursday to
Saturday on the right. Home and the forms stay one large page across the window.

On the **Classes** tab the right pane is the tapped class: children and attendance, Take attendance, individual
history, roster, servants and recent sessions, with "Open full class" for editing and staffing.

**The dock stays on the right.** Inside the tabs the system draws its vertical tab bar on the trailing edge.
A screen pushed over the tabs (Take attendance, a lesson, a profile) covers that bar, so a dock with the same
five tabs is drawn in the same strip until you go back; tapping a tab returns to it. It is drawn only when the
system reports a vertical bar (`verticalBarEdge`), so phones are unchanged.

The `DuoLayout` native module (`modules/duo-layout`, Swift, iOS 27.1 only) reports the hinge angle and
status, the vertical bar edge, the safe-area insets and the crease regions to `useDuo()`. On any other
iPhone or iOS it answers "not foldable". In development a small pill shows the live values on a foldable.
Building needs Xcode 27.1 (the 27.1 SDK); an older dev client without the module simply reports not
foldable. The hinge is changed in DeviceHub; there is no `simctl` command for it.
