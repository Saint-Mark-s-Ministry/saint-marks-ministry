# Async serving rotations

An async student completes one four-week rotation at each of ten grade levels:
Pre-K, Kindergarten, and grades 1–8. They begin at their assigned grade, advance
one grade at a time, and wrap from eighth grade to Pre-K. For example, a student
starting in second grade visits 2, 3, 4, 5, 6, 7, 8, Pre-K, Kindergarten, and 1.
Different classes within one grade do not add rotations.

## Student and servant workflow

A Servants Prep servant assigns the initial class and start date. The student
sees that class on **Sunday School** and its upcoming resources on **Class
lessons**. The printable form is available through **Attendance slip → Print**;
the browser print dialog also supports saving it as PDF.

The student fully attends four weeks, gets each week signed, and uploads one
photo or PDF of the completed form. Uploading does not credit attendance or
change their class. The student confirms all four weeks are signed; the server
also rejects uploads before the fourth rotation week. A servant checks the
actual signatures and dates before approval. Three weeks do not complete a
rotation, even if the attendance percentage so far is 100%.

In **Async students → Sunday School → Rotation forms**, a Servants Prep servant
views the evidence and either:

- approves four completed, signed weeks; or
- returns the form with correction notes, leaving the current class in place.

Approval executes in one serializable transaction: mark the form approved,
credit the four weeks, close the current rotation, and create the next grade's
four-week assignment. It prefers an active class with no rotating student, then
the class with the fewest active rotating students, using the class name to
break ties. Classes must belong to an open Sunday School year. If the next
grade has no eligible class, approval fails without changing the current form,
attendance, or rotation. Concurrent allocation conflicts are retried.

The next rotation starts no earlier than the week after the previous four weeks;
if review is delayed, it uses the current serving week. After all ten distinct
grades are approved, approval closes the last rotation without creating another.
Completed forms retain their served grade even if the class is later removed.
The progress and graduation checks count approved grades, including historical
rotations, rather than treating three attended weeks as completion.

Student and servant pages refresh after review and poll while open. Class
lessons also refreshes its scope, so students see materials for the new class.
No Sunday School ministry staffing, roster, attendance-editing, or lesson-editing
powers are granted by a prep rotation.

## API and evidence rules

- `POST /api/sunday-school/rotation-forms` accepts multipart `assignmentId`,
  `file`, and `completedWeeks=4`. Only an active async student may upload for
  their own active four-week assignment. Photos/PDFs are limited to 4.5 MB.
- `GET /api/sunday-school/rotation-forms` scopes reads to the student's own
  forms, a mentor's prep student scope, or prep managers/priests.
- `POST /api/sunday-school/rotation-forms/[id]/review` requires current database
  authorization, a form `version`, and `confirmedWeeks=4` for approval. Priests,
  disabled accounts, students, and the form's own student cannot approve it.
- Replacing a pending/rejected form increments its version and removes the old
  blob after persistence. Stale reviews and duplicate approvals fail. Failed
  persistence removes the new orphaned blob.
- Recorded attendance and forms prevent reassignment or deletion of the
  rotation. Completed rotations cannot be reopened. Only initial empty
  assignments may be corrected or deleted.
- Weekly code submission is retired with HTTP 410. Legacy code and log records
  remain available as historical data; they do not complete the ten-grade cycle.

## Migration and release

`20261012014500_four_week_rotation_forms` adds the form/status records and optional
log-to-form link, changes the default length to four weeks, and replaces the
one-rotation-per-academic-year index with one-active-rotation-per-student.
Historical rotations can coexist in the same year. A check constraint enforces
four-week active assignments while retaining historical lengths. A second check
limits signed forms to the ten rotation grades. The migration does not delete or
rewrite existing attendance, assignments, or enrollment years.

Before production deployment, check that no student has multiple active
rotations and all active assignments already have `totalWeeks=4`. Resolve an
invalid active assignment deliberately before applying the migration; do not
silently discard it or its attendance. Reconcile assignment/log counts before
and after deployment. Apply the reviewed migration with the direct database URL
before promoting the new app, coordinating serving writes during the release.
The old app must not create six-week rotations or query the old per-year unique
key after this workflow starts. `bun run build` never migrates a database.

All migration history and this migration were applied to a fresh isolated
PostgreSQL 17 database. Integration tests exercise the four-week evidence gate,
one-active constraint, vacancy allocation, stale reviews, missing-next-class
failure, and the full ten-grade wrap/finish cycle. A Neon rehearsal branch was
unavailable because the project's branch limit was full; production was only
queried read-only.

To run the database checks on a verified isolated database:

```sh
ROTATION_FORMS_INTEGRATION=1 \
ROTATION_FORMS_TEST_DATABASE_URL="$SP_DATABASE_URL" \
bun test:run __tests__/integration/rotation-forms.test.ts
```
