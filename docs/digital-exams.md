# Original-exam answer sheets and monitoring

This feature is for the original sitting of a Servants Prep exam. The questions
remain printed. Makeup exams remain entirely on paper, and existing makeup
booking and score-entry routes are unchanged.

## Servants

Open **Exams → Answer sheet** on an existing exam. Enter the 50-answer key and
choose A–B through A–H separately for each question, then save setup. Open the exam
when students may begin. Opening is not restricted by the scheduled exam date and makes the sheet available to all eligible students. Choices and the answer key lock on first opening.

Monitoring shows the eligible roster, started attempts, progress, last contact,
paused attempts, submissions, and a durable activity history. Enable alert sound
using the dashboard button; it previews one of the alert clips to enable browser playback.
New pause alerts randomly play one of six locally bundled clips: five English clips using Egyptian male voices (“Uh-oh!”, “Oh, no!”, “alalalalalal”, “Come back!” and “Where are you going?”), plus Borat’s original “Very nice!” at full playback volume. Repeated
reports are deduplicated, clips do not overlap, and answer saves are silent.
Sound is off by default and can be muted immediately. The English clips use supplied male voices from VoiceTut-TTS; the Borat clip is a short original quote. Generation details and previous asset provenance are in public/sounds/README.md.
Hidden-tab and window focus-loss reports both pause an attempt and alert the proctor.
Focus loss remains a separate event from page visibility. A proctor may unlock a paused attempt once the student has returned to
the page and reconnected. Refreshing or regaining focus never clears a server pause.

Closing finalizes all started attempts, including paused attempts, using only
answers already saved on the server. Unanswered questions are incorrect. A
student submission is final, even after an exam is reopened. Reopening permits
only eligible students who have not already submitted to start. Release results
only after closing. Private grades are then written as original grades into
existing exam scores and analytics. Release fails without changing any grades
if existing scores overlap submissions; reconcile those original grades first.
Released exams can reopen only for explicitly approved individual retakes. There is no individual countdown.

## Students

Use **Live Exam** in Servants Prep. Students must have an active prep
student role tag and active enrollment, match the exam's year level (or BOTH),
and be in its enrollment academic-year range. Enrollment without a starting year
is limited to the active academic year. Students acknowledge monitoring before
starting. One answering session owns an attempt. A different session can
recover it after 30 seconds without contact, but recovery requires proctor unlock.
Browser Web Locks additionally prevent duplicate answering tabs when supported.

Answers save one at a time with revision checks. Pending answers and activity
reports are stored locally per account and exam; they survive refresh and are
retried. Connection loss blocks answering, and reconnection requires clearance.
The student must wait for saves before final submission. Closing while changes
are pending uses only the server's saved answers. Pending changes clear after
submission.

## Free live dashboard alerts

Without Pusher credentials the dashboard automatically refreshes every two
seconds. This works without adding a paid service. To enable live delivery,
create a **Pusher Channels Sandbox (free)** app and add:

```env
PUSHER_APP_ID=...
PUSHER_SECRET=...
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=...
```

Only the key and cluster are public. Keep app secret server-side. Rebuild after
changing public environment variables. Disable client events in Pusher: all
exam events are recorded and published by authenticated server routes. Only
prep administrators and priests may authorize the private exam channel; students
never connect to Pusher. Events contain an exam ID and invalidate the dashboard,
not names, answers, grades, or answer keys. Polling remains active as a backup,
and live-delivery failures do not roll back committed database changes.

The current free allowance is 100 concurrent connections and 200,000 messages
per day: https://pusher.com/channels/pricing/. Only open proctor dashboards consume
connections. Monitor usage and stay on the free plan; no paid upgrade is needed
or automatically requested by this feature. Existing hosting/database free-tier
limits still apply. Heartbeats do not publish live messages.

## Server and database

The additive migration adds DigitalExamSheet, DigitalExamAttempt, DigitalExamEvent,
and their two state enums. Existing Exam and User gain relations only. Keys and
unreleased grades are separate from ExamScore so existing student analytics,
exports, mentor reports, and score endpoints cannot reveal them prematurely.

All state mutations lock the parent Exam row in a database transaction, including
sheet creation. Concurrent save/submit/close/unlock requests serialize against
that row. Student IDs are always derived from the authenticated principal;
server authorization resolves current role tags, disabled status, and enrollment.
Priests stay read-only. Sunday School-only roles have no access.

Endpoints:

- GET /api/digital-exams: eligible student sheets or the staff exam list.
- GET /api/digital-exams/:id: student-safe sheet and own attempt, or staff roster.
- POST /api/digital-exams/:id: configure/open/close/unlock/release/retake/reset for writers;
  start/save/submit/events/heartbeat for eligible students.
- POST /api/digital-exams/live-auth: authorize staff-only private Pusher channels.

Events are append-only through the application API, with retry IDs scoped to an
attempt for deduplication. Client timestamps are informational; server timestamps
are authoritative. Heartbeats run every 10 seconds. More than 30 seconds without
contact is shown as stale and causes a server pause on the next student request.
Student visibility is tracked independently from contact freshness.

## Validation and deployment

Run typecheck, lint, and the default Vitest suite. Database integration tests are
opt-in. Use ONLY an isolated test branch; supply its URL as SP_DATABASE_URL and
DIGITAL_EXAM_TEST_DATABASE_URL, set DIGITAL_EXAM_INTEGRATION=1, then run:

```sh
bun test:run __tests__/integration/digital-exams.test.ts
```

