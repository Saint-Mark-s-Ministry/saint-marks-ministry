# Native live exams and proctoring

This is the Servants Prep original-exam workflow. Students still read printed
questions. Paper makeup exams and score entry remain separate.

## Open the feature

- Prep servants, priests and super admins: **Servants Prep → More → Exam
  Monitoring**, or **Exams → Exam Monitoring**. Controls follow the API's
  `canManage` flag, so priests can manage exams like the other administrators;
  a View as session is read-only.
- Prep students: **Home → Live Exam** or **More → Live Exam**. Only eligible
  exams opened by the proctor are returned by the existing API.
- Both destinations are searchable in the Prep Search tab. Exam notification
  links also open the corresponding native list or detail screen.

The monitoring dashboard supports the same 50-answer setup, A–B through A–H
choice counts, opening, closing, setting ready, test-opening reset, result
release, individual retakes, student unlocking, and preserved history as the
web. Compact student cards open live connection details and activity history.
The answer key is available only in the server's management response; native
students and priests never receive it.

See **Staff monitoring** below for the live channel, polling, alerts and the unlock and release rules.

## Student behavior

Students acknowledge the monitoring notice before starting. Answers autosave
one at a time using the API's revision and session-token checks. Saves,
heartbeats, activity reports and submission are serialized so a slow response
cannot race another write. The app sends heartbeats every ten seconds and
refreshes the visible answer sheet every two seconds to observe unlocking and
exam state changes. Students never connect to Pusher.

Tapping an already selected choice clears it. Students may star questions and
switch to **Review starred questions** without losing their place in the exam.
Stars persist with the encrypted draft for that account, device and attempt
version; they are not sent to the proctor and do not affect grading. A retake
or final submission clears them. Submission warns about remaining stars.

App backgrounding, iOS inactive state, Android focus loss, or navigating away
immediately blocks local answering and queues the existing HIDDEN/BLUR events.
Return reports visibility without clearing the server pause. Connection
failure preserves pending choices; reconnect reports OFFLINE/RECONNECTED and
requires proctor clearance before retrying answers. No other app's identity or
contents are inspected. OS suspension can delay network delivery, so proctors
also see the existing 30-second stale-contact indicator.

Pending choices, the answering-session token and retry IDs are stored in
encrypted, device-only Keychain/Keystore items scoped to the API origin,
account and exam. Large drafts use chunks with an atomic manifest. Saved
server answers, answer keys and grades are not persisted in this store.
Submission deletes the pending draft; a new attempt version discards the
previous version's pending choices. The token is preserved before Start is
sent, so a lost response can recover the same session. Resuming an existing
attempt requires clearance even if the previous process stopped before it
could queue an interruption report. Brief interruptions during Start are also
reported, including when the student returns before the request finishes.
The server remains authoritative across
web and native sessions. Switching to a different answering session follows
the existing 30-second recovery and proctor-unlock rules.

The screen requests native keep-awake while an open attempt is visible and
started, and releases it on submission, closure or departure. Locking a device
still pauses answering. View As cannot start, answer, submit, or manage an exam.

## Church location requirement

The server requires a verified position on every **start, answer save and submit** (`lib/digital-exam-service.ts`,
`lib/exam-geofence.ts`; [`digital-exams.md`](digital-exams.md) has the rules): captured within two minutes, accurate to 100
meters, within 150 meters of 427 Westside Ave. Without it every one of those calls is refused, so the native app must send one.
(This arrived with the merge from `main` after the screens below were first built; until it was added here, a student could not
start an exam against the current server.)

| Student list | Start card | Answer sheet |
| --- | --- | --- |
| ![](screenshots/live-exam-location/01-student-list.png) | ![](screenshots/live-exam-location/02-start-card.png) | ![](screenshots/live-exam-location/03-answer-sheet.png) |

- **How.** `data/exam-location.ts` takes a fix through `expo-location` (when-in-use only; a new native dependency). Start and Submit
  take a fresh fix; an autosave may reuse one up to a minute old; heartbeats and activity reports never carry a position, as on the
  web. The position lives in memory: it is not in the encrypted draft, not stored anywhere, and not logged.
- **A location problem is not an outage and not a revoked session.** If the device cannot give a usable position (permission asked
  and refused, blocked in Settings, Location Services off, accuracy worse than 100 m, a stale fix) or the server refuses it (400
  stale or imprecise, 403 outside the boundary), the attempt stays open and monitored, pending answers stay on the device, no
  `OFFLINE` report is queued, and the screen shows **Location needed** with the reason (and **Open Settings** when only Settings can
  fix it). A tap, Submit or Start retries at once; otherwise autosaves wait five seconds between tries. The server's 403 for
  "outside the boundary" must not be read as lost access, which is why the controller recognizes the server's wording.
- **Permission string.** `NSLocationWhenInUseUsageDescription` only: *Used during an online exam to confirm you are at church. Your
  location is checked when you start, save and submit, and is never stored.* The "Always" strings are removed by the plugin
  configuration in `app.json`.
- **A new native build is required** (a native module and an Info.plist key). A JavaScript update alone cannot add them.

