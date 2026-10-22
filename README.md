# St. Mark's Ministry

A unified platform for St. Mark's Ministry, including Servants Prep and Sunday
School management.

[Open the production application](https://www.stmarkministry.app)

The responsive web application runs two ministry workspaces that share one
deployment, one database, and one login:

1. **Servants Prep** — the 2-year Servants Preparation Program: student
   attendance, exams, curriculum, mentors, and graduation requirements.
2. **Sunday School** — the Sunday School ministry: classes by grade (Pre-K–12)
   grouped into age-group bands, the children in them, and weekly child
   attendance.

The two workspaces have independent permissions. An async Servants Prep
student's serving rotation can reference a Sunday School class and expose its
lessons without granting ministry staffing, roster, or editing authority.

## Documentation

| Document | For |
|---|---|
| [`AGENTS.md`](AGENTS.md) | The working guide — commands, layout, conventions, gotchas. Start here, whether you are a person or an AI coding agent. |
| [`docs/permissions.md`](docs/permissions.md) | Every role and permission, and the Sunday School authority model |
| [`docs/sunday-school-mode.md`](docs/sunday-school-mode.md) | Sunday School mode end to end |
| [`docs/sunday-school-migration-runbook.md`](docs/sunday-school-migration-runbook.md) | Production database rehearsal, deployment, verification, and rollback |
| [`docs/async-serving-rotations.md`](docs/async-serving-rotations.md) | Four-week signed forms, servant review, ten-grade progression, and release checks |
| [`docs/async-student-year-migration.md`](docs/async-student-year-migration.md) | Yearless async enrollments and their migration requirements |
| [`docs/makeup-exams.md`](docs/makeup-exams.md) | Student makeup bookings and score entry |
| [`docs/digital-exams.md`](docs/digital-exams.md) | Digital exams, answer sheets, and proctor monitoring |
| [`docs/app-store-website-plan.md`](docs/app-store-website-plan.md) | Public app overview, support, and App Store submission preparation |

### Public app information

The public overview is at `/app`, with app help and the support email at
`/support`. Both are available without an account, including when a signed-in
user must change their password. The root URL keeps its existing sign-in and
dashboard behavior.

After deployment, use `https://www.stmarkministry.app/support` as the App Store
Connect Support URL, `https://www.stmarkministry.app/privacy` as the Privacy Policy
URL, and `https://www.stmarkministry.app/app` as the optional Marketing URL.
The iOS download link can be added once the App Store listing is available.

Before submission, verify the release build's in-app privacy link, account
deletion flow if it supports account creation, and data disclosures against the
actual enabled mobile services. Public help pages alone do not implement account
deletion in the mobile app.

## Features

### Servants Prep

- **Role-based access** for Super Admins, Priests, Servants Prep Servants,
  Mentors, and Students
- **Academic years** with enrollment management, including late-start students
- **Curriculum** — weekly lessons with resources, ordering, and exam days
- **Attendance** — Present / Late / Absent / Excused, with expected absences and
  a late-start curve
- **Exams** — eight sections, digital answer sheets, proctor monitoring,
  individual retakes, and per-section and overall requirements
- **Makeup exams** — student booking and authorized makeup score entry
- **Graduation tracking** — live validation of every requirement
- **Mentors** — each student assigned a mentor, with mentee dashboards
- **Async students** — yearless enrollment, note submissions, assigned serving
  classes and lessons, and ten human-approved four-week grade rotations
- **Annual mentor confirmation** — async students confirm mentor contact
  information through Application without requiring a cohort-year registration
- **Registration** — invite codes and a review queue for new applicants
- **Analytics** — progress, at-risk students, trends, class averages

### Sunday School

- **Age groups** (Elementary / Middle / High) as editable data, each owning a
  set of grades
- **Classes** per academic year, each with assigned servants
- **Coordinators** at class or age-group level, with authority scoped accordingly
- **Children rosters** with profile photos, optional gender, birth date, child
  cell number, father-of-confession information, and protected contact details
  visible only to that class's servants and to admins
- **Birthday tracking** with month and class filters for every child in the
  viewer's assigned classes
- **Flexible attendance rosters** with first- or last-name sorting, optional
  photos, and optional grouping by gender
- **Child and servant attendance** with per-class trends; child records can be
  corrected later while servant attendance remains limited to the session date
- **Weekly lesson planning** aligned to the active Sunday School year; any
  servant assigned to the class can update lessons and assign an owner from the
  class roster
- **Roster onboarding** through CSV imports, parent registration, and temporary
  class-specific QR sign-up links
- **Parent onboarding** with self-service accounts and approval-based child
  registration
- **Servant onboarding** with a public sign-up form and a Super Admin-only
  review queue under Sunday School's **More** menu
- **Visitations, feedback, reports, and activity history** within the same
  assignment-scoped workspace

### Shared experience and branding

- **What’s new** — weekly deployment notes for both ministries, available in
  the sidebar, phone More menu, and search. See [the release-note workflow](docs/release-notes.md).
- **Responsive mobile web experience** using the same features and permissions
  as the desktop application
- **Compact SP / SS mode switcher** for eligible users, with an animated
  transition between the two ministry workspaces
- **In-mode page transitions** with a quick exit and entrance animation when
  navigating between pages such as Dashboard and Users
- **Consistent page width and navigation** across Servants Prep and Sunday
  School so switching modes does not shift the surrounding interface
- **Mode-aware branding** — Sunday School uses the St. Mark logo, browser title,
  and transparent favicon while Servants Prep keeps its own identity
- **Neutral charcoal dark mode** shared across the application
- **Mode-aware account controls** that keep the signed-in user's name and role
  legible, preserve the active workspace for Dashboard and My Account, and hide
  Prep-only settings from the Sunday School menu
- **Cross-mode user administration** so Super Admins can open the complete user
  list without leaving either ministry workspace
- **Contact Book** with individually granted access, ministry roles and grade
  responsibilities, name/role/grade filters, and preserved filters when visiting
  a profile
- **Collapsible sidebar** on desktop and tablet, with the user's choice retained
- **Files** with Google Drive folder navigation, resource previews, and visible
  errors when linked files cannot be accessed
- **Privacy Policy and Terms of Service** in the shared footer and account menu;
  their routes preserve the active mode and authenticated navigation, with a
  context-aware back link to the exact page the user came from

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Styling:** Tailwind CSS v4, shadcn/ui
- **Database:** PostgreSQL (Neon) with Prisma ORM
- **Auth:** NextAuth.js, JWT sessions
- **Data fetching:** SWR
- **Testing:** Vitest
- **Package manager:** Bun

## Async student serving workflow

Each async student serves **four attended, signed weeks at each of ten grades**:
Pre-K, Kindergarten, and grades 1–8. They start at their assigned grade, advance
one grade at a time, and wrap from eighth grade to Pre-K. Multiple sections of
one grade count as one rotation.

1. A Servants Prep servant assigns the initial class. The student sees it under
   **Sunday School** and sees that class's upcoming resources under **Class
   lessons**.
2. The student opens **Attendance slip → Print**, attends four weeks, and gets
   each week signed. The slip is provided directly; printing also allows saving
   as PDF through the browser. There is no Google Doc link or separate download
   action.
3. Under **Sunday School → Current rotation → Signed rotation form**, the
   student uploads one photo or PDF, up to 4.5 MB, and confirms all four signed
   weeks. Upload controls remain visible before the fourth scheduled week, with
   an availability date, and become usable once eligible.
4. A Servants Prep servant opens **Async students → Rotation forms** to review
   the student submission. Servants approve all four signed weeks or return the
   form with correction notes; this page does not ask servants to upload slips.
5. Approval credits the four weeks, closes the current rotation, and assigns
   the next grade in one transaction. Class allocation prefers a class without
   another active rotating student, then the least occupied class. After all ten
   grades are approved, the serving cycle is complete.

Uploading alone does not advance a student. Pending or returned forms keep the
current class in place. If a student misses a week, they make it up in the same
class and submit only after collecting four attendance signatures. The displayed
date range is the planned schedule; it currently does not adjust automatically
for missed weeks, and the upload availability date is not a submission deadline.

Students see one card per rotation with its class, dates, and form status.
Servants see **Assignments**, **Rotation forms**, and **Progress**, with Rotation
forms opening by default. Assignments show **Not submitted**, **Awaiting review**,
**Changes requested**, or **Approved** instead of weekly counts and percentages.
They can sort by **Student name (A–Z)** or **Grade (Pre-K to 8th)**; the same order
applies to desktop rows and mobile cards and persists during refresh. Overall
progress counts approved grades out of ten. Weekly attendance codes are retired.

See [`docs/async-serving-rotations.md`](docs/async-serving-rotations.md) for the API
contracts, evidence protections, and deployment checks.

## Getting started

**Prerequisites:** Bun 1.3+ and a PostgreSQL database.

```bash
# 1. Install dependencies
bun install

# 2. Create .env (see below)

# 3. Set up an isolated development database
bun db:generate      # generate Prisma Client
bun db:deploy        # apply the committed migration history
bun db:seed          # seed sample data

# 4. Run
bun dev              # http://localhost:3000
```

### Environment variables

Create a `.env` in the project root:

```env
SP_DATABASE_URL="postgresql://user:password@host/db"          # pooled
SP_DATABASE_URL_UNPOOLED="postgresql://user:password@host/db" # direct, for migrations
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
```

Generate a secret with `openssl rand -base64 32`. Never commit `.env`.

## Commands

```bash
bun dev                  # dev server
bun run build            # production build
bun lint                 # ESLint
bunx tsc --noEmit        # typecheck

bun test                 # tests, watch mode
bun test:run             # tests, once
bun test:coverage        # with coverage

bun db:generate          # regenerate Prisma Client (required after schema changes)
bun db:push              # disposable databases only; does not apply custom migration SQL
bun db:migrate           # create and run a migration
bun db:deploy            # apply committed migrations (production)
bun db:seed              # seed sample data
bun db:studio            # Prisma Studio

bun scripts/admin.ts create-admin <email> [name]   # create a Super Admin
bun scripts/admin.ts reset-password <email>
bun scripts/admin.ts list-admins
bun scripts/admin.ts db-stats
```

`bun run build` generates Prisma Client and compiles the application, but never
changes a database. Run schema updates as an explicit deployment step.

## Roles

| Role | Prep program | Sunday School | Manages users |
|---|---|---|---|
| Super Admin | Full | Full, every class | All users |
| Priest | View and edit | View and edit every class and age group | None |
| Servants Prep Servant | Full | Only if personally assigned | Students, Mentors |
| Mentor | Own mentees, read-only | Only if personally assigned | None |
| Student | Own progress, lessons, forms, and permitted self-service | Scoped class lessons; no ministry management | None |
| Sunday School Servant | None | Only their assignments | None |
| Parent | None | Only actively linked children | None |

Sunday School authority comes from an **assignment**, not a role — which is how
one person can serve both sides. See [`docs/permissions.md`](docs/permissions.md).

## Account onboarding

The login page is the shared entry point for both ministries:

- **Parents** create their own account with an email and password, then submit
  each child for coordinator approval and class placement.
- **Sunday School servants** submit their name, email, phone number, and the
  grade they currently serve. Only a Super Admin can review the application.
  Approval creates the account with the shared Sunday School temporary password
  and the **Sunday School Servant** access tag. The Super Admin shares the
  password directly; the portal does not email credentials. The servant changes
  it at first login and is assigned to a class separately.
- **Servants Prep students** use the existing invite-code registration flow.
  A Super Admin or Servants Prep Servant reviews the registration before an
  account and enrollment are created.
- **Google sign-in** is available only for an existing, enabled account; it
  does not create a new account.

Privileged accounts are provisioned by an administrator rather than through a
public sign-up form. The portal maintains one account per email address.

## Graduation requirements

A student must meet all four:

1. **Attendance ≥ 75%** — `(present + lates/2) / (total_lessons - excused)`.
   Two lates equal one absence; excused lessons are excluded; exam days do not
   count.
2. **Overall exam average ≥ 75%** across all sections.
3. **At least 60%** in every individual section.
4. **Both Year 1 and Year 2** completed.

Async students have no cohort year, but still complete both curriculum years.
Their serving requirement is all ten approved grade rotations; three attended
weeks or an unreviewed upload does not satisfy it.

## Security notes

- Protected API routes require authentication and enforce authorization
  server-side. Public onboarding routes have separate validation and approval
  rules; client state never grants authority
- Passwords hashed with bcrypt; sessions are JWT-based
- Guardian contact for children is restricted to that class's servants and to
  admins
- `.env` files and spreadsheet exports are gitignored — they may contain real
  personal data
- No personal data belongs in the repository, including in seed data

## Deployment

Production runs on Vercel at
[www.stmarkministry.app](https://www.stmarkministry.app). Set
`SP_DATABASE_URL`, `SP_DATABASE_URL_UNPOOLED`,
`NEXTAUTH_URL`, and `NEXTAUTH_SECRET` in the project settings, then deploy.

Keep Vercel Preview and Production connected to different Neon branches. For a
schema change:

1. Create an isolated Neon branch from production.
2. Set the Preview environment's pooled and unpooled URLs to that branch.
3. Run `bun db:deploy` explicitly against the branch and test the preview.
4. Review the branch schema diff, migration history, and data reconciliation.
5. Before release, take a production snapshot or backup, apply the tested
   committed migrations using `bun db:deploy` with the direct connection,
   verify `/api/health`, and promote the code.

The build command deliberately does not run `prisma db push`; this prevents a
preview build from changing production when environment variables are
misconfigured.

`/api/health` verifies database connectivity after a deploy.

The rotation workflow requires
`20261012014500_four_week_rotation_forms`. Before applying it, confirm there are
no duplicate active assignments per student and every active assignment has
`totalWeeks=4`. The migration adds signed-form records, preserves historical
attendance, and replaces the one-assignment-per-year index with one active
rotation per student. Coordinate serving writes while applying it and verify
assignment/log counts afterward. `db:push` is not a substitute for this migration:
its SQL also installs partial uniqueness and check constraints.

Never include database URLs, credentials, or personal student records in release
logs or documentation. See the migration runbooks linked above for release and
rollback procedures.

## Contributing

Read [`AGENTS.md`](AGENTS.md) first. Before committing:

```bash
bun db:generate    # only if prisma/schema.prisma changed
bunx tsc --noEmit
bun lint
bun test:run
```
