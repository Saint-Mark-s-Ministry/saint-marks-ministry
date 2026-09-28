# Sunday School mode

Reference for the Sunday School side of the application: the classes, the
children in them, weekly lesson resources, child attendance, and pastoral visitations. For the
authorization rules that govern all of it, see [`permissions.md`](permissions.md).

## What it is, and what it is not

Sunday School mode (`/dashboard/servants`) manages the church's actual Sunday
School ministry, including weekly attendance for both children and servants. It
shares a deployment, database, login, and identity layer with the Servants Prep
program. Ministry records remain separate; shared users can receive tags and
scoped assignments in both modes.

It was built inside this app rather than as a separate deployment so that auth,
UI components, and the schema live in one place instead of being maintained
twice.

### ⚠️ Not the same as the prep-side "Sunday School" feature

The prep program has its own, older, unrelated Sunday School feature: async prep
students must serve a number of weeks, and they prove it with weekly per-grade
codes. Both live under `app/api/sunday-school/`. Check a route's header comment
before editing it.

| Prep-side (serving verification) | Sunday School mode (this document) |
|---|---|
| `SundaySchoolAssignment` | `SundaySchoolServantAssignment` |
| `SundaySchoolGrade` (Pre-K … `GRADE_6_PLUS`) | `SundaySchoolLevel` (Pre-K … `GRAD`) |
| `SundaySchoolCode`, `SundaySchoolLog` | `SundaySchoolSession`, `SundaySchoolChildAttendance`, `SundaySchoolWeeklyLesson` |
| Routes: `assignments/`, `codes/`, `logs/`, `progress/` | Routes: `age-groups/`, `servant-assignments/`, `classes/`, `children/`, `lessons/`, `sessions/`, `attendance/`, `dashboard/`, `assignable-servants/` |
| `lib/sunday-school-utils.ts` | `lib/sunday-school-class.ts`, `lib/sunday-school-access.ts` |
| `canManageSundaySchool()` in `lib/roles.ts` | `getSundaySchoolAccess()` |

The two grade enums are separate on purpose: the prep-side one ends in a
`GRADE_6_PLUS` catch-all that is already baked into live data, so it could not
be extended to cover a Pre-K–12 ministry without migrating it.

## Data model

The durable structure is year-first:

`SundaySchoolYear → SundaySchoolEnrollment → SundaySchoolClassPlacement → SundaySchoolClass`

The child is the stable person record. Enrollment says the child participates
in one Sunday School year and at which grade. Placement is dated history of the
class they belong to, so moving a child never rewrites prior-year or
prior-class history. `SundaySchoolGuardianProfile` stores a guardian even when
that guardian has no login; `SundaySchoolChildGuardian` grants an optional user
account access through a dated relationship.

### Models

| Model | Notes |
|---|---|
| `SundaySchoolYear` | Independent ministry year with explicit dates and lifecycle. At most one year may be `OPEN`; years may not overlap. |
| `SundaySchoolEnrollment` | One child and level per ministry year. Links rollover history without changing the stable child. |
| `SundaySchoolClassPlacement` | Dated enrollment-to-class history. At most one placement is active for an enrollment. |
| `SundaySchoolAgeGroupLevel` | Year-bound ownership of levels by age groups; replaces relying on an unenforced enum array. |
| `SundaySchoolAgeGroup` | `name`, `levels: SundaySchoolLevel[]`, `sortOrder`, `isActive`. A Postgres enum array, so no join table. |
| `SundaySchoolClass` | Legacy `academicYearId` remains during compatibility; new rows also use `sundaySchoolYearId`, `level`, `sectionName`, and lifecycle status. |
| `SundaySchoolServantAssignment` | Year-bound authority with exactly one class or age-group scope and dated end history. |
| `SundaySchoolChild` | Names, `level`, optional `classId`, family and unique child-account links, `birthDate`, legacy guardian contact, `notes`, `isActive`. |
| `SundaySchoolGuardianProfile` | Guardian identity/contact independent of whether the guardian has a login. |
| `SundaySchoolChildGuardian` | Dated relationship between guardian, child, and optional parent user; this relationship grants parent scope. |
| `SundaySchoolRosterImport` / `Row` | Idempotent import run and per-row outcome ledger. |
| `SundaySchoolRolloverRun` / `Item` | Resumable annual promotion run and per-enrollment result. |
| `AuditEvent` | Append-only security/business audit event with actor, action, entity, result, and request correlation. |
| `SundaySchoolFamily` | Shared family name, home address, separate mother/father contact, and every linked child. Children in the same family are siblings. |
| `SundaySchoolWeeklyLesson` | One row per `(classId, sundayDate)`, with an optional title and designated owner. It is separate from attendance sessions. |
| `SundaySchoolWeeklyLessonResource` | Ordered named HTTP(S) links for one weekly lesson. A save replaces the full list transactionally. |
| `SundaySchoolSession` | `classId`, `date`, optional `topic` / `notes`, `takenBy`. Unique on `(classId, date)`. |
| `SundaySchoolChildAttendance` | `sessionId`, `childId`, `status`, `notes`, `recordedBy`. Unique on `(sessionId, childId)`. |
| `SundaySchoolServantAttendance` | `sessionId`, `servantId`, binary `status`, `recordedBy`. Unique on `(sessionId, servantId)`. |
| `SundaySchoolVisitation` | A `DONE` or `NOT_DONE` entry for one child, with an optional date, notes, and the servant who recorded it. The class is stored with the entry so history remains class-scoped. |
| `SundaySchoolFeedbackIdea` | A global product idea with an author, optional description, and an admin-managed status. It is not tied to a class or academic year. |
| `SundaySchoolFeedbackVote` | One `UP` or `DOWN` vote per user and idea. Votes cascade with the idea or voter; ideas remain if their author account is removed. |

