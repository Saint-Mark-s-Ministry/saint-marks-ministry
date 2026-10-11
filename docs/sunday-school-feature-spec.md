# Sunday School Identity, Rosters, Permissions, and Annual Rollover

Status: Revised implementation specification; production rollout gated by branch rehearsal
Last updated: September 15, 2026

## 1. Product definition

Build a unified identity and permissions system where one person can participate in several ministries without duplicate accounts or mutually exclusive roles.

Success means:

- A user can simultaneously be a Servants Prep servant, Sunday School servant, parent, student, priest, or Super Admin.
- Mentor and coordinator access comes from current assignments, not permanent role tags.
- Only active Servants Prep students can have mentors.
- Children can exist in Sunday School without an email or login.
- Parents authenticate with email and can only access children linked to them.
- Optional Sunday School student accounts use email or username and are linked to an existing child record.
- Coordinators can manage servant placement within their authorized scope.
- Classes and rosters advance automatically each September 11 without overwriting history.
- Production data is migrated through a branch-first, reversible rollout.

Out of scope for this release:

- Parent self-claiming of existing children without staff approval.
- Automatic email delivery of credentials or invitations.
- Multiple simultaneous mentors for one Servants Prep student.
- Automatically copying servant or coordinator assignments during annual rollover.
- Replacing the existing Servants Prep academic-year rules.

## 2. Identity and authorization model

### Stored role tags

`RoleTag` values:

- `SUPER_ADMIN`
- `PRIEST`
- `SERVANTS_PREP_SERVANT`
- `SERVANTS_PREP_STUDENT`
- `SUNDAY_SCHOOL_SERVANT`
- `SUNDAY_SCHOOL_STUDENT`
- `PARENT`

There will be no stored `MENTOR` or `COORDINATOR` role.

- Mentor access is derived from an active `MentorAssignment`.
- Coordinator access is derived from a current `SundaySchoolServantAssignment` whose authority is `COORDINATOR`.
- Sunday School servant search returns active users with `SUNDAY_SCHOOL_SERVANT`, searching name, email, username, and phone.
- Role tags grant general eligibility or mode access; assignments determine which people, classes, age groups, or years the user can manage.
- Roles use normalized assignment rows, not a PostgreSQL string array. This preserves history, provenance, uniqueness, and indexing.

### Permission matrix

| Identity/access | Permissions |
| --- | --- |
| Super Admin | Full read/write access, role management, age-group coordinator appointment, cross-group servant moves, class archival/deletion, and account linking |
| Priest | Read access to every mode and record; the `PRIEST` tag overrides all other tags and assignments for business-data writes |
| Servants Prep servant | Existing broad Prep administration, including mentor management, but not role-tag administration |
| Derived mentor | Limited mentor workspace containing only actively assigned Servants Prep students |
| Servants Prep student | Own Prep profile, attendance, grades, resources, and current mentor |
| Sunday School servant | Sunday School mode; operational access only to assigned classes |
| Age-group coordinator | Manage rosters, classes, ordinary servants, and class coordinators inside the assigned age group and year |
| Class coordinator | Add/remove ordinary servants in their own class; cannot move servants or manage coordinators |
| Sunday School student | Read-only access to their linked child record, class, grade, attendance, lessons, and resources |
| Parent | Submit child registrations and view current/history data only for actively linked children |

Specific rules:

- Only Super Admin can manually grant or revoke role tags.
- Controlled workflows may grant narrowly defined tags during Prep registration, parent signup, child registration, guardian linking, Sunday School account linking, graduation, and migration.
- `PRIEST` is a deny-writes override even if the same user also has `SUPER_ADMIN` or coordinator assignments. Password/security maintenance remains available.
- A mentor candidate must be active and have at least one staff-capable tag: Super Admin, Priest, Servants Prep servant, or Sunday School servant.
- A mentee must have an active Servants Prep enrollment and `SERVANTS_PREP_STUDENT`.
- A Sunday School servant tag without a class assignment produces an empty Sunday School staff workspace, not access to every roster.
- Removing a dependency-bearing role is blocked until its active enrollment, child-account link, or guardian relationship is resolved.