The isolated-branch integration suite covers grading and secrecy, tab pause,
retry deduplication, stale contact, competing sessions, final submission,
save/close races, permissions, eligibility, and protection of existing paper
grades. Hook tests cover autosave, visibility, focus loss, offline drafts, and
submission. Before a real exam, rehearse with proctors and test actual student
browsers/devices, especially iOS background suspension.

Test migrations on a branch first. Before production: create a backup, explicitly
apply the committed additive migration using the direct database URL, then deploy
code and check /api/health. Builds never migrate the database. If rolling back
code, leave the additive tables intact to preserve records.

Monitoring depends on browser-reported signals and working connectivity. Alerts
are near-immediate while connected; offline/suspended devices may delay them.
The dashboard cannot identify another tab's contents, detect another device, or
prove cheating. Use activity flags for proctor review.

Student navigation and direct answer sheet access are available only while an eligible exam is OPEN. Closing hides access, including submitted attempts. Released grades remain in My Progress; students never receive the answer key. Question choices can be configured from two to eight (A–B through A–H).

Servants and priests can open **Exam Monitoring** from the sidebar, search by exam or academic year, filter by proctoring status, and enter each live dashboard. Priests have read-only access. **Reset test opening** returns an unreleased sheet to draft only if nobody has joined, preserving its key and every saved grade. Full exam deletion is blocked when grades or digital attempts exist.

Unless a servant explicitly approves an individual retake, students with an existing score for the exam are excluded from the proctor roster and cannot start another digital attempt or see its student link. This includes zero scores and paper makeup scores. Existing digital activity remains available under Past digital activity, without putting graded students back in the proctor roster.

Student selections use the colored brand fill with white, bold letters. During an open, started attempt, the page requests a screen wake lock on supported browsers and releases it on submission, closure, or navigation away. Availability and release status are shown to the student. Low power or browser restrictions may prevent this. Phone locking still triggers normal visibility monitoring and proctor clearance; browsers do not reliably distinguish it from leaving the exam.

Window focus loss now pauses answering immediately and persists through refresh and focus return. The proctor sees a focus-loss alert and must explicitly unlock. Notification quick replies are caught only if iOS reports focus loss or page hiding; overlays that produce neither signal cannot be reliably detected. Address-bar interactions or other benign focus changes may also pause the exam. Students are prompted to enable Do Not Disturb before starting.

Proctor alerts and activity history use compact event labels with the server receipt time. Saved answer entries retain the question number and chosen answer; explanatory paragraphs, device timestamps and per-event next steps are omitted. Paused rows retain their reason after refresh and show whether the proctor is waiting for connectivity or a visible page. Hidden-page and stale-contact status disable unlock until return/reconnect. The dashboard does not claim to identify a particular app or confirm that a text was answered.

Confirmed answer changes append ANSWER_SAVED events with the one-based question number and saved choice (blank for a cleared answer), in the same transaction as the answer save. The proctor sees Recent saved answers and detailed per-student history. These saves do not generate departure sounds or warning popups. No correctness or answer key is shown in this feed. Repeated identical saves do not create duplicate history. The additive 20261009205000 migration adds nullable activity payload fields and must be applied before deploying this code.

Choice counts also support two-choice true/false questions (A/B in printed option order) and three-choice questions. Four choices remain the default.

Leaving a started answer page through an internal website route reports SITE_NAVIGATION with a bounded site pathname, pauses the attempt, and alerts the proctor. Query strings, fragments, other sites, and page contents are excluded. Reports are best-effort and retained locally for retry; full browser navigation still relies on visibility/pagehide reporting when a destination cannot be observed. The additive 20261009205500 migration adds its nullable pathname field.


## Individual original-exam retakes

In Exam Monitoring, use **Individual retakes → Allow retake** beside a completed student, including Test Student. Confirm the student, then **Open exam** if needed. Close the exam after the retake and **Release results**. Only explicitly approved students can join a reopened, previously released exam. Other graded students stay off the roster. Makeup exams remain on paper.

Approval atomically archives the previous submission and grade snapshot, preserves all versioned events, creates a new blank version, invalidates the old answering session, and clears pending drafts from previous versions. Active attempts cannot be replaced. Repeated approval before starting is harmless. Closing does not submit approved retakes that have not started. Grades remain private per attempt version until a servant releases results, even if the original exam was already released. Release retains the highest score across submissions and the existing grade, preserving original grade fields and paper makeup records. A lower retake never decreases a grade.

The additive 20261009210000 migration adds retake state, per-attempt release dates, event version numbers and immutable submission archives. It backfills release dates for previously released submissions without changing any ExamScore records.

**Set ready to open** hides a previously opened exam until the servant opens it again. It preserves locked configuration, grades, submitted attempts, and pending individual approvals. Started attempts must first be finalized by closing. The 20261009210500 migration also stores the highest released digital retake on ExamScore, so later original/paper makeup grade corrections continue to retain it. No existing grades are changed by this migration.

Alerts play only on the proctor dashboard. Each audible alert independently chooses one of six clips: five English clips using Egyptian male voices (“Uh-oh!”, “Oh, no!”, “alalalalalal”, “Come back!” and “Where are you going?”), plus Borat’s original “Very nice!” with equal probability, at full playback volume. Student devices remain silent on departure, return and resume. The former student sound setting is retained in the database for compatibility but has no playback effect or dashboard control. This change requires no database migration and does not alter scores or pause behavior.