Reuses the app-wide `AttendanceStatus` (`PRESENT` / `LATE` / `ABSENT` /
`EXCUSED`), so `components/attendance-status-buttons.tsx` works unchanged.
Servant attendance uses its own binary `SundaySchoolServantAttendanceStatus`
(`PRESENT` / `ABSENT`) so it cannot accidentally accept child-only states.

### Design decisions worth understanding

**Children are primarily data rows.** They do not need a login. A coordinator
or admin may optionally link an existing active `STUDENT` account through the
unique `userId` field so that child can see their class lessons. A separate
`SundaySchoolFamily` groups siblings and stores shared parent/address details.
Guardian and household contact belongs to minors and is returned only by the
child and family routes, only to people with Sunday School class visibility.

**Weekly lessons are not attendance sessions.** The generator maintains every
scheduled meeting in the open Sunday School year for every active class (with
the active academic year retained only as a legacy fallback). Elementary levels
meet on Saturday; all older levels meet on Sunday. A Monday 10:00 UTC
Vercel cron invokes the protected generator,
and class creation/reactivation invokes the same idempotent helper. Lesson rows
can represent future preparation; `SundaySchoolSession` accepts attendance
writes only on that session's church-local calendar day and is created on save. History displays
join the two by class and normalized UTC date.

**A class's band is derived, not stored.** There is no `ageGroupId` on
`SundaySchoolClass`. During compatibility the enum array remains; the durable
mapping is `SundaySchoolAgeGroupLevel`, unique per year and level. Whichever
age group owns the class's year and level owns it.
Moving Grade 6 from Middle to Elementary re-parents every Grade 6 class and
hands them to a different coordinator — data entry, not a migration. The cost is
an invariant Prisma cannot enforce: **a level belongs to at most one age
group**, checked by `assertLevelsUnclaimed` on every age-group write.

**Assignments are per Sunday School year.** Staffing is redone each year and
last year's roster stays as history. The new year key is independent from the
Servants Prep `AcademicYear`; the legacy academic-year key stays populated only
for compatibility until routes have cut over.

**Sessions are created on save, not on page load.** Browsing dates on the
attendance page leaves no empty rows behind, and `PRIEST` can look without
writing. The `POST /sessions` route is idempotent: it returns the existing
session for a `(class, date)` rather than failing on the unique constraint.
Child and servant marks share that weekly session but remain separate records;
a week saved for one audience still appears as unrecorded for the other.

**Session dates are midnight UTC.** `normalizeSessionDate` in
`lib/sunday-school-class.ts` enforces it, so `@@unique([classId, date])` gives
exactly one session per class per day. Render with `formatDateUTC` from
`lib/utils.ts` — a local-midnight `Date` shifts the day for viewers west of UTC.

**Attendance rate uses recorded marks as the denominator**, not
`sessions × children`. A child added mid-year does not drag the class rate down
for the weeks before they joined. The formula itself is the app-wide
`calculateAttendanceStats` (late counts half, excused excluded), shown as a
plain rate with none of the graduation framing.

