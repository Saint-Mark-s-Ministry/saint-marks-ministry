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

The two workspaces are deliberately independent — no Sunday School data
references the prep program, and vice versa.

## Documentation

| Document | For |
|---|---|
| [`AGENTS.md`](AGENTS.md) | The working guide — commands, layout, conventions, gotchas. Start here, whether you are a person or an AI coding agent. |
| [`docs/permissions.md`](docs/permissions.md) | Every role and permission, and the Sunday School authority model |
| [`docs/sunday-school-mode.md`](docs/sunday-school-mode.md) | Sunday School mode end to end |
| [`docs/sunday-school-migration-runbook.md`](docs/sunday-school-migration-runbook.md) | Production database rehearsal, deployment, verification, and rollback |

## Features

### Servants Prep
- **Role-based access** for Super Admins, Priests, Servants Prep Servants,
  Mentors, and Students
- **Academic years** with enrollment management, including late-start students
- **Curriculum** — weekly lessons with resources, ordering, and exam days
- **Attendance** — Present / Late / Absent / Excused, with expected absences and
  a late-start curve
- **Exams** — eight sections, per-section and overall requirements
- **Graduation tracking** — live validation of every requirement
- **Mentors** — each student assigned a mentor, with mentee dashboards
- **Async students** — note submissions and serving verification for students
  who cannot attend in person
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

## Getting started

**Prerequisites:** Bun 1.3+ and a PostgreSQL database.

```bash
# 1. Install dependencies
bun install

# 2. Create .env (see below)

# 3. Set up the database
bun db:generate      # generate Prisma Client
bun db:push          # push the schema
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
bun db:push              # push schema without migrations
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
| Priest | Full, read-only | Reads every class | None |
| Servants Prep Servant | Full | Only if personally assigned | Students, Mentors |
| Mentor | Own mentees, read-only | Only if personally assigned | None |
| Student | Own data, read-only | None | None |
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

## Security notes

- All API routes are authenticated; authorization is enforced server-side on
  every request, never from client state
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
3. Run `bun db:push` explicitly against the branch and test the preview.
4. Review the branch schema diff.
5. Before release, take a production snapshot or backup, apply the tested
   additive schema update explicitly, verify `/api/health`, and deploy the code.

The build command deliberately does not run `prisma db push`; this prevents a
preview build from changing production when environment variables are
misconfigured.

`/api/health` verifies database connectivity after a deploy.

## Contributing

Read [`AGENTS.md`](AGENTS.md) first. Before committing:

```bash
bun db:generate    # only if prisma/schema.prisma changed
bunx tsc --noEmit
bun lint
bun test:run
```
