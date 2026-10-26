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
students serve four weeks at each of ten grades and submit signed rotation
forms for human review. Approval advances them to the next grade automatically.
See [Async serving rotations](async-serving-rotations.md). Legacy weekly code
records are preserved, but code submission is retired. Both live under `app/api/sunday-school/`. Check a route's header comment
before editing it.

| Prep-side (serving verification) | Sunday School mode (this document) |
|---|---|
| `SundaySchoolAssignment` | `SundaySchoolServantAssignment` |
| `SundaySchoolGrade` (Pre-K … `GRADE_6_PLUS`) | `SundaySchoolLevel` (Pre-K … `GRAD`) |
| `SundaySchoolRotationForm`, `SundaySchoolLog` | `SundaySchoolSession`, `SundaySchoolChildAttendance`, `SundaySchoolWeeklyLesson` |
| Routes: `assignments/`, `rotation-forms/`, `logs/`, `progress/` | Routes: `age-groups/`, `servant-assignments/`, `classes/`, `children/`, `lessons/`, `sessions/`, `attendance/`, `dashboard/`, `assignable-servants/` |
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
| `SundaySchoolAgeGroup` | `name`, `levels: SundaySchoolLevel[]`, `sortOrder`, `isActive`, and an explicit `isElementary` marker. At most one band per year is Elementary. |
| `SundaySchoolClass` | Legacy `academicYearId` remains during compatibility; new rows also use `sundaySchoolYearId`, `level`, `sectionName`, and lifecycle status. Optional `classroom` (up to 200 characters) identifies the room/location. Coordinators can edit it from Classes; servants see it on their dashboard, class list, and class detail. |
| `SundaySchoolServantAssignment` | Year-bound authority with exactly one class or age-group scope and dated end history. |
| `SundaySchoolChild` | Names, `level`, optional `classId`, family and unique child-account links, `birthDate`, optional child cell number and father-of-confession name, legacy guardian contact, `notes`, `isActive`. |
| `SundaySchoolGuardianProfile` | Guardian identity/contact independent of whether the guardian has a login. |
| `SundaySchoolChildGuardian` | Dated relationship between guardian, child, and optional parent user; this relationship grants parent scope. |
| `SundaySchoolRosterImport` / `Row` | Idempotent import run and per-row outcome ledger. |
| `SundaySchoolRosterLink` | A temporary, class-scoped sign-up link (QR code). Stores only the token's SHA-256, plus `expiresAt`, `maxUses`/`useCount`, and `revokedAt`. `SundaySchoolChild.rosterLinkId` records which link let a child in. |
| `SundaySchoolRolloverRun` / `Item` | Resumable annual promotion run and per-enrollment result. |
| `AuditEvent` | Append-only security/business audit event with actor, action, entity, result, and request correlation. |
| `SundaySchoolFamily` | Shared family name, home address, separate mother/father contact, and every linked child. Children in the same family are siblings. |
| `SundaySchoolWeeklyLesson` | One row per `(classId, sundayDate)`, with an optional title and designated owner. It is separate from attendance sessions. |
| `SundaySchoolWeeklyLessonResource` | Ordered named HTTP(S) links for one weekly lesson. A save replaces the full list transactionally. |
| `SundaySchoolHomework` | Optional one-per-week Elementary homework package with title, instructions, archive history, and named links. |
| `SundaySchoolHomeworkCompletion` | A servant-recorded `COMPLETED` or `NOT_COMPLETED` result for one child; no row means not recorded. |
| `SundaySchoolSession` | `classId`, `date`, optional `topic` / `notes`, `takenBy`. Unique on `(classId, date)`. |
| `SundaySchoolChildAttendance` | `sessionId`, `childId`, `status`, `notes`, `recordedBy`. Unique on `(sessionId, childId)`. |
| `SundaySchoolServantAttendance` | `sessionId`, `servantId`, binary `status`, `recordedBy`. Unique on `(sessionId, servantId)`. |
| `SundaySchoolVisitation` | A `DONE` or `NOT_DONE` entry for one child, with an optional date, notes, and the servant who recorded it. The class is stored with the entry so history remains class-scoped. |
| `SundaySchoolPhoneCall` | A dated, class-scoped follow-up call for a child, with outcome, concise note, and a snapshot of the authenticated caller's name. It does not change visitation status. |
| `SundaySchoolFeedbackIdea` | A global product idea with an author, optional description, and an admin-managed status. It is not tied to a class or academic year. |
| `McpApiToken` | A hashed, revocable bearer token for the application MCP server, owned by one `SUPER_ADMIN`. Not Sunday School data; see "Application MCP server". |
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

Teaching reminders run Tuesday at 14:00 UTC through the `CRON_SECRET`-protected
`GET /api/cron/sunday-school-lesson-reminders`. Assigned owners receive an in-app
notification and best-effort device push for lessons before the following
Tuesday, covering Saturday and Sunday classes. Only active classes in open
Sunday School years (or the active legacy academic year) and active accounts
with a current direct class assignment qualify. The message includes the class,
date, optional title, and a link to the lesson page. Stable notification IDs and
duplicate-skipping inserts prevent repeat delivery while the notification exists;
push is awaited before the cron response. No database migration is required.
Deploy the code and Vercel cron configuration to activate the schedule; device
push requires configured VAPID keys and a teacher's browser subscription, or, in
the native app, a registered Expo push token (`MobilePushToken`). The native
payload carries `kind: sunday-school-lesson-reminder` and `lessonId` so a tap opens
that lesson; the same fields are in the notification's `metadata`, so the in-app
feed opens it too whether or not push was delivered.