**The dashboard trend uses each saved session as its historical roster
snapshot.** Every mark saved for that class meeting counts toward the roster curve;
`PRESENT` and `LATE` count toward the attended curve. Meetings with no saved
marks stay as gaps so missing data is never presented as zero attendance. The
reporting year begins on the first scheduled meeting strictly after September 11. Super
admins and priests can filter the child trend to any class. The Servants chart
is available only to super admins and coordinators and contains only the
classes they coordinate; priests and ordinary servants cannot request it.

## API routes

All under `app/api/sunday-school/`. Every one resolves authority with
`getSundaySchoolAccess`; class data also uses a per-class predicate — see
[`permissions.md`](permissions.md).

| Route | Methods | Who |
|---|---|---|
| `age-groups` | GET, POST | Read: anyone with access. Write: `SUPER_ADMIN` |
| `age-groups/[id]` | PATCH, DELETE | `SUPER_ADMIN` |
| `servant-assignments` | GET, POST, DELETE | Coordinator of the scope being assigned into; band assignments are `SUPER_ADMIN` only |
| `assignable-servants` | GET | Anyone who can staff something |
| `classes` | GET, POST | Read: scoped. Create: `SUPER_ADMIN`, or band coordinator at that level |
| `classes/[id]` | GET, PATCH, DELETE | View: scoped. Edit: class coordinator. Delete: band coordinator or `SUPER_ADMIN` |
| `children` | GET, POST | People who serve the class |
| `children/[id]` | GET, PATCH, DELETE | People who serve the child's class |
| `families` | GET | Families connected to at least one visible child; includes all connected siblings |
| `lessons` | GET | Class-scoped servants/leaders, linked parents, and linked child accounts |
| `lessons/[id]` | PATCH | Any active servant assigned to the class assigns an active class servant as owner and edits title and links |
| `sessions` | GET, POST | People who serve the class |
| `sessions/[id]` | PATCH, DELETE | People who serve the class |
| `sessions/[id]/attendance` | GET | Anyone who can view the class |
| `attendance/batch` | POST | People who serve the class |
| `servant-attendance` | GET | `SUPER_ADMIN`, direct class coordinator, or the class's age-group coordinator |
| `servant-attendance/batch` | POST | Same as read; validates active direct class assignments and saves binary marks idempotently |
| `dashboard` | GET | Anyone with access for children; `audience=servants` is restricted to super admins/coordinators and their coordinated classes |
| `visitations` | GET, POST | Read: scoped to visible classes. Write: people who serve the child's class; `PRIEST` remains read-only |
| `feedback` | GET, POST | Anyone with Sunday School access, including `PRIEST`; the board shows every status ranked by upvote count |
| `feedback/[id]` | PATCH, DELETE | Author: edit/delete while open. `SUPER_ADMIN`: change status or delete any idea |
| `feedback/[id]/vote` | PUT | Any Sunday School participant, including `PRIEST`; no self-votes and no voting on completed/declined ideas |

`GET /api/cron/sunday-school-lessons` is outside that route group. It requires
`Authorization: Bearer $CRON_SECRET` and is scheduled by `vercel.json` for
Monday at 10:00 UTC. `bun lessons:generate` provides the same one-time rollout
backfill and is safe to rerun.

Two that exist for specific reasons:

- **`assignable-servants`** — a coordinator is often a plain `SERVANT`, and
  `/api/users` is admin-only, so staffing a class would 403. This returns just
  enough to populate a picker (id, name, email, role) for `SERVANT`, `MENTOR`,
  and `SERVANT_PREP` accounts, and keeps `/api/users` closed to servants.
- **`dashboard`** — a per-class summary grouped by age group, deliberately
  carrying **no guardian contact**.

List and detail responses include `canServe` / `canCoordinate` /
`canTakeServantAttendance` / `canDelete`
per class, so the UI never re-derives authority. The server still re-checks
every write.

## Pages

Under `app/dashboard/servants/`, all guarded by `useSundaySchoolGuard()`.

| Page | Purpose |
|---|---|
| `page.tsx` | Landing: Children/Servants attendance chart, classes grouped by age group, attendance-due badges, totals |
| `lessons/page.tsx` | Full academic-year schedule, My Lessons, past lessons, owner assignment, and multi-link editor |
| `attendance/page.tsx` | The core screen — pick class and week, review its eight-week trend, mark each child, batch save |
| `servant-attendance/page.tsx` | Coordinator-only screen — pick class and week, review servant history, mark Present/Absent, batch save |
| `classes/page.tsx` | Class list; "New class" appears only for levels you may create at |
| `classes/[id]/page.tsx` | Class detail: servants (with the staffing panel for coordinators), roster, recent sessions |
| `roster/page.tsx` | Child roster CRUD, family/parent details, sibling connections, and coordinator-only child-account linking (the legacy `/children` URL remains supported) |
| `visitations/page.tsx` | Per-child visitation status, dated history, and notes across the viewer's assigned class scope |
| `feedback/page.tsx` | Global idea board with attributed submissions, upvote-ranked voting, and `SUPER_ADMIN` moderation |
| `age-groups/page.tsx` | `SUPER_ADMIN` only — bands and the grades each owns |