### Authentication

- Keep one stable `User.id`; never use email, username, name, or roster position as a primary key.
- Continue using string CUIDs for all internal records and foreign keys.
- `User.email` becomes optional.
- Add optional `User.username`.
- At least one of email or username is required for every login account.
- Email and username uniqueness is case-insensitive using partial functional PostgreSQL indexes.
- Username format is 3–40 lowercase characters from `a-z`, `0-9`, `.`, `_`, and `-`; email-looking usernames are rejected.
- The login form accepts a single “Email or username” value.
- Parents continue to require email and password.
- Children do not require a `User` row.
- An optional child login is normally offered for Grade 7+, but the grade threshold is a UI recommendation, not a database restriction.
- When creating a child account, staff confirms a suggested username; the server generates a temporary password, returns it once, and requires a password change.
- Existing Prep users are linked to the child record instead of creating duplicates.
- Google login remains email-based and only links to an existing matching account.
- API authorization reloads active roles and assignments from the database; stale JWT role claims cannot authorize writes.

## 3. Complete affected database schema

Existing unrelated Servants Prep, exam, note, notification, and resource tables remain unchanged.

### `User`

Retain the existing stable ID and profile fields, with these changes:

- `email String?`
- `username String?`
- `password String?` to support OAuth-only accounts
- `serviceStartedOn DateTime? @db.Date`
- Existing `role` remains temporarily during compatibility rollout, then is removed.
- Existing binary account flags may remain; no new role booleans are introduced.
- Database check: `email IS NOT NULL OR username IS NOT NULL`.
- Partial case-insensitive unique indexes on non-null email and username.
- Users with historical records are disabled, not hard-deleted.

`serviceStartedOn`:

- Represents overall service tenure, not one ministry.
- Has no authorization effect.
- Is editable by the user and Super Admin, except Priest remains read-only.
- When a graduating Prep student receives their first servant tag, default it from `graduatedAt` if blank.
- Never overwrite an existing value automatically.

### `UserRoleAssignment`

Fields:

- `id`
- `userId`
- `tag RoleTag`
- `source RoleGrantSource`
- `grantedAt`
- `grantedById?`
- `revokedAt?`
- `revokedById?`
- `note?`

`RoleGrantSource` values:

- `SUPER_ADMIN`
- `PREP_REGISTRATION`
- `PARENT_SIGNUP`
- `CHILD_REGISTRATION`
- `GUARDIAN_LINK`
- `SUNDAY_SCHOOL_ACCOUNT`
- `GRADUATION`
- `MIGRATION`
- `SYSTEM`

Constraints:

- One active row per `(userId, tag)` using a partial unique index where `revokedAt IS NULL`.
- `revokedAt >= grantedAt`.
- Revocation closes the historical row; role rows are not deleted.

### `MentorAssignment`

Fields:

- `id`
- `studentEnrollmentId`
- `mentorUserId`
- `assignedById?`
- `assignedAt`
- `effectiveFrom?`
- `endedAt?`
- `endedById?`
- `endReason?`

Constraints:

- One active mentor per Servants Prep enrollment.
- Student and mentor cannot be the same user.
- Assignment target must be an active Servants Prep student.
- Reassignment ends the previous row and creates a new row in one transaction.
- Existing mentor history is retained indefinitely.

`StudentEnrollment.mentorId`, `mentorName`, and `mentorPhone` are compatibility fields during rollout and are removed in the later contract migration. `EnrollmentStatus` becomes the source of truth instead of duplicating it with `isActive`.

### `SundaySchoolYear`

Fields:

- `id`
- `name`
- `startDate @db.Date`
- `endDate @db.Date`
- `status: DRAFT | OPEN | CLOSED`
- `previousYearId?`
- `createdAt`
- `updatedAt`

Constraints:

- Years cannot overlap.
- `startDate <= endDate`.
- At most one year is `OPEN`; date containment in `America/New_York` selects it
  for current work. `DRAFT` allows review before cutover and `CLOSED` preserves
  completed history.