Start, Resume and Submit are plain pressable buttons (`components/exam-action-button.tsx`) rather than the shared SwiftUI-hosted
button: the hosted button was seen not to appear on the Resume card in several relaunches, and these are the actions a student
cannot do without.

## Staff monitoring (Exam Monitoring)

| Setup | Needs attention | Student detail |
| --- | --- | --- |
| ![](screenshots/exam-monitoring/01-setup.png) | ![](screenshots/exam-monitoring/02-needs-attention.png) | ![](screenshots/exam-monitoring/03-student-unlock.png) |

| Existing-grade conflict | Alert banner | Dark, largest text | Offline |
| --- | --- | --- | --- |
| ![](screenshots/exam-monitoring/04-existing-grade-conflict.png) | ![](screenshots/exam-monitoring/05-alert-banner.png) | ![](screenshots/exam-monitoring/06-dark-largest-text.png) | ![](screenshots/exam-monitoring/07-offline-controls-off.png) |

Everything goes through the existing `GET`/`POST /api/digital-exams/:id` and `POST /api/digital-exams/live-auth`; no endpoint,
schema or permission was added. The server decides who may manage, finalizes attempts, grades, and refuses what is not allowed.
The app only decides what to offer (`data/exam-monitor.ts`, pure and tested) and shows the server's own reason when it refuses.

- **Setup, open, close, release.** The 50-question key editor (A-B to A-H per question) saves with `configure`, and is offered
  only until the exam has first opened (the server locks the key and choices then). Open, Close, Release, Set ready and Reset
  appear exactly when the web monitor shows them (`examControls`), each behind a confirmation that says what it does. Close
  submits saved answers for every started attempt; Release only publishes what the server computes.
- **Student grid.** Eligible students with ready / started / paused / submitted state, answered count, last contact ("12 s
  ago") and the latest saved answer. Students waiting on a proctor come first and are red: **Needs unlock** (connected, can be
  unlocked now) before **Paused** (still reconnecting, or the screen is hidden; the tile says which). Stale contact is amber
  **No contact**. A red **Needs attention** card at the top counts who can be unlocked now. State is never color alone.
- **Student detail.** Opens from a tile: connection, the interruption that paused the student, the server's reason when unlock
  is not yet possible, the 50 saved answers exactly as the server holds them, and the full activity history. There is no
  right/wrong marking and no percentage calculated on the phone: a submitted student's "x of 50 correct · y%" is what the
  server sent (staff only, private until release).
- **Unlock.** Offered only when the server would accept it (open exam, paused, page visible, contact fresh) and confirmed
  first. If the student changed in the meantime, the server's 409 is shown ("The student must return and reconnect before
  unlocking.") and the dashboard reloads.
- **Release conflicts and grades.** If an existing grade overlaps a submission, the server refuses ("Existing grades overlap
  these submissions...; no grades were overwritten"); the app shows that, reloads, and Release stays available. A retake keeps
  the higher score; nothing is overwritten on the device's say-so.
- **Individual retakes.** The server's `retakeCandidates` list, an **Allow retake** button each (archives the previous attempt
  and grade, creates a blank sheet). Open, close and release afterwards as usual.
- **Refusals.** 403 (permission lost) and 404 reload and say so; 400 shows the rule; an offline failure says it is not known
  whether the action was applied and reloads to find out. One staff action runs at a time.
- **Read-only.** A View As session and a priest or account without `canManage` see the roster and history but no controls (the
  client also blocks every non-GET in View As). Students, mentors and Sunday School-only servants never reach the screen.

