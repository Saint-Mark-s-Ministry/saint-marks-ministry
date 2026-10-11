# AGENTS.md

Working guide for AI coding agents (Codex, Claude Code, Cursor, and others) and
for humans new to this repository. This is the canonical file — `CLAUDE.md`
points here rather than repeating it, so there is one source of truth.

Deep references live in `docs/`:

| Document | What it covers |
|---|---|
| [`docs/permissions.md`](docs/permissions.md) | Every role, every permission helper, and the Sunday School authority model. **Read before touching any authorization code.** |
| [`docs/sunday-school-mode.md`](docs/sunday-school-mode.md) | Sunday School mode end to end: schema, routes, invariants, how to extend it |
| [`docs/ASYNC_STUDENT_NOTES_FEATURE_PLAN.md`](docs/ASYNC_STUDENT_NOTES_FEATURE_PLAN.md) | Design notes for the async-student note submission flow |

## What this application is

A Next.js web app for a Coptic Orthodox church, running **two modes** that share
one deployment, one database, and one login:

1. **Servants Prep** (`/dashboard/admin`, `/dashboard/mentor`, `/dashboard/student`)
   — the 2-year Servants Preparation Program: student attendance, exams,
   curriculum, mentors, and graduation requirements.
2. **Sunday School** (`/dashboard/servants`) — the Sunday School ministry
   itself: classes by level (Pre-K–Grad) grouped into age-group bands, the
   children in them, and weekly child attendance.

**The two modes are deliberately independent.** No Sunday School model
references a prep model. The `SERVANT` role has no prep-side permission, and
running the prep program confers no Sunday School authority. If you find
yourself wiring them together, stop and re-read `docs/permissions.md` — that
separation is a design decision, not an oversight.

**Tech stack:** Next.js 16 (App Router + Turbopack), TypeScript, PostgreSQL,
Prisma ORM, NextAuth.js (JWT sessions), Tailwind CSS v4, shadcn/ui, Sonner
(toasts), SWR (data fetching), Vitest (testing).

**Package manager: Bun.** Do not use `npm` or `yarn` — the lockfile is
`bun.lock`.

## Commands

```bash
# Development
bun dev                  # Dev server with Turbopack (http://localhost:3000)
bun run build            # Production build (generates Prisma Client; never changes a database)
bun lint                 # ESLint
bunx tsc --noEmit        # Typecheck without emitting
bun run mobile          # Expo native app (see apps/mobile/README.md)
bun run mobile:typecheck
bun run mobile:export   # Bundle iOS and Android; not signed native binaries

# Testing (Vitest)
bun test                 # Watch mode
bun test:run             # Run once — use this in CI and before committing
bun test:coverage        # With coverage

# Database (Prisma)
bun db:generate          # Regenerate Prisma Client — REQUIRED after schema changes
bun db:push              # Push schema without migrations
bun db:migrate           # Create and run a migration
bun db:deploy            # Apply committed migrations (explicit production step)
bun db:seed              # Seed test data
bun db:studio            # Prisma Studio GUI

# Admin CLI
bun scripts/admin.ts reset-password <email>
bun scripts/admin.ts create-admin <email> [name]
bun scripts/admin.ts list-admins
bun scripts/admin.ts db-stats
```

`bun run build` never changes a database. Schema updates are an explicit,
separate deployment step so a Vercel preview build cannot mutate production.

## Before you commit

```bash
bun db:generate    # only if you touched prisma/schema.prisma
bunx tsc --noEmit
bun lint
bun test:run
```

## Environment variables

```env
SP_DATABASE_URL="postgresql://..."          # Pooled connection (Neon)
SP_DATABASE_URL_UNPOOLED="postgresql://..." # Direct connection, for migrations
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<openssl rand -base64 32>"
```

Never commit a `.env`. Never log or echo these values.

## Repository layout

This is a Bun workspace. The Next.js app remains at the root; `apps/mobile/`
contains the Expo application, `packages/contracts/` contains shared type-only
contracts, and `packages/domain/` contains platform-independent helpers. Use
the checked-in hoisted linker configuration to avoid duplicate native modules.
Mobile code must not import the Prisma runtime or Next.js/server-only modules.
Import shared enum types from `@stmark/contracts` using `import type`.
The native app uses the existing API and NextAuth credentials flow. Its API
origin is `EXPO_PUBLIC_API_URL`; never put database URLs or secrets in Expo
public variables. Local development uses git-ignored `.env.local` files.
See `apps/mobile/README.md` for connection details and scope.
Run both mobile checks above when changing mobile code or shared packages.