- Sunday School years run September 11 through September 10.
- The current year is `2026–2027`, running September 11, 2026 through September 10, 2027.
- Existing `AcademicYear` becomes explicitly Servants Prep-only.

### `SundaySchoolAgeGroup` and `SundaySchoolAgeGroupLevel`

`SundaySchoolAgeGroup` fields:

- `id`
- `sundaySchoolYearId`
- `name`
- `sortOrder`
- `status`
- timestamps

`SundaySchoolAgeGroupLevel` fields:

- `id`
- `sundaySchoolYearId`
- `ageGroupId`
- `level`

Constraints:

- A grade belongs to at most one age group in a given year.
- The normalized level table replaces the current enum-array mapping.
- Age-group definitions are copied to the new year during rollover, but coordinator assignments are not.

### `SundaySchoolClass`

Fields:

- `id`
- `sundaySchoolYearId`
- `level`
- `sectionName`, default `General`
- `name`
- `status: ACTIVE | ARCHIVED`
- timestamps

Constraints:

- Unique `(sundaySchoolYearId, level, sectionName)`.
- The year/grade combination must match related enrollments.
- Only active classes may receive new enrollments or assignments.
- Super Admin may permanently delete a class only when it has no enrollments, sessions, lessons, attendance, visitations, or assignment history.
- Otherwise, “Delete” performs an archive and preserves historical reporting.

### `SundaySchoolChild`

This is the permanent person record and does not represent a particular grade or year.

Fields:

- `id`
- `firstName`
- `lastName`
- `birthDate?`
- `familyId?`
- `userId?`, unique
- legacy/contact fields
- `status: ACTIVE | INACTIVE | ARCHIVED`
- timestamps

Changes:

- Grade and class move to `SundaySchoolEnrollment`.
- A child may exist with no email and no User account.
- Name alone is never treated as a unique identity.
- Probable duplicates are surfaced for staff review rather than silently merged.

### `SundaySchoolEnrollment`

Fields:

- `id`
- `childId`
- `sundaySchoolYearId`
- `level`
- `status: ACTIVE | COMPLETED | WITHDRAWN | GRADUATED`
- `previousEnrollmentId?`
- `rolloverDisposition: PROMOTE | HOLD | WITHDRAW | GRADUATE | OVERRIDE`
- `nextLevelOverride?`
- `enrolledAt`
- `endedAt?`
- timestamps

Constraints:

- One enrollment per child per Sunday School year.
- Class, level, and year must agree.
- Only Super Admin manages rollover exceptions.
- Parent/student history reads these year-specific rows.

### `SundaySchoolClassPlacement`

Class membership is historical rather than a mutable field on the yearly
enrollment. This is required because children may move between sections during
the same year.

Fields:

- `id`
- `enrollmentId`
- `classId`
- repeated `sundaySchoolYearId` and `level` for composite foreign-key validation
- `startedAt`
- `endedAt?`
- `movedById?`
- `moveReason?`

Constraints:

- One active placement per enrollment using a partial unique index where
  `endedAt IS NULL`.
- Composite foreign keys require the enrollment and class to share the same
  Sunday School year and level.
- Moving a child closes the active placement and creates the destination
  placement in one transaction.
- Attendance and visitation reference the enrollment and placement so a later
  move cannot rewrite historical class context.

### Visitation notes and priest confidentiality

- A new visitation may include an optional shared note and an optional private
  note to priests.
- `SundaySchoolPriestNote` stores `visitationId`, `authorId`, `content`, and
  timestamps. The required visitation foreign key provides the child, class,
  date, and historical context; the note does not duplicate `childId`.
- The visitation and optional private note are created in one transaction.
- The author may read only private notes they submitted. Users with an active
  `PRIEST` tag may read all private notes. `SUPER_ADMIN` alone does not grant
  access.
- Private content is excluded from shared visitation responses, audit metadata,
  and notification previews.
- Creating a private note alerts all other active Priest-tagged users with a
  generic in-app notification and optional push alert.

### `SundaySchoolServantAssignment`

Fields:

- `id`
- `userId`
- `sundaySchoolYearId`
- `authority: SERVANT | COORDINATOR`
- exactly one of `classId` or `ageGroupId`
- `assignedById?`
- `assignedAt`
- `endedAt?`
- `endedById?`
- `endReason?`