Absence follow-up runs daily at 15:00 UTC through the `CRON_SECRET`-protected
`GET /api/cron/sunday-school-absence-notifications`. Three consecutive explicit
weekly `ABSENT` marks notify the active direct class servants (including class
coordinators); four or more escalate to the active age-group coordinators and that
band's assigned active priest overseer. Messages name the student and class and
ask recipients to follow up, linking to Visitations. Present, late, excused,
and unrecorded meetings break a streak; today's meeting is excluded until the
following day. Saturday and Sunday schedules are supported. Only active children
and classes in the open ministry year (or active legacy academic year) qualify;
durable-year history begins at the current active placement. Each recipient
gets one in-app alert and best-effort push per threshold and streak, using stable
IDs to suppress cron retries while the notification exists. Resuming attendance
starts a new streak. Missing overseers do not trigger a broadcast to all priests.
No schema migration is needed; deploy the code and cron configuration to activate.

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
attendance page leaves no empty rows behind. Priests can save attendance
using the same ministry editing flow. The `POST /sessions` route is idempotent: it returns the existing
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

**The dashboard separates enrollment from attendance recording.** The
`Attendance recorded` curve counts saved marks (`recordedCount`), including
absent and excused; `PRESENT` and `LATE` count toward the attended curve.
`recordedClassCount` shows distinct classes with any saved marks that week,
not classes with fully completed attendance. Missing marks are unknown, not
absences; meetings with no marks stay as gaps. Trend rates divide attended
by recorded marks, so they describe recorded attendance, not the whole ministry.

For the active year’s child chart, `Current enrolled` is a dashed present-day
reference using the same visible active classes and child counts as the top
card, narrowed to the selected class when filtered. It remains visible when
attendance has not been submitted. It is not historical enrollment and is
omitted for past years and servant attendance. Current-year trends use active
classes to match the top card; past-year trends retain inactive classes.
The recent attendance chart uses the same labels and reference.

The reporting year begins on the first scheduled meeting strictly after
September 11. Super admins and priests can filter the child trend to any
visible class. The Servants chart is available to super admins, priests, and
coordinators. Coordinators see only the classes they coordinate.

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
| `roster-links` | GET, POST | People who serve the class. POST returns the plaintext token exactly once |
| `roster-links/[id]` | DELETE | People who serve the class — revokes the link; children already added stay |
| `children/[id]` | GET, PATCH, DELETE | People who serve the child's class |
| `families` | GET | Families connected to at least one visible child; includes all connected siblings |
| `lessons` | GET | Class-scoped servants/coordinators, linked parents/children, and active async students with an explicit serving class |
| `lessons/[id]` | PATCH | Any active servant assigned to the class assigns an active class servant as owner and edits title and links |
| `homework` | GET, POST | Scoped reads for Elementary servants, linked parents/children, and priests; assigned Elementary servants and priests publish |
| `homework/[id]` | PATCH, DELETE | Assigned Elementary servants edit or soft-archive a package |
| `homework/[id]/completions` | POST | Assigned Elementary servants batch upsert or clear child outcomes |
| `sessions` | GET, POST | People who serve the class |
| `sessions/[id]` | PATCH, DELETE | People who serve the class |
| `sessions/[id]/attendance` | GET | Anyone who can view the class |
| `attendance/batch` | POST | People who serve the class |
| `servant-attendance` | GET | `SUPER_ADMIN`, direct class coordinator, or the class's age-group coordinator |
| `servant-attendance/batch` | POST | Same as read; validates active direct class assignments and saves binary marks idempotently |
| `dashboard` | GET | Anyone with access for children; `audience=servants` is restricted to super admins/coordinators and their coordinated classes |
| `visitations` | GET, POST | Read: scoped to visible classes; each child carries `absentStreak` (consecutive meetings marked absent over the last 26 weeks, same threshold as the absence notice). `?view=follow-up` returns only children who need follow-up (3+ absences in a row or starred), with just their latest call and completed visit and no notes; Home and Care use it. PATCH `{ childId, priority }` also backs the child profile's priority-visit button. Write: people who serve the child's class; priests may edit every class |
| `phone-calls` | POST | People who serve the child's active class may log a call; priests may edit every class. Calls are returned in the scoped `visitations` GET response. |
| `feedback` | GET, POST | Anyone with Sunday School access, including `PRIEST`; the board shows every status ranked by upvote count |
| `feedback/[id]` | PATCH, DELETE | Author: edit/delete while open. `SUPER_ADMIN`: change status or delete any idea |
| `feedback/[id]/vote` | PUT | Any Sunday School participant, including `PRIEST`; no self-votes and no voting on completed/declined ideas |
| `feedback/[id]/response` | PUT, DELETE | `SUPER_ADMIN`: set or clear the single "Development Team" reply |

`GET /api/cron/sunday-school-lessons` is outside that route group. It requires
`Authorization: Bearer $CRON_SECRET` and is scheduled by `vercel.json` for
Monday at 10:00 UTC. `bun lessons:generate` provides the same one-time rollout
backfill and is safe to rerun.

`app/api/public/roster-signup` is also outside that group, and is the only
**unauthenticated** Sunday School route. `GET ?token=` returns just the class
name and grade; `POST` adds one child. It is deliberately not under
`app/api/sunday-school/` so that the absence of a session is obvious on sight.
See "Roster sign-up links" below.

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

### Navigation: five places

Everyday work lives in five places. On phones the first four are the tab bar
(Home, Attendance, Children, Lessons) and Care sits under **More**, with a
**Follow up** button on Children and a row on Home that lead to it.