```
app/
  api/                  API route handlers (App Router)
    sunday-school/      BOTH Sunday School mode AND the older prep-side
                        serving-verification routes — see the warning below
  dashboard/
    admin/              Servants Prep — admin roles
    mentor/             Servants Prep — mentors
    student/            Servants Prep — students
    servants/           Sunday School mode
components/
  ui/                   shadcn/ui primitives
  admin/                Prep-side composites
hooks/                  useAdminGuard, useSundaySchoolGuard
lib/                    Business logic, permissions, Prisma client, utilities
prisma/                 schema.prisma and seed.ts
types/                  Shared TypeScript types, NextAuth module augmentation
__tests__/              Vitest suites, mirroring lib/ and api/
docs/                   Deep architecture references
```

### ⚠️ The `sunday-school` naming collision

`app/api/sunday-school/` holds **two unrelated features**. Read the header
comment at the top of a route before editing it.

| Routes | Belongs to |
|---|---|
| `assignments/`, `codes/`, `logs/`, `progress/` | **Servants Prep** — verifying that *async prep students* served their required weeks |
| `age-groups/`, `servant-assignments/`, `classes/`, `children/`, `sessions/`, `attendance/`, `dashboard/`, `assignable-servants/` | **Sunday School mode** — the actual ministry |

One Sunday School route sits outside that directory on purpose:
`app/api/public/roster-signup` is **unauthenticated** (the roster sign-up QR
flow). New public routes belong under `app/api/public/` so the absence of a
session is visible in the path.

The same trap exists in the schema and the enums:

