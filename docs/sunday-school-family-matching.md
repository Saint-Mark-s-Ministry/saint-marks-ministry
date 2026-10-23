# Sunday School family matching

Saving a child, committing a roster CSV, accepting a public roster sign-up, or
approving a child registration automatically connects records that share a
complete parent phone number. The comparison uses mother/father numbers, legacy
guardian numbers, and contact numbers on active linked guardian profiles (with
the linked parent's phone as a fallback). It never matches on names, addresses,
child cell numbers, or a phone-number suffix. Formatting is ignored; ten-digit
local numbers use the ministry's US/Canada country code, `1`. Incomplete,
ambiguous, and extension-bearing numbers are left for manual correction.

A shared parent connects families across classes and addresses. Connections
are transitive: two children sharing one parent can connect to another child
through the other parent. Additional parent numbers remain in the shared
family’s matching identities, so a later sibling can still match a parent whose
number differs from the displayed mother/father fields. The oldest family
record becomes the shared live record; ties use the record ID. A lone child with only legacy guardian contact
does not need an empty family record, but matching legacy siblings receive one.

Missing shared fields are filled from an agreed value in another connected
record. Existing nonblank values win. A child’s differing recorded values remain as
sparse overrides of shared fields, so connecting families does not change a
known address or parent detail for that child. Conflicting candidate values leave a
missing field blank rather than choosing arbitrarily. Conflicts do not block
family formation, including parent-name spelling differences. Children retain
their own birth dates, notes, cell numbers, and designated legacy guardian
contact; this feature does not infer that every child has the same two parents.
Named parent details and address are read from the shared family, so Henry sees
Johnny's recorded address immediately without a second stored address.

`SundaySchoolFamily.matchingHistory` retains source family snapshots, child IDs
that were relinked, copied-field provenance, conflicting values, time and actor.
Source family records are retained without children for recovery and excluded
from subsequent matching. This history is separate from the short-lived activity
log. Authorized roster viewers see conflicts and fields filled from other
records in the family dialog; corrections use the existing family editor.
Historical differences remain visible after correction as a record of the match.
CSV enrichment fills blank shared values and retains differing submitted values
in the same history instead of overwriting shared contacts.

Matching does not create guardian relationships, grant accounts access, or
change class assignments, attendance, enrollments, or child identity. Public
sign-up responses continue to return no family or contact information. Family
details and history remain in the existing authorized child/family responses.

## Existing records and deployment

Apply `20261023020000_family_matching_history` explicitly before deploying the
code or pointing a preview at that database. It adds a nullable JSONB history
column, a parent-phone identity array, and a nullable child overrides column.
It does not backfill or change existing family data. Builds never apply it.
Test the migration on an isolated database and keep the normal pre-release
backup. Rolling back the code can leave the additive columns in place; rolling
back family links is a separate data operation using the retained history.

After deployment, a priest or super administrator can choose **Match existing
families** on the Roster page to process the existing ministry roster in one
transaction. The endpoint is `POST /api/sunday-school/families/match`; it checks
current database role grants and returns counts only. Normal child writes match
only the connected components containing the children saved by that operation.
Every participating writer takes one transaction-scoped advisory lock before
writing contacts, so simultaneous submissions cannot create separate live
families. Re-running matching is a no-op once those records are connected.

## Validation

Unit and API tests run with `bun test:run`. The database suite also exercises the
actual child POST/PATCH routes, the committed migration, concurrent saves and
rollback. It is opt-in and requires an isolated local PostgreSQL schema named
`family_matching_test` on `127.0.0.1`, populated with the current Prisma schema:

```sh
RUN_FAMILY_MATCHING_DB_TESTS=1 \
FAMILY_MATCHING_TEST_DATABASE_URL="$SP_DATABASE_URL" \
bun test:run __tests__/integration/sunday-school-family-matching.test.ts
```

Set both Prisma database URLs to that isolated schema when preparing the test
database. The suite refuses any other hostname or schema and clears its fixtures
between cases. Production data must never be used for these tests.
