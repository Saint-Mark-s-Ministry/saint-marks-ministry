# Year 2 mentor renewal

Moving a student into Year 2 clears their mentor account, mentor name and phone,
and current-year mentor form in the same transaction. Previous mentor assignments
are ended with the promotion reason and retained as history. Assignment-derived
access is recalculated; the mentor keeps access to any other active mentees.
Saving a student who is already in Year 2 does not repeat the reset.

An active or withdrawn Year 2 student's mentor is populated only from their submitted form for
the active academic year. The original application, enrollment fields and previous
account cannot supply a fallback. Until submission, the roster displays **Form
not submitted** and account assignment is unavailable.

Submitting or resubmitting the form records a pending verification and creates a
persistent in-app notification for enabled Servants Prep servants and super admins
who may verify it. Priests and disabled staff receive no review task. The link
opens the student on **Student roster**, where staff can inspect the submitted
name, email and phone and choose **Verify mentor form**. Verification checks the
exact submission version, records the reviewer, clears all staff tasks for that
student/year and clears the student's mentor-information reminder. Resubmission
requires verification again and replaces earlier review notifications.

The submitted mentor contact and assigned app account remain separate: mentors
without an app account can still be submitted and verified. Assignment of an app
account to an active Year 2 student requires a submitted current-year form.

## Late submissions from withdrawn students

Withdrawn Year 2 students can still open Application, submit their current-year
mentor contact details, and upload the signed approval form, including legacy
students without an approved registration record. Submission creates the usual
staff verification notification. Staff can select Withdrawn on Student roster
(or follow the notification) and verify the form there.

Submission alone leaves the student withdrawn and excluded from attendance.
When staff verify a pending form, the same transaction reactivates a withdrawn
Year 2 enrollment, returning the student to the active attendance sheet on its
next load. Existing attendance records and the attendance start date are retained.
A stale or rejected verification cannot reactivate the student. Re-reviewing an
already verified form does not undo a later withdrawal, and graduated students
are never reactivated by this flow. No database migration is required.

## Existing records before deployment

No schema change or scheduled task is needed. Before deploying, take the normal
backup and preview the one-time repair for carried-over assignments:

```sh
bun scripts/reset-unsubmitted-year-two-mentors.ts
```

Using the intended database connection, apply the reviewed repair with:

```sh
bun scripts/reset-unsubmitted-year-two-mentors.ts --apply
```

The preview returns only a count and writes nothing. Applying clears mentor
details and ends assignment access only for active Year 2 enrollments without an
annual mentor submission in the active year. Submitted forms, other students,
assignment history and registration history are retained. The transaction is
serializable; a concurrent change aborts the repair rather than clearing a newly
submitted form. Re-running the repair is a no-op. Production data is never used
by the automated tests.

## Validation

The opt-in database suite requires `SP_DATABASE_URL`,
`SP_DATABASE_URL_UNPOOLED` and `MENTOR_RENEWAL_TEST_DATABASE_URL` to point to an
isolated PostgreSQL schema named `mentor_renewal_test` on `127.0.0.1`, prepared
with the current Prisma schema. It clears that schema's fixtures between tests.

```sh
RUN_MENTOR_RENEWAL_DB_TESTS=1 bun test:run __tests__/integration/year-two-mentor-renewal.test.ts
```
