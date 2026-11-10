# Sunday School attendance QR

Each class meeting (one class + one UTC-normalized calendar date) gets its own
replaceable, random QR token. This is unrelated to Prep serving codes and to
roster/contact-update QR links.

## Using it

On the class Attendance page, choose its meeting date and **Show attendance QR**.
Codes can be prepared before the meeting. Each new meeting requires a new code;
replacing a code invalidates the previous one immediately. Display it on the
classroom screen or copy the check-in link. Only the class name, date, QR and
check-in count are displayed; no roster or family contacts are projected.

The church-local windows are fixed, independent of when the servant opens the QR:

| Class meeting | Class hour | QR accepts check-ins (America/New_York) |
| --- | --- | --- |
| Saturday (Elementary) | 11 a.m.–noon | 10:30 a.m.–12:30 p.m. |
| Sunday (other grades) | Noon–1 p.m. | 11:30 a.m.–1:30 p.m. |

Daylight saving is handled using America/New_York, not a fixed EST offset.
Opening/replacing a code cannot extend the window. **Stop check-in** or **Finish**
attendance closes it early. A scan outside the window or from an earlier meeting
cannot write attendance.

No accounts are required. Children type their full name in one field, then tap **I’m here**.
The public route matches one exact case-insensitive active roster name in the
code's class and queues a request. No-match, duplicate and ambiguous submissions
all return the same acknowledgement, preventing roster enumeration. Ambiguous or
unmatched names need a servant's help. The page never lists the class roster or
family contacts. First and last parts are compared as a combined name, never guessed by splitting the typed text. No birth dates or contact details are requested.

Name entry is not proof of identity or presence, so a servant must **Confirm**
requests from children who are there or **Dismiss** them. Only confirmation can
add attendance. Children without phones can still be marked manually. The
projected view uses short child-facing instructions; counts and management
buttons are hidden under **Servant controls**.

Confirmed requests add PRESENT once and show **QR check-in** in the servant's
roster. Repeated submissions do not overwrite an existing attendance mark,
including a servant's absence/late mark. Finish is blocked while eligible name requests await review. A manual correction clears the badge;
a separate audit event retains the QR origin. Attendance refreshes every five
seconds and preserves unsaved local marks. Finish locks the meeting against
scans, preserves new marks from other devices, and then records unmarked absences.
A recovered/lost-response draft cannot silently replace an unseen QR check-in.

A code can be forwarded, and a child can type another child’s name. Servant
confirmation, rather than name matching, is the attendance decision. Servants remain responsible for review.

## Routes and authority

- `POST /api/sunday-school/attendance/check-in`: class-serving staff or a super
  administrator open/replace/close codes and confirm/dismiss name requests. Authority, account state, and authVersion
  are re-read from the database. Priest accounts remain read-only for QR management.
- `GET /api/public/attendance-check-in`: public, token in `X-Attendance-Check-In`;
  returns only class/date/window metadata, never roster or attendance data.
- `POST /api/public/attendance-check-in`: public, JSON token + full name;
  rechecks the token window, class, issuer authority/authVersion and disabled
  state inside the locked submission. Token, network and name attempts are
  rate limited; cross-origin JSON writes are rejected. It can only queue a
  pending request, never write attendance.
- `/attendance-check-in#token=…`: token is in the fragment rather than URL query
  so it is not sent in page URLs/referrers. Reads use a request header and writes
  use JSON. Responses are not cached. No sign-in or new account is required.

The QR grants no general roster or ministry permissions. Moved/inactive children cannot submit eligible requests or be confirmed. Session row locks serialize
replacement, closure, Finish and scans. The attendance unique key plus
createMany(skipDuplicates) makes repeated/concurrent requests and confirmations idempotent.

## Deployment and rollback

Apply `20261110161000_sunday_school_attendance_qr` explicitly before deploying
code: it adds `SundaySchoolAttendanceCheckIn`, `SundaySchoolAttendanceCheckInRequest`, and nullable
`SundaySchoolChildAttendance.selfCheckedInAt`. Builds never apply it. Tested on
isolated Neon branch `br-snowy-shadow-adgck5ty` in project
`tiny-thunder-19717007`; production schema and attendance were not changed.
Before production deployment, take the usual snapshot, apply the additive
migration using the direct connection, verify schema and `/api/health`, then
deploy. Code rollback can leave the additive schema/data in place. No new env
variables or dependencies.

Run normal checks plus the opt-in real-database regression suite:
`RUN_QR_ATTENDANCE_INTEGRATION=1 bun test:run __tests__/api/sunday-school-qr-check-in.integration.test.ts`.
The suite refuses to run outside the named isolated compute and creates only
synthetic fixtures. Make the branch URL available to the test process. On this
machine Node 26 needs `NODE_OPTIONS=--no-experimental-webstorage` for Vitest.
