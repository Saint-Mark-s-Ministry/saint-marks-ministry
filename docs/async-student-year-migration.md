# Async students without a cohort year

Async Servants Prep students have `StudentEnrollment.yearLevel = null`.
In-person students require `YEAR_1` or `YEAR_2`. A database check constraint
enforces both rules. Switching to async clears the year atomically; switching
back requires selecting a year in the same request.

Registration reviewers can choose Year 1, Year 2, or Async as the starting
class. Choosing Async creates an enrollment with `isAsyncStudent = true` and
`yearLevel = null`, records the approval actor and date, and skips lesson
attendance backfill. Returning applicants keep their existing enrollment mode.

Async students can access both curriculum years' exams and makeup exams.
Lesson access and graduation analytics span academic years, and serving
requirements use signed four-week rotations across ten grades rather than a current cohort year. See [Async serving rotations](async-serving-rotations.md). Academic
years still identify enrollment dates, exams, lessons, and serving rotations.
Active async students confirm their mentor contact information for the active
academic year, including students without an original registration submission.
The independent Sunday School ministry's academic years are unaffected.

## Migration

`20261011160000_async_students_without_year` makes enrollment and prep-side
serving-rotation years nullable, clears existing async enrollment years and
rotation cohort labels, and adds the enrollment check constraint. It preserves
in-person years, attendance, exam results, serving logs, and mentor history.

Follow `AGENTS.md` and the database safety rules in
`docs/sunday-school-migration-runbook.md`: never use `db push` against a shared
database, use the direct connection for migrations, and never migrate from a
Vercel build.

## Rehearsal

Create a fresh, expiring child branch of production. Verify the project,
parent branch, database name, and applied migration history before writes.
Use branch connection strings only, without logging them or publishing a
preview connected to production-derived private data.

```bash
bun db:generate
bun db:deploy
bunx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --exit-code
bunx tsc --noEmit
bun lint
bun test:run
```

The diff must be empty. Capture these reconciliation counts before and after:

```sql
SELECT count(*) AS enrollments,
       count(*) FILTER (WHERE "isAsyncStudent") AS async_enrollments,
       count(*) FILTER (WHERE "isAsyncStudent" AND "yearLevel" IS NOT NULL) AS async_with_year,
       count(*) FILTER (WHERE NOT "isAsyncStudent" AND "yearLevel" IS NULL) AS regular_without_year
FROM "StudentEnrollment";

SELECT count(*) AS rotations,
       count(*) FILTER (WHERE "yearLevel" IS NOT NULL) AS rotations_with_year
FROM "SundaySchoolAssignment";
```

Total enrollment, async enrollment, and rotation counts must stay unchanged.
After migration the three invalid-year counts must be zero. Stop if any count
differs from the expected source count.

The October 11, 2026 SQL rehearsal on Neon project `tiny-thunder-19717007`,
child branch `br-floral-firefly-adye685s` of `br-billowing-voice-admn3rrs`,
preserved 95 enrollments, including six async students, and three rotations.
The exact committed migration SQL was executed in a transaction through the
Neon connector. This SQL-only rehearsal did not register the new migration in
the child branch's Prisma history; use a fresh branch for a native deploy
rehearsal rather than rerunning it on that branch. The complete Prisma migration
history was also deployed to a fresh PostgreSQL 17 test database, with an empty
schema diff and database constraint tests.

Optional database tests require an isolated database and matching test URL:

```bash
ASYNC_YEAR_INTEGRATION=1 \
ASYNC_YEAR_TEST_DATABASE_URL="$SP_DATABASE_URL" \
bun test:run __tests__/integration/async-enrollment-year.test.ts
```

## Production release

Coordinate the database migration and app promotion in a maintenance window.
The old Prisma client expects non-null enrollment years and cannot serve
existing async rows after they are cleared. Old app instances must not receive
traffic or write enrollments after this migration.

1. Build and review the new app with its regenerated Prisma client. Rehearse
   on a fresh production-derived branch immediately before release.
2. Take a snapshot or backup, including the original enrollment and rotation
   years. Verify the production project, host, database, and migration history.
3. Pause app traffic and background writers; capture reconciliation counts.
4. Run `bun db:deploy` with production's direct `SP_DATABASE_URL_UNPOOLED` and
   its paired pooled `SP_DATABASE_URL`. Verify the counts and schema diff.
5. Promote this app version before restoring traffic. Check `/api/health`, an
   async student's editor, both curriculum years' exam access, serving
   progress, and a regular student's year selector.

Do not roll back to the old app with yearless rows still in the database. A
rollback needs the backed-up year values and restoration of the old schema,
with writes paused and any enrollments created since release reconciled.
Prefer a forward fix when possible.