**Live channel and polling.** Where the server reports `realtimeConfigured` and this build has `EXPO_PUBLIC_PUSHER_KEY` and
`EXPO_PUBLIC_PUSHER_CLUSTER` (public values, the same as the web's `NEXT_PUBLIC_PUSHER_*`), the screen holds the private
`private-digital-exam-<id>` channel, authorized by the staff-only `live-auth` endpoint, and re-reads on each `changed` ping.
It speaks the Pusher wire protocol over React Native's own WebSocket (`data/exam-realtime.ts`), so there is **no new native
module**. While connected, polling slows to a 10-second backup; otherwise (not configured, View As, read-only, dropped,
refused) it polls every two seconds, and the screen says which. The channel is held only while the screen is focused and the app
is active. Only the Exam Monitoring screen imports it, and the server refuses a student's authorization.

**Alert audio (opt-in, mutable).** Off every time the screen opens. Turning it on asks for notification permission, then a new
interruption plays one short clip as a local notification with a fixed identifier, so alerts replace each other instead of piling
up (verified: banner "Youssef Hanna · Connection lost"). At most one clip per refresh and per 8 seconds; a student already
paused and sounded for does not sound again for each further event of the same pause; the first load and history never sound;
muting, leaving the screen and backgrounding the app dismiss it. It follows the iPhone's volume, silent switch and Focus.
Student devices never play audio. **The Borat clip is not bundled in the iPhone app**: its README entry says the source states no
redistribution license, which is not acceptable in an App Store binary; the five Egyptian-English clips are bundled.

## Criteria, and the evidence for each

| Criterion | How it is met | Verified by |
| --- | --- | --- |
| `GET /api/digital-exams`, `GET`/`POST /api/digital-exams/[id]`, server eligibility, acknowledgment first | `live-exam-list.tsx`, `use-live-exam.ts`, the Start card's switch | Simulator on the real API; integration suite |
| 50 answers, A–B to A–H per question, selected feedback, pending/saved, submit after saves finish | `exam-answer-choices.tsx`, controller `flushAnswers` and `submit` | Simulator (4- and 8-choice questions); controller tests |
| Revisions, ownership, heartbeat, pause, reconnect, unlock; foregrounding never clears a pause | controller `apply`, `refresh`, `failure` | Controller tests; integration suite; on the simulator a relaunched attempt came back `PAUSED` (server `CONTACT_LOST`, then `RECONNECTED`, `RETURNED`) until the proctor unlocked it |
| App backgrounding/inactivity and lost connection map to the existing contract; keep awake | `HIDDEN`/`RETURNED`/`BLUR`/`OFFLINE`/`RECONNECTED`; `useExamAwake` | Controller and hook tests; integration suite. iOS has no browser focus events, so `inactive` maps to `BLUR` + `HIDDEN` and Android uses its own `blur`/`focus` |
| Pending answers and events preserved per account and exam, retried without duplication, cleared on finalization | chunked Keychain store, event IDs, `persist()` | Controller tests; integration suite |
| No answer key, no unreleased grade | the student GET omits the key; a result shows only when the server sent one | Real API (`answerKey` absent from the student response); wiring test |
| Church location on start, save, submit | this section | Locator tests against the server's own validator; controller tests; integration suite; simulator start at the church |

## Build and verification

The existing `/api/digital-exams` endpoints provide all data and enforce current
database authority, enrollment eligibility, private results, and transaction
locks. This feature adds no endpoint, schema change or permission grant.
Shared API shapes live in `packages/contracts/src/digital-exams.ts`; shared
activity labels live in `packages/domain/src/exam-activity.ts`.

The Expo notifications plugin bundles five of the web's six proctor WAV clips (see Staff
monitoring). **A new native build is required for these sound assets**; a JavaScript update
alone cannot add them to an installed binary. Sound is off initially, requires notification
permission, and follows the device's notification, volume and Focus settings.

Verification commands:

```sh
bun run mobile:typecheck
bunx tsc --noEmit
bun lint
bun test:run
bun run mobile:export
```

The full jsdom suite requires a compatible Node runtime (validated with Node
20.20.0); Node 26's experimental global localStorage conflicts with the web
tests. Native controller tests cover slow save acknowledgments, focus loss
during saving, offline recovery, blocked saves, revision conflicts, durable
draft restoration, versioned retakes, closure, final submission, and denial.
Queued writes cannot block reading a proctor-finalized submission or a new
retake version. A rejected ownership check blocks answering until the student
explicitly resumes. Monitoring cancels background reads and ignores late
responses; manual refresh shares the current read instead of racing it.
Hook tests cover monitoring freshness and native keep-awake cleanup.

The database suite also runs the native controller through the actual API for
save/clear, interruption/unlock, grading secrecy, offline closure, lost
submission responses, retakes and competing sessions. It was validated against
an isolated local PostgreSQL database. Database integration tests require an
explicitly isolated test database as described in `digital-exams.md`.
Rehearse on physical devices before a real
exam, especially interruption delivery, sounds, and Focus behavior.

## Exam Monitoring verification (staff)

Run on the iPhone 18 Pro simulator against the real API and a throwaway PostgreSQL database (the shared dev database was not
touched), signed in as a Prep servant, a Prep student, and a super admin using View As:

| Case | Result |
| --- | --- |
| Configure (all 50 answers entered in the app), open, close, release | Each worked through the UI; server state checked in the database |
| Pause and unlock | Hidden student: tile **Paused**, Unlock disabled with the reason; returned student: **Needs unlock**; unlock through the UI worked |
| Existing grade overlaps a submission | Release refused with the server's message, grade stayed 90, Release stayed available |
| Release without the conflict | Six grades created by the server; attempts preserved |
| Individual retake | Approved through the UI: previous attempt archived, student shows **Retake ready**, exam reopens |
| Alert audio | Opt-in prompt, then a local notification banner for a new interruption |
| Offline | Server stopped: controls disappear, the earlier status is not shown as live |
| Empty roster, denied student, View As | "No eligible students…"; "Exam Monitoring is for…"; read-only note with no controls |
| Light, dark, largest Dynamic Type | Wraps without clipping |

Stale-contact unlock, a stale client, release conflicts, retakes and denied or read-only accounts are also covered against the
real routes in `__tests__/integration/digital-exams.test.ts` (37 tests, opt-in, isolated database).

**Not verified:** the live Pusher channel against Pusher's service (no Pusher credentials exist locally; the protocol is
covered with a fake socket), a real iPhone, and audible playback (the simulator showed the banner only). Before a real exam, set
the two `EXPO_PUBLIC_PUSHER_*` values for the build, confirm "Live alerts connected" on the dashboard with a staging exam, and
check the clip is audible.