| Place | Pages (each keeps its own URL) |
|---|---|
| **Home** | `page.tsx` |
| **Attendance** | `attendance/page.tsx` (Children tab) · `servant-attendance/page.tsx` (Servants tab, shown when the class allows it) |
| **Children** | `roster/page.tsx` (the legacy `/children` URL still works) |
| **Care** | `care/page.tsx` (Follow up) · `visitations/page.tsx` (Visits & calls) · `birthdays/page.tsx` (Birthdays) |
| **Lessons** | `lessons/page.tsx` (Lessons) · `homework/page.tsx` (Homework, Elementary only) |

A "hub" keeps its tab pages under one menu entry: `NavItem.also` in
`lib/navigation.ts` lists the extra paths that should highlight it, and
`currentNavItem()` picks the most specific match. The tab row itself is
`components/sunday-school-hub-tabs.tsx`.

Search (Ctrl/⌘+K) builds its Sunday School list from the same menu, adds each
hub's tab pages, and keeps former page names (Roster, Visitations, Take
attendance) as search keywords. Absence and confidential-note alerts open
Visits & calls on that child (`?childId=`). The Attendance item shows a count
of the person's classes still missing attendance for their last meeting (the
same data as the reminder banner, so no extra request).

Coordinators and super admins also get a **Ministry** group (Classes & servants,
Registration requests, Servants meetings, Reports); super admins get **Admin**
(Age groups, Servant applications, Users, Activity). Everyone else finds
Servants meetings under **Community**, next to Ideas & feedback.

### Class context: one class choice for every page

The sidebar (desktop) and app bar (phone) show **Your class** for a single
accessible class or a **Viewing class** picker for multiple classes. This context
remains visible on shared pages, including Daily readings. The selected ministry
is remembered per account for the browser session so shared pages and reloads
keep the same navigation. A
loading placeholder keeps the space visible until classes arrive. The picker
lives in `components/sunday-school-viewing-picker.tsx`. Every class-scoped page reads
it through `useViewingClassId()` in `lib/sunday-school-viewing.ts`, so a servant
picks a class once instead of on each page. A link with `?classId=` wins and
becomes the new choice once; after that the picker is in charge again. Pages
that can list several classes (Home, Care, Birthdays, Lessons) also accept
**All classes**; a one-class page (Attendance, Children, Visits & calls) opened
on "All classes" picks a class and saves it, so the picker always names the
class on screen. Someone with one class just sees its name. The choice is a
display preference kept in `localStorage` (`sunday-school.viewing`), never an
authority: every API still re-derives what the person may see and change.
Pages do not add their own class picker, except Servant attendance and
Homework, which list only the classes they apply to.

### Pages