Constraints:

- Age-group assignments must use `COORDINATOR`.
- No duplicate active assignment for the same user, year, and scope.
- Class and age group must belong to the assignment’s year.
- A move closes the old row and creates the target row atomically.
- “Add another class” creates another active class assignment without ending the first.
- Only Super Admin appoints age-group coordinators.
- Age-group coordinators can manage class coordinators only within their own group.
- Class coordinators can manage ordinary servant assignments only in their own class.

### Parent and guardian records

`SundaySchoolGuardianProfile` represents a guardian whether or not that person
has a login. It stores name/contact information and may link to one `User`.

`SundaySchoolChildGuardian` retains the many-to-many relationship and adds:

- `guardianProfileId?` during compatibility rollout, required after backfill
- `linkedById?`
- `linkedAt`
- `endedAt?`
- `relationshipLabel?`

Rules:

- `PARENT` alone does not expose child records.
- Data access requires an active guardian link.
- Parent signup creates the account and `PARENT` role but may initially show an empty portal.
- An approved `ChildRegistrationRequest` creates/reuses the child, creates the enrollment, links the submitting parent, and ensures the parent role in one transaction.
- Staff may link an existing user as guardian; the workflow adds `PARENT` with source `GUARDIAN_LINK` if needed.
- Parents cannot self-claim an existing child from name or birth date alone.

`ChildRegistrationRequest` gains an explicit `sundaySchoolYearId` and records the resulting enrollment.

### Attendance and history

- `SundaySchoolSession` and `SundaySchoolWeeklyLesson` remain class-scoped and therefore year-scoped through the class.
- `SundaySchoolChildAttendance` references `SundaySchoolEnrollment` and the
  applicable `SundaySchoolClassPlacement`, preserving the grade/class context
  when a child advances or moves sections.
- `SundaySchoolVisitation` references the enrollment and placement for the same reason.
- Servant attendance retains user identity plus session; assignment validity is checked against the session date.
- Existing resource and feedback tables remain unchanged.

### Import and rollover audit tables

`SundaySchoolRosterImport` fields:

- `id`
- `sundaySchoolYearId`
- `classId`
- `idempotencyKey`
- `fileName?`
- `requestHash`, bound to the idempotency key
- `status: PREVIEWED | IN_PROGRESS | COMMITTED | FAILED`
- `createdById`
- row totals and summary
- timestamps

`SundaySchoolRosterImportRow` records the row number, outcome, resulting child
and enrollment IDs, and a non-sensitive error code. Raw roster rows and files
are not retained indefinitely.

`SundaySchoolRolloverRun` fields:

- `id`
- `sourceYearId`
- `targetYearId`
- `status: RUNNING | COMPLETED | FAILED`
- `startedAt`
- `completedAt?`
- `errorSummary?`
- `triggeredById?`

`SundaySchoolRolloverItem` records one source enrollment per run, its explicit
disposition, target enrollment, source/target grade, status, and error code.
This is the authoritative explanation of what happened to each child; the
enrollment status does not double as a rollover result.

Both use unique/idempotency constraints to prevent repeated imports or rollover duplication.

## 4. Workflows and interfaces

### Role administration

- Replace the single-role selector with checkboxes/tags.
- `PUT /api/admin/users/:id/roles` accepts the desired `RoleTag[]` plus an optional audit note.
- The server diffs active assignments, grants/revokes transactionally, and returns the resulting active roles.
- Role edits require Super Admin and reject Priest writers.
- Role changes never overwrite assignment history.

### Mentor management

- Search eligible mentors across all staff-capable role tags.
- Creating a mentor assignment ends any current mentor assignment in the same transaction.
- Ending the final assignment removes derived mentor access but does not revoke unrelated role tags.
- Graduating or withdrawing a Prep student closes the active mentor assignment.
- Historical mentors remain reportable.

### Sunday School student accounts

