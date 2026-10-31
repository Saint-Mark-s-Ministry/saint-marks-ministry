# Servants Prep students on the Sunday School roster

Link a student's existing Prep `User` to their permanent `SundaySchoolChild`
record through `SundaySchoolChild.userId`. This preserves their separate Prep
and Sunday School enrollment, attendance, family, and account histories.
No schema migration is needed. It does not create a servant assignment or
change role tags.

The roster, class detail, and child history endpoints return
`isServantsPrepStudent` when the linked account is enabled and has an active Prep
enrollment (`isActive` and `ACTIVE` status). The roster renders **SP Student**
beside the child's name.
The same badge appears in each class's roster and the student history dialog
opened by selecting a child's name, beside the name in the dialog header.
The label follows enrollment status,
including after grade 12. It is display information and must never be used as an
authorization check.

The iOS app shows the same **SP Student** pill in each roster row, on the child's
profile, and in the student history sheet. It displays `isServantsPrepStudent` exactly as
the server sends it (only a literal `true` counts) and nothing else: it does not look at the
grade, the account's role or the name, does not query Prep, does no matching or linking, and
the pill is not tappable and gates nothing. A disabled account, an ended enrollment, or an
unlinked child shows no pill; a linked student with an active enrollment keeps it after grade 12.

Photos also follow the existing account link. A Sunday School photo takes
priority; otherwise the roster, class page, and child history use the linked
account's current profile photo. Account photos are read when loading the
records, so changing a Prep photo carries through without copying image URLs
into the child record. Removing a Sunday School photo restores the account
photo fallback.

When staff confirm a spelling variant belongs to the same person, use the
Servants Prep account's spelling on the linked Sunday School child record.
Keep the existing child ID and history; a name correction does not require a
replacement record or a birth-date correction.

## Automatic matching on registration approval

Approving a Prep registration now attempts the same grade 11/12 identity match
inside the approval transaction, after the registration is marked approved.
It uses the account's latest approved registration, an enabled account and an
active Prep enrollment. Both in-person and async approvals follow this flow.

Only a unique normalized full name, exact birth date, and matching grade can
create a link to an active unlinked Sunday School student roster record.
Duplicate names on either side, missing or conflicting birth dates, grade
differences, and archived records stay unlinked. Existing links always remain
intact, including owner-confirmed exceptions and archived links.

The approval response includes a status and reason without candidate identities
or birth dates. Reviewers see whether a link was created or requires review.
Successful links are audited with actor, student, child and registration IDs.
All approval writes use a serializable transaction; changed evidence or a
concurrent link rolls back approval and returns a retry message. No matching
emails are sent and no cron job or schema migration is needed.

This links a Prep account to a Sunday School **student** record. It does not
merge login accounts, grant role tags, assign servants, transfer classes, rename
students, or alter birthdays, families or attendance. Existing unmatched records
are not swept by an unrelated approval. Use the audit CLI below for existing
students or a roster record created after their registration was approved.

## Audit and link grades 11 and 12

The production Neon project is `tiny-thunder-19717007`; its production `main`
branch is `br-billowing-voice-admn3rrs`. Pass these IDs explicitly to Neon tools.
Shared projects may not appear in the connected account's project listing.

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
