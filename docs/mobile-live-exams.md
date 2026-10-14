# Native live exams and proctoring

This is the Servants Prep original-exam workflow. Students still read printed
questions. Paper makeup exams and score entry remain separate.

## Open the feature

- Prep servants and super admins: **Servants Prep → More → Exam Monitoring**,
  or **Exams → Exam Monitoring**. Priests see the same monitoring screens with
  no write controls.
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

The dashboard polls every two seconds while focused and active. A failed
refresh removes the previous live status and controls until a successful
refresh. It does not label cached status as live. New interruption events
produce visible alerts and a haptic, with optional audible local notification
alerts. Existing events are deduplicated; answer saves do not sound.

## Student behavior

Students acknowledge the monitoring notice before starting. Answers autosave
one at a time using the API's revision and session-token checks. Saves,
heartbeats, activity reports and submission are serialized so a slow response
cannot race another write. The app sends heartbeats every ten seconds and
refreshes the visible answer sheet every two seconds to observe unlocking and
exam state changes. No Pusher credentials are needed on the phone.

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
previous version's pending choices. The server remains authoritative across
web and native sessions. Switching to a different answering session follows
the existing 30-second recovery and proctor-unlock rules.

The screen requests native keep-awake while an open attempt is visible and
started, and releases it on submission, closure or departure. Locking a device
still pauses answering. View As cannot start, answer, submit, or manage an exam.

## Build and verification

The existing `/api/digital-exams` endpoints provide all data and enforce current
database authority, enrollment eligibility, private results, and transaction
locks. This feature adds no endpoint, schema change or permission grant.
Shared API shapes live in `packages/contracts/src/digital-exams.ts`; shared
activity labels live in `packages/domain/src/exam-activity.ts`.

The Expo notifications plugin bundles the same six proctor WAV clips as the
web. **A new native build is required for these sound assets**; a JavaScript
update alone cannot add them to an installed binary. Sound is off initially,
requires notification permission, and follows the device's notification,
volume and Focus settings. Audible alerts are spaced by at least eight seconds
to avoid overlapping clips. Student devices remain silent.

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
Database integration tests still require an explicitly isolated test database
as described in `digital-exams.md`. Rehearse on physical devices before a real
exam, especially interruption delivery, sounds, and Focus behavior.