- Super Admin-only account-linking screen on the child profile.
- `PUT /api/sunday-school/children/:id/account` supports linking an existing `userId` or creating a username/password account from the child’s name.
- The operation links `child.userId` and grants `SUNDAY_SCHOOL_STUDENT` atomically.
- `DELETE` unlinks the account and revokes the role without deleting the User or history.
- `/api/sunday-school/student/me` requires both the active role and matching child linkage.

### Parent flow

1. Parent signs up with email/password; `PARENT` is granted with source `PARENT_SIGNUP`.
2. Parent submits a registration for a selected year and intended grade.
3. Authorized staff approves and selects a class.
4. Approval creates/reuses the child, creates the enrollment, and creates the guardian relationship.
5. Parent portal queries only children with active guardian links.

Any signed-in user may begin the child-registration flow; successful submission or guardian linking adds the parent tag through the controlled workflow.

### Servant placement

- Search-as-you-type servant selector replaces long scrolling lists.
- Search returns active accounts eligible to serve in Sunday School, including
  mentors and Servants Prep servants who may serve in both programs, plus super
  admins who explicitly carry the `SUNDAY_SCHOOL_SERVANT` tag.
- Creating an assignment automatically grants `SUNDAY_SCHOOL_SERVANT` when the
  active tag is missing; the assignment and tag grant commit atomically.
- The tag grants Sunday School mode participation while the assignment alone
  determines the servant's class or age-group scope.
- Move ends the source assignment and creates the destination assignment.
- Existing add-assignment behavior is used for “Add another class.”
- Server authorization is calculated from both current-year assignment scope and the source/target class age groups.
- Crossing age-group boundaries always requires Super Admin.

### Roster import

Add a Sunday School-specific import flow and API.

Required selections:

- Sunday School year
- Target class
- Spreadsheet/file

Required row fields:

- First name
- Last name

Optional fields:

- Birth date
- family/household information
- guardian contact information
- notes
- explicit existing child match

Flow:

1. `PREVIEW` parses and validates without writing.
2. It reports invalid rows, likely duplicates, existing-child matches, and class/year conflicts.
3. Staff explicitly resolves ambiguous duplicates.
4. `COMMIT` uses an idempotency key and writes the entire accepted import transactionally.
5. A failure rolls back the full import.

A roster imported into Grade 8 for the 2026–2027 year on September 11, 2026 remains Grade 8 for that year. It advances to Grade 9 on September 11, 2027.

### Annual rollover

A secured daily cron route checks the New York date.

At the September 11 boundary:

- Create or ensure the new September 11–September 10 year.
- Copy age-group definitions.
- Clone each active class into the next grade with the same section name.
- Create next-year enrollments for active children.
- Mark successfully advanced old enrollments `COMPLETED`; the corresponding
  rollover item records that the result was a promotion.
- Grade 12 becomes `GRADUATED` with no new enrollment.
- `HOLD` repeats the current grade.
- `WITHDRAW` and `GRADUATE` create no new enrollment.
- Apply an explicit `nextLevelOverride` when present.
- Archive completed-year classes after successful rollover.
- Do not copy servant or coordinator assignments.
- Record an auditable, idempotent rollover run.
- Provide Super Admin with preview, retry, and manual-run controls.

## 5. Production-safe migration and release

### Security prerequisite

Database and blob credentials previously shared during planning must be treated as exposed and are intentionally not recorded in this document.

- Create a restricted runtime database role instead of using the Neon owner role in the application.
- Keep an owner/direct credential only for migrations.
- Rotate the database owner password and Blob token.
- The Vercel project owner must update production environment variables before old credentials are revoked.
- Preview deployments must use a Neon branch and a separate Blob store/token, or have upload writes disabled.

Database credentials are sufficient to apply a schema migration, but they are not sufficient to safely rotate or update the live Vercel deployment configuration.

### Migration-history prerequisite

- The production schema must exactly match the pre-feature Prisma schema.
- Create a checked-in `0_init` baseline migration representing that schema.
- Mark `0_init` as applied on existing databases; never execute it against an
  existing production database.
- Verify a fresh database can be rebuilt from the checked-in migration history.
- Use `prisma migrate deploy` with a direct connection for branch and production
  migrations. Never use `prisma db push` for release work.

