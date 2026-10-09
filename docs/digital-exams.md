# Original-exam answer sheets and monitoring

This feature is for the original sitting of a Servants Prep exam. The questions
remain printed. Makeup exams remain entirely on paper, and existing makeup
booking and score-entry routes are unchanged.

## Leaders

Open **Exams → Answer sheet** on an existing exam. Enter the 50-answer key and
choose A–D through A–H separately for each question, then save setup. Open the exam
when students may begin. Opening is not restricted by the scheduled exam date and makes the sheet available to all eligible students. Choices and the answer key lock on first opening.

Monitoring shows the eligible roster, started attempts, progress, last contact,
paused attempts, submissions, and a durable activity history. Enable alert sound
using the dashboard button; browsers require that user gesture for audio.
Hidden-tab reports pause an attempt. Focus loss is logged separately without
pausing. A proctor may unlock a paused attempt once the student has returned to
the page and reconnected. Refreshing never clears a server pause.

Closing finalizes all started attempts, including paused attempts, using only
answers already saved on the server. Unanswered questions are incorrect. A
student submission is final, even after an exam is reopened. Reopening permits
only eligible students who have not already submitted to start. Release results
only after closing. Private grades are then written as original grades into
existing exam scores and analytics. Release fails without changing any grades
if existing scores overlap submissions; reconcile those original grades first.
Released exams cannot reopen. There is no individual countdown.

## Students

Use **Exam answer sheets** in Servants Prep. Students must have an active prep
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
- POST /api/digital-exams/:id: configure/open/close/unlock/release for writers;
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

Student navigation and direct answer sheet access are available only while an eligible exam is OPEN. Closing hides access, including submitted attempts. Released grades remain in My Progress; students never receive the answer key. Question choices can be configured from four to eight (A–D through A–H).
