# CLAUDE.md

The working guide for this repository is **[AGENTS.md](AGENTS.md)** — read it
first. It is tool-neutral and canonical, so guidance stays in one place instead
of drifting between per-tool files.

Deep references:

- [`docs/permissions.md`](docs/permissions.md) — every role, every permission
  helper, and the Sunday School authority model. **Read before touching any
  authorization code.**
- [`docs/sunday-school-mode.md`](docs/sunday-school-mode.md) — Sunday School
  mode end to end.

## The two-minute version

- Two independent modes share one deployment, database, and login: **Servants
  Prep** (`/dashboard/admin|mentor|student`) and **Sunday School**
  (`/dashboard/servants`).
- **Bun**, not npm. Before committing: `bunx tsc --noEmit && bun lint && bun test:run`
  (plus `bun db:generate` if you touched `prisma/schema.prisma`).
- **Prep authorization is role-based** (`lib/roles.ts`). **Sunday School
  authorization is assignment-based** (`lib/sunday-school-access.ts`) — never
  grant it from a role, and always re-derive it from the database inside the
  route.
- **Branch names are `<type>/<short-description>`**: `feature/`, `fix/`,
  `docs/`, `chore/`, `hotfix/`, or `release/MM-DD-YYYY`, then 2–5 lowercase
  hyphenated words (`fix/files-back-to-root-icon`). Never use a random or
  session-generated name; if one was assigned, push to a properly named branch
  instead. See AGENTS.md, "Branch names".
- `app/api/sunday-school/` contains two unrelated features. Check the header
  comment on a route before editing it. See AGENTS.md, "The `sunday-school`
  naming collision".