### Branch-first rehearsal

- Do not reuse the existing stale preview branch.
- Create a fresh Neon branch from the latest production `main`.
- Run only migration deployment commands, never schema push, against the fresh branch.
- Deploy and test the feature against that branch.
- Confirm the live app remains connected to production throughout rehearsal.
- Take a production restore point immediately before the production migration.

### Expand, backfill, cut over, contract

1. **Expand:** Add new nullable columns, enums, role/assignment/year/enrollment tables, indexes, and constraints without removing old fields.
2. **Backfill roles:**
   - `SUPER_ADMIN` → `SUPER_ADMIN`
   - `PRIEST` → `PRIEST`, `SERVANTS_PREP_SERVANT`, `SUNDAY_SCHOOL_SERVANT`
   - `SERVANT_PREP` → `SERVANTS_PREP_SERVANT`
   - `STUDENT` → `SERVANTS_PREP_STUDENT`
   - `SERVANT` → `SUNDAY_SCHOOL_SERVANT`
   - `PARENT` → `PARENT`
   - Legacy `MENTOR` becomes derived from active mentor assignments and receives no artificial permanent mentor tag.
3. Backfill the 60 observed mentor links into `MentorAssignment`; 52 remain
   active and the 8 withdrawn enrollments receive closed historical rows.
   Historical effective dates remain unknown rather than fabricated.
4. Create the 2026–2027 Sunday School year.
5. Move the existing “9th Grade” class into 2026–2027 as section `General` without promoting it. Any roster added before migration follows that class.
6. Deploy dual-compatible application reads, verify results, then switch authorization to the new tables.
7. Keep legacy columns through an observation period.
8. Remove the singular role and redundant mentor/active fields in a later contract migration and follow-up PR.

Baseline reconciliation must account for the currently observed 104 users, 66 Prep enrollments, 60 legacy mentor links (52 active and 8 withdrawn), and one Sunday School class. Every discrepancy blocks production rollout until explained.

## 6. Interactive linkage diagram deliverable

Create an interactive schema diagram with these views:

- **Schema:** clickable entities, field summaries, PK/FK links, cardinality, and database constraints.
- **Roles vs. assignments:** clearly separates broad role tags from scoped mentor/coordinator assignments.
- **Permission explorer:** choose a sample persona and see visible modes, records, and permitted actions.
- **Authentication paths:** parent email login, optional student username login, existing-account linking, and children without accounts.
- **Rollover timeline:** September 10 to September 11 transition, class cloning, student promotion, exceptions, and staff-reset behavior.
- **Migration layers:** current schema, additive compatibility state, and final contracted schema.

Include representative combined identities:

- Priest plus both servant tags
- Servants Prep servant plus Sunday School servant
- Sunday School servant plus derived mentor
- Parent plus servant
- Prep student plus Sunday School student
- Child with no account

The diagram must emphasize: **role tag grants a mode; assignment grants a scope; relationship grants access to another person’s data.**

## 7. Test and acceptance plan

- Verify every meaningful role combination and the Priest write-denial override.
- Verify manual role changes are Super Admin-only and preserve grant/revocation history.
- Verify email/username login, case-insensitive uniqueness, nullable child email, temporary passwords, and OAuth behavior.
- Verify parent accounts cannot access unlinked children or self-claim records.
- Verify Sunday School student access requires both role and child linkage.
- Verify only active Prep students can receive exactly one active mentor.
- Verify a Sunday-only servant with a mentee receives limited mentor access, not full Prep administration.
- Verify servant search, class assignment, add-another, same-group moves, cross-group denial, and coordinator management boundaries.
- Verify class hard deletion is limited to unused classes and historical classes archive safely.
- Verify roster preview, duplicate resolution, atomic commit, idempotent retry, and explicit year selection.
- Test rollover on September 10, September 11, repeat execution, failure/retry, Grade 12, holds, withdrawals, custom overrides, missing classes, and late current-year imports.
- Reconcile all production counts and sample historical records on the fresh Neon branch.
- Run regression tests for existing Prep registration, attendance, grading, mentoring, parent registration, Sunday School attendance, and weekly lessons.
- Do not merge or migrate production until branch tests, preview deployment, rollback procedure, secret rotation coordination, and data reconciliation pass.