`components/navbar.tsx` shows a **mode switcher** between Servants Prep and
Sunday School for anyone with a foot in both — which is how a `SERVANT_PREP`
or `MENTOR` who also serves moves between them. A `SERVANT` has only one mode
and sees no switcher.

Parents see deduplicated upcoming lesson cards in `/dashboard/parent`. Linked
student accounts use `/dashboard/student/class-lessons`; unlinked accounts get
a clear empty state without gaining access to any class.

## Extending it

**Adding a capability to an existing role of authority** — add a predicate to
`lib/sunday-school-access.ts`, cover it in
`__tests__/lib/sunday-school-access.test.ts` including its denial cases, then
enforce it in the route and reflect it in the API payload's `can*` flags.

**Adding a new kind of authority** — do *not* add a `UserRole`. Extend the
assignment model: either a new `SundaySchoolAuthority` value, or a new scope
column alongside `classId` / `ageGroupId`. If you add a scope, update the
exactly-one-scope validation in `assignments/route.ts` and the expansion logic
in `getSundaySchoolAccess`.

**Adding a field to a child or class** — remember that anything resembling
contact information for a minor must stay out of `dashboard/route.ts` and the
command palette.

## Local setup

Point `.env` at a local database or an isolated Neon development branch first.
Never use the production connection strings for this workflow. Follow
[`sunday-school-migration-runbook.md`](sunday-school-migration-runbook.md) for
shared databases; do not use `db push` there.

```bash
bun db:generate && bun db:push
bun db:seed        # seeds Elementary / Middle / High, a class, children, servants, and both attendance histories
bun dev
```

The seed creates `servant@church.com` (a servant on one class) and
`elementary.coordinator@church.com` (coordinator of the whole Elementary band
and directly assigned to the sample class roster),
both with the shared seed password. In development, `SUPER_ADMIN` users can use
the impersonation panel (`components/dev-impersonation.tsx`) to view the app as
either.

Worth exercising when changing this area:

1. An **unassigned `SERVANT_PREP`** is redirected away from `/dashboard/servants`
   and gets 403 from the API — the regression this model exists to prevent.
2. Assigning that same person to a class gives them access and the mode
   switcher, without changing their role.
3. Assigning a **`MENTOR`** keeps their mentor dashboard and adds Sunday School
   to the mode switcher; their primary role does not change.
4. A **band coordinator** sees every class in their band and none outside it,
   and can create a class at their levels but not others.
5. A **class coordinator** can staff their class but cannot create or delete one.
6. Moving a grade between age groups re-parents its classes.
7. `PRIEST` sees everything and is refused every write.


## Organization chart and priest overseers

Super admins can select a non-student name on either Users page to open the
Sunday School organization chart. Each team shows its priest overseer,
age-group coordinators, class coordinators, and servants. Selecting a person
focuses the chart on that person’s teams; Back and Reset restore earlier views.
The layout supports desktop and mobile, and missing assignments are explicit.

Set the **Priest overseer** in **Age Groups → Edit** (or when creating a group).
Each age group has one optional overseer; the same priest can oversee multiple
groups, for example Middle School and High School. Only active PRIEST accounts
can be selected, and only SUPER_ADMIN can save or clear the assignment.

`SundaySchoolAgeGroup.overseerId` is a nullable relation to User and persists
with the age group across academic years. It describes the reporting structure
and does not confer new permissions: priests retain their existing read-only
visibility. Deleting the priest account clears the relation. Disabled priests
are omitted from the active chart until an active replacement is assigned.

`GET /api/sunday-school/organization` is SUPER_ADMIN-only. It returns minimal
person references and active groups/classes, with servant/coordinator staffing
limited to the active academic year. With no active year it returns an empty
chart rather than historical staffing. Priests appear only on the groups
explicitly assigned to them; no church-wide reporting line is inferred.

After pulling this change, run `bun db:generate` and apply the Prisma schema to
a local database or isolated Neon branch with `bun db:push`. The additive schema
change is the overseer column, index, and foreign key. Production schema changes
remain an explicit, separately reviewed deployment step.
