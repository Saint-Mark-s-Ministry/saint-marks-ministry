# Servants Prep students on the Sunday School roster

Link a student's existing Prep `User` to their permanent `SundaySchoolChild`
record through `SundaySchoolChild.userId`. This preserves their separate Prep
and Sunday School enrollment, attendance, family, and account histories.
No schema migration is needed. It does not create a servant assignment or
change role tags.

The roster and child endpoints return `isServantsPrepStudent` when the linked
account is enabled and has an active Prep enrollment (`isActive` and `ACTIVE`
status). The roster renders **Servants Prep Student** next to the child's name.
The label follows enrollment status, including after grade 12. It is display
information and must never be used as an authorization check.

## Audit and link grades 11 and 12

Use `scripts/link-prep-roster-students.ts` with explicitly supplied environment
variables for the intended database. Bun loads `.env.local` by default, so do
not assume a command run from this checkout targets production. The script
requires `--expected-host` to match the supplied connection string.

Run an audit first:

```bash
bun scripts/link-prep-roster-students.ts --expected-host <database-host>
```

The audit reads enabled accounts with active Prep enrollments and their latest
approved registration, then compares them to Sunday School child records.
It reports students whose latest registration or matching roster record is in
grade 11 or 12. Registration grade can be historical; disagreement with the
roster grade is always flagged for review.

Only a unique full name, exact calendar birth date, matching grade, and an
active unlinked roster record qualify for automatic linking. Missing birth
dates, name collisions, grade differences, and another account's existing link
are reported for review. Existing links are preserved, including archived links.
Review unmatched names separately; this script does not guess identities or
consolidate two login accounts.

After reviewing the audit, rerun with `--apply` to link qualifying records in
one serializable transaction. The script rechecks evidence before writing;
failure rolls back the whole transaction. Repeating it preserves existing links.
Store audit output outside Git because it contains names and birth dates.

Verify each linked child still has the same child ID, class, family, and
attendance history. After deploying the app code, verify the roster badge while
signed in as a servant assigned to the relevant class. A link can be reversed
by clearing that child's `userId`, after checking it still refers to the same
account recorded in the audit.