## 8. Design decisions and tradeoffs

- A string array of roles would be simpler initially but cannot reliably provide validation, grant history, source tracking, or one-active-role constraints; `UserRoleAssignment` is the safer design.
- Making mentor a tag would leave stale mentors after their last mentee; deriving it from active assignments avoids that.
- Making coordinator a tag would give unscoped authority; keeping it on year/class/age-group assignments prevents privilege leakage.
- Storing grade directly on a child would destroy annual history; yearly enrollment is the correct source of grade and class.
- Sharing `AcademicYear` between Prep and Sunday School would couple incompatible calendars; `SundaySchoolYear` removes that risk.
- Automatically copying staff during rollover could silently preserve obsolete access; staff assignments intentionally restart each year.
- Automatic promotion needs explicit hold/withdraw/graduate overrides so exceptional children are not advanced incorrectly.
- Children without accounts are first-class records; authentication is an optional link, not the child’s identity.

## 9. Binding architecture and security amendments

These rules supersede any earlier wording that could be interpreted more
loosely.

### Central authorization principal

- Every protected route loads current role grants, assignments, guardian links,
  and child-account links from the database.
- Scope is represented explicitly as `none`, `all`, or a concrete set of IDs.
  `undefined` never means unrestricted access.
- The `PRIEST` write denial is evaluated before any allow rule, including
  `SUPER_ADMIN` or coordinator assignments.
- A move operation authorizes both its source and destination, including year,
  level, age group, and active status.
- During compatibility rollout, legacy roles may support UI/read fallback but
  may not be unioned with the new model to broaden write access.

### Authentication and sessions

- Add `User.authVersion`; every JWT carries the version observed at login.
- Password reset/change, disabling, account recovery/linking, and high-risk role
  changes increment `authVersion`, invalidating existing sessions.
- High-risk role, guardian, account-link, and export operations require recent
  authentication.
- Login and signup responses do not reveal whether an account exists or is
  disabled. Rate limits use a shared store with separate account and network
  buckets rather than process memory.
- Parent and student APIs return explicit response DTOs. Prisma records are not
  serialized directly when they contain internal notes, contact information,
  password hashes, or staff identifiers.

### Database invariants

- PostgreSQL check, partial-unique, exclusion, and composite foreign-key
  constraints are the final guard for active roles, mentors, placements,
  assignments, year ranges, and scope/year agreement.
- Every foreign-key/query-scope column is indexed. Unsupported Prisma 6
  features are maintained in reviewed SQL migrations and migration drift is
  checked in CI.
- Historical tables use restrictive foreign keys. Cascade delete is limited to
  true owned detail rows such as import-row details.
- Calendar dates use PostgreSQL `date`; security and audit events use
  `timestamptz`.

### Audit and concurrency

- `AuditEvent` is append-only for role, mentor, guardian, account-link, class,
  import, rollover, export, and sensitive authorization actions.
- Role/mentor/assignment changes use database uniqueness as the final guard and
  lock affected rows in deterministic order.
- Rollover takes a transaction-scoped advisory lock for its source/target year.
- Imports bind the idempotency key to a payload hash; reusing a key with a
  different payload returns a conflict.

### Rollover readiness

- The next year is created as `DRAFT` before September 11 so classes and
  deliberate future staff assignments can be prepared.
- Staff assignments are never copied automatically.
- Optional source-to-target class mappings support section splits and merges.
- Rollover writes item-level results into a hidden target year and opens it only
  after validation completes.

### Deployment and privacy

- Production-derived Neon branches are restricted migration-rehearsal
  environments and auto-expire. Public preview deployments use synthetic or
  anonymized data.
- The runtime database role has only required DML privileges and cannot modify
  migration history or audit events. The migration owner credential is never
  used by the web runtime.
- This release is intentionally single-organization. Supporting another parish
  or campus requires adding an explicit organization/membership boundary before
  storing that organization’s data; role grants must never be assumed global in
  a multi-organization deployment.