| Page | Purpose |
|---|---|
| `page.tsx` | Home. A servant with one class gets **This week**: lesson, attendance, homework (Elementary) and follow-up, each with its action, plus the class's 8-week trend. The Homework step's **Record** opens a one-tap Done / Not done list for the homework due at this meeting. Coordinators, priests and admins get **Needs you** (classes missing attendance for their last meeting, and each child needing follow-up with a Call or visit button), the class list grouped by age group, and the month calendar. Everyone gets Today in the Church and **Coming up** (lessons, feasts and fasts for four weeks). A one-time **simpler layout** note (`components/sunday-school-layout-intro.tsx`) explains the five places and the class picker; it is dismissed per person on each device and never by View as. "This week" follows each class's own meeting day (Saturday for Elementary). |
| `reports/page.tsx` | Year totals and the Children/Servants attendance chart (moved off Home) |
| `lessons/page.tsx` | Calendar view by default on desktop (with the church-calendar subscribe button); a list on phones, opening on upcoming weeks 8 at a time. Upcoming, I teach, and Past; teacher assignment and the multi-link editor. A calendar chip opens that week in the list (`?view=list&lesson=<id>`). **I'll teach it** volunteers for an open week in one tap. |
| `homework/page.tsx` | Elementary-only weekly packages, named links, three-state roster tracking, and school-year history |
| `attendance/page.tsx` | The core screen: previous/next meeting arrows, each child's last 6 meetings as dots (from the class history endpoint), mark each child, **Mark everyone else present**, then **Finish**, which marks anyone left unmarked absent. Marks autosave as drafts. Eight-week trend below. |
| `servant-attendance/page.tsx` | Servants tab of Attendance for coordinators: mark Present/Absent for the week, batch save |
| `servant-attendance/meetings/page.tsx` | Monthly servants meetings (Ministry group; servants reach check-in from Home) |
| `classes/page.tsx` | Class list; "New class" appears only for levels you may create at |
| `classes/[id]/page.tsx` | Class detail: servants (with the staffing panel for coordinators), roster, recent sessions |
| `roster/page.tsx` | Children: roster CRUD (Add child asks for the essentials; the rest is under **More details**) (name, grade, class, birth date, child cell number, father of confession, guardian contact), family/parent details, sibling connections, CSV import, class contact-update QR codes, and coordinator-only child-account linking. Tapping a name opens the child profile in a centered, scrollable modal with shared opening, closing and resize animations, with attendance rate, last visit and call, **Call mother/father/guardian**, a link to log a call or visit, and a priority-visit button for people who serve the class; tabs Family, Attendance, Care, Notes. |
| `care/page.tsx` | Follow up: children absent 3+ meetings in a row (the absence-notice threshold), starred for a priority visit, or with a birthday in the next 7 days, one row per child with every reason. Built from the `visitations` response (which now includes each child's `absentStreak`) and the birthdays API; nothing is stored separately. |
| `birthdays/page.tsx` | Assignment-scoped child birthdays with month and class filters; backed by a summary-only API that excludes family and contact details |
| `visitations/page.tsx` | Per-child visitation status, dated history and notes, and a separate dated phone-call follow-up history, across the viewer's assigned class scope. `?childId=` opens that child's record. |
| `feedback/page.tsx` | Global idea board with attributed submissions, upvote-ranked voting, and `SUPER_ADMIN` moderation |
| `age-groups/page.tsx` | `SUPER_ADMIN` only — bands and the grades each owns |

Roster CSV imports add new children and update matched children using supplied
nonblank values. Supported details include gender, birth date, child phone,
father of confession, guardian contact, notes, household name/address, and
mother/father names, phones, and emails. Parent phone numbers automatically
connect family records and fill missing shared information. Existing shared
values are preserved and conflicts are retained for review. See
[family matching](sunday-school-family-matching.md). The preview
lists unrecognized columns so they are not silently discarded. Source files are
not synced: upload a new CSV to apply later changes. Students missing from an
upload remain on the roster.

Each editable roster row has a **Take photo** camera shortcut. The child editor
also offers **Take photo** and **Upload photo**. Camera capture stays in the app:
allow camera access, capture, review or retake, then crop and save. The rear
camera is preferred on phones; **Switch camera** selects the front or rear camera.
The camera stops on capture or dismissal. Denied permission, missing cameras,
and unsupported browsers leave file upload available. Saving uses the existing
child-photo endpoint and class-serving permission; no database migration is needed.

The app shell shows a **mode switcher** between Servants Prep and Sunday School
for anyone with access to both. A Sunday School servant without an active
Servants Prep Servant tag opens Sunday School by default, including when their
legacy role is `MENTOR` or `SUPER_ADMIN`. Servants Prep servants keep Prep as
their default. The switcher still gives access to the other ministry. A
`SERVANT` has only one mode and sees no switcher.

Parents see one card per child in `/dashboard/parent`: the next class's lesson and links, that child's homework and completion status, and the next few weeks. Student
accounts use `/dashboard/student/class-lessons`. Active async prep students see
the class explicitly linked to their active serving rotation in the active prep
academic year; other students use their linked child record. Grade-only rotations
do not identify a class. The response includes the assigned class name even when
it has no upcoming lessons. Neither path grants lesson editing, staffing, roster,
or attendance powers. Accounts without an eligible class get a clear empty state.

Elementary parents and linked child accounts also see homework cards and only
their own completion status on those existing pages. Homework eligibility
follows the age group's current levels rather than a hard-coded grade list.

## Roster sign-up links (QR codes)

A servant of a class mints a temporary link from **Roster → Sign-up QR**, prints
or projects the QR, and families fill in the child's own details without an
account. Every sign-up lands on that one class's roster.

What makes it safe to expose publicly:

- **The destination is never in the request.** Class, Sunday School year, and
  therefore grade level are read from the `SundaySchoolRosterLink` row. A caller
  cannot aim a sign-up at another class or choose their own grade. Anything
  resembling `classId`, `level`, `userId`, or `isActive` in the body is ignored.
- **The token is not stored.** Only its SHA-256 lives in `tokenHash`, so a
  database dump yields no working link. 256 bits of entropy is why the route
  needs no lockout — a token cannot be guessed.
- **Exposure is bounded three ways:** `expiresAt` (default 8 hours, max 7 days),
  `maxUses` (default 40, max 200), and `revokedAt`. The use is claimed with a
  conditional `updateMany` that re-checks all three, so concurrent submissions
  cannot exceed the cap and an expiry that passes mid-request is caught.
- **Nothing about the roster comes back.** A visitor sees the class name and
  grade so they know they scanned the right poster. No child list, no guardian
  contact, not even whether their own name matched an existing row.
- **A public write never destroys servant-entered data.** A submission matching a
  child already in *that* class fills blank fields only.
- Every sign-up writes an `AuditEvent` naming the link, so it is always possible
  to ask what a given QR code let in. `SundaySchoolChild.rosterLinkId` answers
  the same question from the roster side.

Revoking a link stops new sign-ups; it does not remove children already added.
Use the CSV import's undo, or archive the child, for that.

Sign-ups go straight onto the roster rather than into a review queue — unlike
`ChildRegistrationRequest`, which is the *parent-account* path and still needs a
coordinator to place the child. The QR is a kiosk sign-up sheet handed out by a
servant who is in the room; the bounds above are what stand in for the review.

## Learn names with flashcards

On **Children**, use **Viewing class** to select a class and choose **Learn names**
to practice matching faces to names. The deck includes every active child in that class with a roster
photo or linked account photo, independent of the roster search and sorting.
Reveal the name, then choose **Got it!** or **Practice again** to move to the next
child. A progress bar, recall streak, and round summary make it a small memory
game. Review just the names that need practice or play another round with everyone.
Shuffle changes only the remaining cards and keeps the round's progress. It
always shows a different child next when at least two unreviewed cards remain.
The reveal and card transitions animate unless reduced motion is enabled.
Children without photos are counted and skipped; add their photos through the
existing roster photo controls. Closing the dialog starts a fresh session next
time. Practice is local to the open dialog and saves no results.

Flashcards reuse the authorized roster response and existing class access.
They display only the photo and name, with no new API or database fields.

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
3. Assigning a **`MENTOR`** keeps their mentor dashboard available in the mode
   switcher, but opens Sunday School by default; their primary role does not change.
4. A **band coordinator** sees every class in their band and none outside it,
   and can create a class at their levels but not others.
5. A **class coordinator** can staff their class but cannot create or delete one.
6. Moving a grade between age groups re-parents its classes.
7. `PRIEST` may view and edit all ministry records; account administration stays separate.


## Organization chart and priest overseers

Super admins can select a non-student name on either Users page to open the
Sunday School organization chart. Each team shows its priest overseer,
age-group coordinators, class coordinators, and servants. Selecting a person
focuses the chart on that person’s teams; Back and Reset restore earlier views.
The layout supports desktop and mobile, and missing assignments are explicit.

Set the **Priest overseer** in **Age Groups → Edit** (or when creating a group).
Each age group has one optional overseer; the same priest can oversee multiple
groups, for example Middle School and High School. Only active PRIEST accounts
can be selected; Super Admins and priests may save or clear the assignment.

`SundaySchoolAgeGroup.overseerId` is a nullable relation to User and persists
with the age group across academic years. It describes the reporting structure
and does not confer new permissions: priests already have ministry editing
access. Deleting the priest account clears the relation. Disabled priests
are omitted from the active chart until an active replacement is assigned.

`GET /api/sunday-school/organization` is available to Super Admins and priests. It returns minimal
person references and active groups/classes, with servant/coordinator staffing
limited to the active academic year. With no active year it returns an empty
chart rather than historical staffing. Priests appear only on the groups
explicitly assigned to them; no church-wide reporting line is inferred.

After pulling this change, run `bun db:generate` and apply the Prisma schema to
a local database or isolated Neon branch with `bun db:push`. The additive schema
change is the overseer column, index, and foreign key. Production schema changes
remain an explicit, separately reviewed deployment step.

## Monthly servants meetings

**Servant Attendance → Servants meetings** opens the dedicated meeting page
(`/dashboard/servants/servant-attendance/meetings`). Servants see their assigned
school groups; band coordinators, super admins, and priests retain their existing
scope. Elementary meetings fall on the first Saturday of each month; Sunday
school groups meet on the third Sunday. Elementary is identified by the group's
Elementary setting, name, or exclusively Saturday grade levels.

The active academic year's monthly dates appear alongside existing sessions,
showing only today and past dates in America/New_York. The first recurring
Sunday meeting is October 18, 2026; no Sunday dates are projected before then. Future meetings are
hidden from the list and cannot be opened through a direct meeting link.
Browsing projects scheduled dates without writing to the database. The first
attendance write creates the session through the existing band/year/date unique
key. Existing meetings and attendance are preserved. Coordinators can still add
extra meetings and record or correct past attendance with explicit present or
absent marks for every servant.

Every servant can open **Meeting check-in** directly from the Sunday School home
page or the navigation menu. Today's meeting is selected automatically when
available, without requiring a coordinator to create it first.

Assigned servants can **Check in for this meeting** on the meeting's
`America/New_York` calendar date. The server derives their identity from the
session, verifies current roster membership, and requires a location captured
within two minutes, with accuracy of 100 meters or better, within 150 meters of
427 Westside Ave, Jersey City, NJ. Self check-in closes at midnight New York time at the end of the meeting day.
The server rechecks the day after venue lookup, and an open page removes the
check-in button at midnight or upon returning to the page. Location coordinates
are checked but are not stored. Browser location permissions and HTTPS are required. Browser coordinates
are user-supplied evidence and cannot prevent device location spoofing.

The server uses the fixed church coordinates (40.71602, -74.08670) for
427 West Side Ave at Clarke Ave. The address is confirmed by the
[church directions](https://saintmark.com/contact/directions/); the building
point is from [OpenStreetMap way 310223954](https://mapcarta.com/W310223954).
Check-in does not require an external geocoder to be available. The venue is
selected by the server, never supplied by the client; distance, position
freshness and accuracy checks still apply.
Ordinary servants can only self check in, before and after their own attendance
is recorded. Checking in never grants permission to mark another servant.
The UI uses the explicit server-derived `canManageAttendance` permission for
Present/Absent controls and bulk saves. Only the group's active band
coordinators and accounts with a current Super Admin or Priest tag may manage
meeting attendance or create sessions; class-only coordinators cannot. The API
reloads these permissions for every write, independently of check-in status.
Authorized managers retain attendance corrections without requiring location.

Priests and super admins can open **Attendance history** from the Servants
meetings page. `/dashboard/servants/servant-attendance/meetings/history` lists
recorded meetings across all academic years and school groups, including
archived groups, newest first with pagination. Selecting a meeting displays
its saved present/absent marks and totals, including former servants. It does
not add today's roster or count missing records as absences. This view is
read-only and works without an active academic year or a current group assignment.

`GET /api/sunday-school/servants-meetings/history` reloads current role tags
and permits enabled priests and super admins only. `cursor` loads older pages;
`meetingId` returns one saved meeting's attendance. Queries exclude future and
unrecorded meetings, use explicit field selections, and return no contact
information. Ordinary servants and coordinators retain their existing scoped
meeting view and do not receive ministry-wide history access.

`SundaySchoolServantsMeeting` and `SundaySchoolMeetingAttendance` remain the
storage models. The roster combines active class and band assignments,
deduplicates users, and retains former attendees in saved history. Existing
compatibility academic-year and authorization rules apply. No schema change is
required for monthly scheduling or check-in.

`/api/sunday-school/servants-meetings`: GET lists saved and scheduled sessions or
loads a roster; POST creates an extra session; PUT saves coordinator attendance;
PATCH checks in only the signed-in servant. Every write rechecks database
authorization. Repeated check-ins reuse the same meeting/servant record.

## Application MCP server

`POST /api/mcp` is a stateless Streamable-HTTP MCP server for application
inspection and feedback moderation. Feedback tools: `list_feedback`, `get_feedback`, `reply_to_feedback`,
`clear_feedback_reply`, `set_feedback_status`, `delete_feedback`. Mutations go
through `lib/sunday-school-feedback-ops.ts`, shared with the web routes.

```bash
bun scripts/admin.ts mcp-token-create you@example.com "Claude Code"   # prints the token once
claude mcp add --transport http st-marks-feedback \
  https://servants-prep-app.vercel.app/api/mcp \
  --header "Authorization: Bearer <token>"
bun scripts/admin.ts mcp-token-revoke <id>
```

Auth is a bearer header, not OAuth, so claude.ai's "custom connector by URL"
flow is not supported. Returned user text is untrusted data:
tool descriptions mark it as untrusted data. Authorization details:
[`permissions.md`](permissions.md#mcp-token-access-feedback).

Read-only inspection tools (existing tokens and client configuration continue to work):

| Tool | Purpose |
|---|---|
| `list_app_entities` | Discover supported entities, allowed scalar fields, enum values, and relation IDs; optionally inspect one entity. |
| `query_app_records` | Read selected fields with AND filters, deterministic sorting and pagination (up to 100 records). |
| `count_app_records` | Count all matching records without reading their contents. |
| `get_app_health` | Check database connectivity and configuration presence for authentication, email, uploads, realtime and push. Remote service availability is not tested. |

Start with `list_app_entities`, then use exact entity and field names. For example,
`query_app_records` with:

```json
{
  "entity": "StudentEnrollment",
  "fields": ["id", "studentId", "status", "academicYearId"],
  "filters": [{ "field": "status", "operator": "eq", "value": "ACTIVE" }],
  "limit": 50
}
```

Filters support `eq`, string `contains`, numeric/date `gte` and `lte`, and list
`has`. Dates use ISO strings; nullable fields accept `eq` with `null`. Follow
relation IDs with another query. Pass the returned `nextOffset` as `offset` to
continue; it is null on the last page. Pages reflect current data, so concurrent
writes can change the results. Counts are separate queries, not a snapshot.

Inspection spans Servants Prep and Sunday School operational records, account
roles/assignments, settings, registrations, digital exam state, notifications,
imports, rollover and audit history. It uses an explicit field allowlist in
`lib/mcp-inspection-catalog.ts`: new schema fields do not become exposed
automatically. Credentials, invite/verification codes, answer keys, guardian
contacts, confidential pastoral notes and arbitrary JSON are excluded. There is
no arbitrary SQL, relation expansion, HTTP request, file access, or new mutation
tool. These tools inspect stored data and configuration; they do not exercise
browser interactions or provide access to hosting logs. Health returns presence
booleans, never environment values. Database failures return a sanitized error.

## Attendance drafts and connection recovery

Web child attendance keeps every entered mark immediately on the current device,
then saves only those pending marks after a short pause. The browser draft key
includes the signed-in user, class, and exact calendar date. It contains child
IDs and attendance statuses only; no roster names, photos, or guardian contacts.
Server acknowledgment clears pending marks; a newer tap during an in-flight
save stays pending. Network/server failures retry after five seconds and on
reconnection while that same roster remains open. Authorization/validation
failures require an explicit retry or roster reload.

Returning to a draft first loads the authorized current roster. Removed child
IDs are excluded, newly added children stay unmarked, and recovered marks require
review and **Resume saving marks** before any submission. Browsing another class
or date and signing out abort outstanding client requests and never submits a
different draft. Both write routes reject a supplied `expectedUserId` if the
actual authenticated account changed. Existing server class permission checks
still apply to every write. Where supported, a browser lock prevents two tabs
from editing the same user's class/date draft simultaneously.

**Save attendance** remains the explicit final step that marks all children
left unmarked as absent. Automatic saves never infer absence. A confirmed
save and a draft kept only on the device are labeled separately. If browser
storage is unavailable, the page warns that refresh can lose unsent marks;
keep it open until the church save is confirmed. Reloading a roster in the same
open editor preserves its in-memory pending marks even when storage fails.
No database migration or service worker is needed. Draft recovery after a full
page reload requires a connection to validate permission and the current roster.


## Individual attendance history and priority visits

**Attendance → Individual history** shows one row per child and one column per
past scheduled meeting or saved session in the selected active class. It includes
former roster members with saved marks in that class. Blank cells are unrecorded,
not absences. Totals and rate use saved marks only; late counts half and excused
is excluded. Names can be searched and the table scrolls horizontally on phones.
History refreshes after attendance saves and is read-only for every viewer.
Selecting a child’s name on the attendance roster opens that child’s saved
weekly history in a dialog, with status totals and rate. Meetings appear newest
first, and missing marks remain unrecorded. Opening or closing history does not
change pending attendance marks.

`GET /api/sunday-school/attendance/history?classId=…` resolves the principal and
class visibility from current database state. It uses the compatibility class
resolver, matching the existing attendance editor while year backfills are being
reconciled. It returns names and class-scoped attendance marks without contact,
attendance notes, or pastoral notes.

**The iOS app** reads the same endpoint (types in `@stmark/contracts`:
`IndividualAttendanceResponse`). **Take attendance → ⋯ → Individual history**, or
**Individual attendance history** on a class, pushes a read-only screen over the
attendance editor, which stays mounted, so pending marks and notes are never
read or changed. Each child is a row with the server's rate and Present / Late /
Absent counts (no Excused total) and a strip of the latest meetings; blank cells
show a dash and read "Unrecorded". Former roster members carry a **Former**
badge. Search and first/last-name sort match the web view. Tapping a name opens
that child's saved weeks, newest first, as a sheet built from the same payload,
so former members open too. The class picker only changes what this screen
asks for. The cache is keyed by viewer (and View as original) and class; the
screen asks again on every open, so a confirmed attendance save is reflected, and
a 403 or 404 clears the cached answer. Contacts, attendance notes and pastoral
notes are not in the payload and not shown.

On **Visitations**, servants can star a child and use **Priority visits** to see
that class's shared follow-up list. Stars persist across devices for the whole
class team, separately from visit and phone-call histories. Recording a visit
never clears a star automatically. Priests can view and change priorities across classes. `PATCH /api/sunday-school/visitations` accepts `{ childId, priority }` and
requires current class-serving authority; an atomic update rejects concurrent
class transfers. The child flag follows the child if the roster is transferred.

**The iOS app** shows the flag on **Visitations**: a **Priority visit** label on each
starred child, a **Priority visits · N** filter that combines with the Done / Not done
filter, and a star beside the row (a switch on the child's record) for people the
response lets edit (`classes[].canEdit`, so priests and admins in every class; never
in View as). A tap shows at once and is saved with `PATCH`; if the save fails the star
returns to what the server has and a message says why. A 403 or a 409 (the child moved
class) also refreshes the list. Recording a visit or call never sends the flag. The
list keeps its filters and scroll position after opening a child.

Migration: `20261014120000_add_visitation_priority` adds a non-null boolean with
`false` as its default. Apply the committed migration with the direct connection
using `bun db:deploy` before deploying the code, following the migration runbook.
Production-derived branches must remain private.

## Weekly class attendance reminders

Starting on their class meeting day (Saturday for Elementary, Sunday for other
classes), personally assigned class servants and class coordinators see a
non-dismissible banner throughout Sunday School until all active children in
their class have saved attendance marks. Any member of the class team can
complete attendance for everyone. Session creation, servant attendance, partial
child attendance and local-only drafts do not count as completed child attendance.
Classes with no active children do not need reminders. Band-wide coordinators
and administrators are reminded only for classes they are personally assigned to.

Reminder weeks use `America/New_York`. Elementary reminders refer to the most
recent Saturday, including today on Saturday; other classes refer to the most
recent Sunday. The banner stays visible during the week while attendance is
incomplete, and the next class meeting starts a new reminder week. Completing
that new week clears the banner without requiring missed weeks to be backfilled.
Links include the class and exact meeting date, including when opened from an
older notification.

`/api/cron/sunday-school-attendance-reminders` sends in-app and best-effort push
notifications on Saturday for Elementary classes and Sunday for other classes,
with Tuesday and Thursday follow-ups for both, skipping classes
whose active roster is fully marked. It requires `Authorization: Bearer
<CRON_SECRET>`. Vercel invokes it once at 16:00 UTC on Saturday, Sunday,
Tuesday and Thursday, compatible with Hobby's once-per-day limit. This is
noon Eastern during daylight saving time and 11 a.m. during standard time;
Hobby execution can occur within the scheduled hour. The handler gates delivery
to these church-local days and late-morning/noon hours.
Stable notification IDs suppress duplicate deliveries on retries and overlapping
runs. Existing push configuration and user subscriptions apply. The cron becomes
active when the updated Vercel configuration is deployed; no database migration
is required.

**The iOS app** loads `GET /api/sunday-school/attendance/reminders` and shows a
non-dismissible banner on every Sunday School screen (not Servants Prep) for each
returned class, until the server stops returning it. It asks again when the app
returns to the foreground and after a confirmed attendance save. It never decides
completion itself: a local draft, a session or a partial save changes nothing. A 403
(for instance a revoked assignment) clears it; a bad connection keeps the last answer.
Tapping a reminder opens Take attendance for the returned `classId` and exact
`sessionDate`. The `sunday-school-attendance-reminder` notification opens the same
place from its metadata in the feed, or from the web link's `classId` and `date` when it
arrives as a push (a push carries no metadata), so an older notification still opens
its original meeting. Push uses the existing transport; with push denied or failing,
the banner and the feed still show the reminder. Banner text stops scaling at 1.3×,
because it is always on screen.

The personal reminder endpoint reloads database authorization and current direct
assignments. It uses the active compatibility academic year and class roster,
matching the attendance editor while Sunday School year backfills are reconciled.
It returns class summaries only, without child or guardian information.


### Class lesson calendar subscriptions

Lessons → **Add lessons to calendar** creates a personal read-only calendar for
one class. Choose the class, then use Apple Calendar/Outlook, Google Calendar,
or copy the subscription URL. Google subscriptions must be added in a computer
browser before they appear in its phone app. Calendar apps refresh on their own
schedule; changes do not push instantly. PR #290's desktop month calendar and
upcoming-first phone list are preserved.

The **Add lessons to calendar** dialog has an unchecked **Also add the Coptic
Orthodox calendar** option. Selecting it reveals Apple/Outlook, Google Calendar,
Outlook.com and copy-link actions for Coptic.io’s public live subscription feed.
These actions work independently of preparing a personal lesson URL, including
in a local preview. Each calendar requires its own confirmation in the calendar
app and can be shown, hidden or unsubscribed separately. The church feed never
contains the personal lesson token or any class/user data. Refresh timing is
controlled by the calendar provider. This option requires no schema or
environment changes.

Events contain class name, lesson date and title, classroom, and a link back to
the lesson. Dates are all-day UTC calendar dates because lessons have no meeting
time field. They exclude children, attendance, family contacts, teacher names,
and resource URLs. Stable lesson UIDs let calendar apps update existing events.

`POST /api/sunday-school/classes/[id]/lesson-calendar` requires a current session
and fresh database class authority. It rejects View as and returns a signed,
class-scoped URL under `/api/public/lesson-calendar/[token]`. The public read
route needs no browser cookie, but reloads the owner and class authority on every
fetch. Disabling an account, changing its password/auth version, archiving the
class, removing class access, or rotating NEXTAUTH_SECRET invalidates the feed.
Links expire 31 days after the class's academic year ends. A new academic year's
class requires a new subscription. Keep links private: possession permits
reading the limited lesson feed while the original owner's access remains valid.
No database migration or new environment variable is required.

Local preview links are reachable only from the development computer; phone
subscriptions require deploying these routes on the app's public HTTPS origin.


### Class contact update QR

On **Children**, select one class and use **Contact update QR**. The roster
sign-up QR action is hidden for now. The QR opens a mobile-friendly form bound
to that class (including its section), with no roster list or grade selector.
Children enter their own first name, last name and birth date, plus their own
phone and/or a parent or guardian phone. The birth date must already be on the
roster. Ask a servant when it is missing, the identity is ambiguous, or a saved
number needs correction.

Contact links use a hashed random token, expire exactly two hours after
creation, and have no total submission limit. **Close link** revokes them
immediately. The server fixes this lifetime regardless of client settings and
applies the two-hour ceiling to previously issued contact links as well. Their `contactUpdateOnly` database field is the
server-side purpose; it cannot be changed through the public request. The link's
class and open year are checked on submission, including the atomic expiry/revocation check.
Submission counts are retained for servants but never exhaust a contact link,
even when no unique child matches. No child is created or enrolled. Only null/empty child `cellPhone` and
`guardianPhone` are filled, with guarded writes protecting concurrent servant
edits. Family relationships, shared family details and siblings are untouched;
family matching is not run from this flow.

Responses never reveal existing child/contact data or whether an identity
matched. Rate limiting allows five attempts per name per link per fifteen
minutes, with a separate 100-attempt network limit per link; names and network
addresses are hashed in limiter keys. Audit records identify changed field
names and the child/link, without phone or birth-date values. A shared QR is
not proof of identity: a peer who knows a child's name and birth date could fill
a blank phone field. Share during class and close afterward; use individual
child tokens or servant review if stronger assurance is required.

Apply `20261023170000_roster_contact_update_links` alongside the other pending
weekly-release migrations before deploying this code. See the
[combined release checklist](releases/2026-10-19.md). Existing issued sign-up
links retain their behavior and default to `contactUpdateOnly = false`.


### Shared modal resizing

Standard dialogs and confirmation dialogs animate intrinsic width/height changes
through `useAnimatedSize` and `observeAnimatedSize`. Custom Radix modal layouts
use the unstyled `DialogSurface` from `components/ui/dialog` to share this behavior
without changing their layout. The animation measures layout dimensions, retargets
when content changes mid-animation, retains authored dimensions and viewport caps,
and disables motion for `prefers-reduced-motion`. Do not add per-dialog height
constants or wrappers to animate expanding forms.

## Assigned child check-ins

Care → Follow up includes **Assigned check-ins** for every active child in the
current class view. Anyone who serves that class can choose or clear one
responsible servant from its active direct class team. **Mine**, **Unassigned**,
and **Not called this week** filters make the shared list actionable. Priests
can review this list but cannot change these assignments.

Responsibility is stored in `SundaySchoolChild.followUpAssignmentId`, referencing
the existing year-bound `SundaySchoolServantAssignment`. It grants no class or
contact access. Ended assignments, disabled servants, a different class, or an
old academic year display as unassigned; deleting the staffing record clears
the reference. Age-group-only coordinators are not assignment candidates unless
they also have direct class staffing. Clearing responsibility preserves call
and visitation history. A child can have only one current check-in servant.

`GET /api/sunday-school/follow-up-assignments` returns scoped active classes,
minimal child/servant names, and the latest call attempt this week. It excludes
contacts, call notes, and confidential notes. `PUT` checks the current database
principal, active class/year, and target staffing, then saves the responsibility
and an audit event transactionally. It returns 409 on a serialization conflict.

A week is Monday–Sunday in America/New_York, including daylight-saving changes.
The status uses the existing phone-call log for the child's **current class**;
no separate weekly checkbox or reset job exists. All outcomes (including no
answer and voicemail) count as an attempt, and the actual outcome is shown.
**Log call** opens a dialog on Care with a dated call form and the child’s call
history. Saving immediately refreshes the weekly status; no page change is
needed. Selecting a child’s name opens the existing profile dialog. Its **Calls & visits**
action opens the Care tab within that same dialog, where calls, visits, and
optional confidential visit notes can be recorded. Tap the profile photo to
enlarge it without leaving the profile. A new week
starts with no call logged until a call is recorded. Focus/reconnect and a
one-minute refresh keep the shared list current.

Apply `20261023200000_child_follow_up_assignment` explicitly before deploying this
feature. It adds a nullable column, index, and `ON DELETE SET NULL` foreign key;
it assigns no children automatically. Code rollback can retain this addition.
