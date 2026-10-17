# Replacing a duplicate SP student account

In **Registrations**, an exact-name match with a different email offers
**Approve and replace old account**. Reviewers must confirm that the accounts
belong to the same person, then explicitly choose whether to transfer SP history
or start fresh. Neither choice is submitted until they confirm approval.

The transfer keeps attendance, exam scores (including notes and grading data),
paper makeup results, digital exam attempts and their events/archives,
student notes, expected absences, attendance and confession slips, prep serving
assignments, signed rotation forms and logs, annual mentor information, makeup bookings, previous
applications, and retired async lesson-note submissions. Record IDs and their
relationships are retained. The original enrollment is moved so its dates,
academic year, status, graduation information, and mentor
assignment history remain available. The reviewer's selected starting class (Year 1, Year 2, or Async) applies; async
enrollments retain the current yearless invariant. Other preserved settings
include their attendance start date and async reason;
newly supplied father-of-confession and mentor contact information update the
enrollment. Existing attendance is not backfilled with additional absences.

The application supplies the new account's identity and temporary password.
Sunday School ministry authority, guardian relationships, and additional role
tags are not transferred by this SP operation.

Approval, transfer, deletion, and an audit event happen in one serializable
transaction. A transfer or deletion failure rolls everything back. Existing
protected-record restrictions still apply. Only `SUPER_ADMIN` and `SERVANT_PREP`
can replace accounts; the reviewer and duplicate match are rechecked in the
transaction. Only a super admin may replace an account with other active
ministry role tags. Priests remain read-only.

Choosing a fresh record explicitly deletes the old account's dependent history.
Requests that replace an account without an explicit boolean `migrateHistory`
are rejected. Ordinary approval without account replacement is unchanged.

Automated coverage lives in `__tests__/api/registration-review.test.ts`,
`__tests__/lib/student-prep-migration.test.ts`, and
`__tests__/components/replace-student-account-dialog.test.tsx`.
`bun scripts/check-student-prep-migration.ts` checks real relationships,
cascades, and rollback against a local database with the current schema. It
refuses remote databases and rolls back every fixture.