| Prep-side | Sunday School mode |
|---|---|
| `SundaySchoolAssignment` (a student's 6-week serving stint) | `SundaySchoolServantAssignment` (who serves/coordinates what) |
| `/api/sunday-school/assignments` | `/api/sunday-school/servant-assignments` |
| `SundaySchoolGrade` (Pre-K … `GRADE_6_PLUS`) | `SundaySchoolLevel` (Pre-K … `GRAD`) |
| `canManageSundaySchool()` in `lib/roles.ts` | `getSundaySchoolAccess()` in `lib/sunday-school-access.ts` |

## Authorization — read this before writing any route

Two different models coexist. Using the wrong one is the most likely way to
introduce a security bug here.

**Servants Prep is role-based.** Helpers in `lib/roles.ts` are pure
`role → boolean` allowlists:

```typescript
import { canManageData } from "@/lib/roles"
if (!canManageData(user.role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
```

**Sunday School is assignment-based, not role-based.** Authority comes from a
`SundaySchoolServantAssignment` naming a scope (one class, or one age-group
band) for one academic year. Resolve it, then use a per-class predicate:

```typescript
import { getSundaySchoolAccess, canServeClass } from "@/lib/sunday-school-access"

const access = await getSundaySchoolAccess(user)
if (!canServeClass(access, classId)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
```

Rules that are not negotiable:

- **Always re-derive authority from the database inside the route.** The
  `session.user.sundaySchool` standing exists only to render a nav entry; it is
  coarse and can be up to a minute stale. Never authorize from it.
- **Never grant Sunday School power to a prep role.** A `SERVANT_PREP` who also
  serves Sunday School gets in by being *assigned*, as an individual. This is
  what lets one person wear both hats, given `User.role` holds a single value.
- **`PRIEST` is read-only everywhere**, in both modes.
- **Guardian contact for children is sensitive.** It is returned only by
  `/api/sunday-school/children*`, only to people who serve that child's class
  and to admins. Keep it out of summary endpoints and the command palette.

`__tests__/lib/roles.test.ts` pins that `SERVANT` gets `false` from every
prep-side helper. Keep that passing when you add a helper.

Full detail: [`docs/permissions.md`](docs/permissions.md).

## Conventions

### API routes

```typescript
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()          // lib/auth-helpers.ts
    // authorization check — see above
    // business logic
  } catch (error: unknown) {
    return handleApiError(error)              // lib/api-utils.ts
  }
}
```

Prefer the existing wrappers in `lib/api-utils.ts` (`withAuth`, `withRole`,
`handleApiError`) over hand-rolled try/catch. `handleApiError` already maps
thrown `"Unauthorized"` / `"Forbidden"` / `"Not found"` to the right status.

### Types

- `catch (error: unknown)`, then narrow with `error instanceof Error`. Never
  `any`.
- Import enums from `@prisma/client`; do not redeclare them.
- Run `bun db:generate` after schema changes or types will be stale.

### Dates

Calendar days (lesson dates, Sunday School session dates) are stored at
**midnight UTC** and rendered with `formatDateUTC` from `lib/utils.ts`. Using a
local-midnight `Date` shifts the day for viewers west of UTC. For Sunday School
sessions, normalize with `normalizeSessionDate` from `lib/sunday-school-class.ts`.

### UI

- Toasts: `import { toast } from 'sonner'`.
- Components live in `components/ui/` (shadcn/ui). Add new ones with
  `npx shadcn@latest add <name>`.
- Data fetching: the SWR hooks in `lib/swr.ts`. Add a hook there rather than
  calling `useSWR` ad hoc in a page.
- Page guards: `useAdminGuard(roleCheck)` for prep pages,
  `useSundaySchoolGuard()` for Sunday School pages.

### Tests

Vitest, in `__tests__/`, mirroring the source layout. Pure logic — permission
predicates, attendance math, date normalization — is unit-tested without a
database; keep new logic in that shape where you can.

## Domain rules worth knowing

**Graduation** requires all four:

1. Attendance ≥ 75%, computed as `(present + lates/2) / (total_lessons - excused)`.
   Two lates equal one absence; `EXCUSED` is excluded from both sides; lessons
   flagged `isExamDay` are excluded entirely.
2. Overall exam average ≥ 75% across all sections.
3. At least 60% in every individual exam section.
4. Both `YEAR_1` and `YEAR_2` completed.

**Key fields**

- `StudentEnrollment.studentId` is unique — one enrollment per student.
- `Lesson.isExamDay` — attendance that day does not count toward graduation.
- `SundaySchoolClass.academicYearId` is required; Sunday School authority is
  scoped per academic year.

**Enums** (all from `@prisma/client`)

- `UserRole`: SUPER_ADMIN, PRIEST, SERVANT_PREP, MENTOR, STUDENT, SERVANT
- `YearLevel`: YEAR_1, YEAR_2
- `AttendanceStatus`: PRESENT, LATE, ABSENT, EXCUSED
- `LessonStatus`: SCHEDULED, CANCELLED, NO_CLASS, COMPLETED
- `ExamSectionType`: 8 sections (BIBLE_STUDIES, DOGMA, …)
- `SundaySchoolLevel`: PRE_K, KINDERGARTEN, GRADE_1 … GRADE_12, COLLEGE, GRAD
- `SundaySchoolAuthority`: SERVANT, COORDINATOR
- `SundaySchoolGrade`: prep-side only, Pre-K … GRADE_6_PLUS

## Common workflows

**Changing the schema**

1. Edit `prisma/schema.prisma`
2. `bun db:generate`
3. Create an isolated Neon branch from production and point only the local or
   preview environment at that branch
4. `bun db:push` (or `bun db:migrate`) against the isolated branch
5. Review the schema diff and test the application there
6. Update affected routes, components, and `types/`

Never apply a schema change as part of `bun run build`. For production, take a
snapshot or backup, apply the already-tested additive schema change explicitly,
verify `/api/health`, and then deploy the code. Use the pooled URL for the app
and the direct/unpooled URL for schema operations.

**Adding a prep-side permission**

1. Add the helper to `lib/roles.ts` as an explicit allowlist
2. Add its assertions to `__tests__/lib/roles.test.ts`, including that
   `SERVANT` is denied
3. Enforce it in the API route, then reflect it in the UI

**Adding Sunday School authority**

Do not add a role. Extend the assignment model — see
[`docs/sunday-school-mode.md`](docs/sunday-school-mode.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Type errors after a schema change | `bun db:generate` |
| Stale build artifacts | `rm -rf .next && bun dev` |
| A preview needs schema changes | Point the preview at an isolated Neon branch, then run `bun db:push` explicitly against that branch |
| `Null constraint violation` / missing column in production after a merge | A committed migration was never applied. Run `bun db:deploy` with the direct (unpooled) production URL |
| A route 403s unexpectedly in Sunday School | The user probably has no assignment for the **active academic year** |

## Production

Deployed on Vercel at `https://servants-prep-app.vercel.app`. Required env vars
are the four listed above. `/api/health` checks database connectivity after a
deploy. Preview and production environments must use different Neon branch
connection strings.

### Email (Resend)

Account emails (registration, servant applications, parent sign-up, password
reset/changed) go through `lib/mail/`. Env vars:

| Var | Purpose |
|---|---|
| `RESEND_API_KEY` | Send-only Resend key. Without it, emails are skipped and logged. |
| `APP_URL` | Base URL for links in emails; falls back to `NEXTAUTH_URL`. |
| `EMAIL_FROM` | Optional; defaults to `St. Mark Ministry <no-reply@stmarkministry.app>`. |
| `EMAIL_DEV_ALLOWLIST` | Comma list of addresses or `@domains` that non-production may email. |

Only production (`VERCEL_ENV=production`, or `EMAIL_DELIVERY=live`) emails real
people. Local and preview share the production database, so elsewhere only
`*@resend.dev` and the allowlist receive mail. Password links are signed with
`NEXTAUTH_SECRET` and bound to `User.authVersion`, so they work once.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
