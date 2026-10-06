# Permissions

Complete reference for authorization in this application. **Read this before
touching any authorization code.** The target identity and permission model is
specified in [`sunday-school-feature-spec.md`](sunday-school-feature-spec.md).

## Migration state

The application is in a compatibility phase. Existing routes still read the
legacy `User.role` and `SundaySchoolServantAssignment` access resolver so the
current application keeps working. The additive foundation also stores:

- multi-valued role tags in `UserRoleAssignment`;
- Servants Prep mentor history in `MentorAssignment`;
- Sunday School scope in year-bound servant assignments; and
- guardian and child relationships separately from role tags.

During this phase, legacy columns are not removed. New routes should resolve a
server-side `AuthorizationContext` from `lib/authorization.ts`; they must not
authorize from JWT role claims. Existing routes are migrated in small,
reversible groups after their backfill counts have been reconciled.

Two different models coexist, and using the wrong one is the most likely way to
introduce a security bug here:

| Mode | Model | Source of truth |
|---|---|---|
| Servants Prep | **Role-based** — pure `role → boolean` allowlists | `lib/roles.ts` |
| Sunday School | **Assignment-based** — authority over a named scope | `lib/sunday-school-access.ts` |

The reason for the split is in [Why Sunday School is not
role-based](#why-sunday-school-is-not-role-based) below. The short version is:
role tags say which modes a person participates in, while assignments say
which records they may reach.

---

## Legacy primary role

`UserRole` remains during compatibility and drives the existing UI. It is not
the long-term authorization source of truth. `RoleTag` is the multi-valued
identity model; a person may simultaneously be a priest, a Servants Prep
servant, and a Sunday School servant.

Tags grant participation, not record scope. A `SUNDAY_SCHOOL_SERVANT` tag alone
cannot reveal a class, and a `MENTOR` tag alone cannot reveal a student. Active
assignments or guardian relationships grant that scope.

Creating a Sunday School servant assignment automatically grants the active
`SUNDAY_SCHOOL_SERVANT` tag in the same transaction when it is missing. This
keeps mode access and assignment scope consistent without making the tag itself
grant access to any roster.

| Role | Prep program | Sunday School | Manages users |
|---|---|---|---|
| `SUPER_ADMIN` | Full | Full, every class | All users |
| `PRIEST` | Full, read-only | Reads every class, writes nothing | None |
| `SERVANT_PREP` | Full | **Only if personally assigned** | `STUDENT`, `MENTOR` |
| `MENTOR` | Own mentees, read-only | None | None |
| `STUDENT` | Own data, read-only | None | None |
| `SERVANT` | **None** | Only their assignments | None |

Two rules that hold in both directions:

- **`SERVANT` has no prep-side permission.** Every prep helper is an explicit
  allowlist, so this holds by construction rather than by remembering to
  exclude it. `__tests__/lib/roles.test.ts` pins it — keep that test passing
  when you add a helper.
- **`SERVANT_PREP` has no Sunday School permission.** Running the prep program
  confers nothing in the other mode.

`PRIEST` is read-only **everywhere**. When adding a write path, confirm it is
excluded.

---

## Servants Prep: role helpers

All in `lib/roles.ts`. Each is a pure function of the role, safe to call on the
client, and used identically on both sides.

### Identity

| Helper | True for |
|---|---|
| `isSuperAdmin` | `SUPER_ADMIN` |
| `isPriest` | `PRIEST` |
| `isServantPrep` | `SERVANT_PREP` |
| `isMentor` | `MENTOR` |
| `isStudent` | `STUDENT` |
| `isServant` | `SERVANT` |
| `isAdmin` | `SUPER_ADMIN`, `PRIEST`, `SERVANT_PREP` |

### Capability

| Helper | True for | Governs |
|---|---|---|
| `canAccessAdmin` | admin roles | Viewing the admin dashboard |
| `canManageData` | `SUPER_ADMIN`, `SERVANT_PREP` | Attendance, exams, curriculum writes |
| `canManageCurriculum` | `SUPER_ADMIN`, `SERVANT_PREP` | Lessons |
| `canManageExams` | `SUPER_ADMIN`, `SERVANT_PREP` | Exams and scores |
| `canManageEnrollments` | `SUPER_ADMIN`, `SERVANT_PREP` | Enrollment records |
| `canAssignMentors` | `SUPER_ADMIN`, `SERVANT_PREP` | Mentor assignment |
| `canSelfAssignMentees` | `MENTOR` | A mentor claiming mentees |
| `canBeMentor` | `SUPER_ADMIN`, `SERVANT_PREP`, `MENTOR` | Eligibility to hold mentees |
| `canViewStudents` | admin roles + `MENTOR` | Student lists (mentors filtered to their own) |
| `isReadOnlyAdmin` | `PRIEST` | Rendering read-only affordances |
| `canReviewAsyncNotes` | `SUPER_ADMIN`, `SERVANT_PREP` | Approving async note submissions |
| `canSetAsyncStatus` | `SUPER_ADMIN`, `SERVANT_PREP` | Marking a student async |
| `canSubmitAsyncContent` | `STUDENT` | Submitting notes (must also *be* async) |
| `canManageInviteCodes` | `SUPER_ADMIN`, `SERVANT_PREP` | Registration invite codes |
| `canReviewRegistrations` | `SUPER_ADMIN`, `SERVANT_PREP` | Approving registrations |
| `canViewRegistrations` | admin roles | Reading registration submissions |
| `canReviewServantApplications` | `SUPER_ADMIN` | Reviewing Sunday School servant sign-ups |
| `canManageSundaySchool` | `SUPER_ADMIN`, `SERVANT_PREP` | **Prep-side only** — the async serving-verification flow (codes, logs). Not Sunday School mode. |

### User management

| Helper | Meaning |
|---|---|
| `canManageUsers` | `SUPER_ADMIN`, `SERVANT_PREP` may manage *some* users |
| `canManageAllUsers` | `SUPER_ADMIN` alone may manage *any* user |
| `SERVANT_PREP_MANAGEABLE_ROLES` | `[STUDENT, MENTOR]` |
| `canServantPrepManageRole(target)` | Whether a `SERVANT_PREP` may act on that role |

`SERVANT` is deliberately **not** in `SERVANT_PREP_MANAGEABLE_ROLES`. Servant
accounts are created by `SUPER_ADMIN` only. Enforced in `app/api/users/route.ts`,
`app/api/users/[id]/route.ts`, and `app/api/profile-picture/upload/route.ts`.

A `SERVANT_PREP` also cannot use a role filter on `GET /api/users` to look
outside their permitted set — the filter can only narrow it.

---

## Sunday School: assignment-based authority

### The model

A `SundaySchoolServantAssignment` row says: **this person**, for **this
academic year**, has **this authority** over **this scope**.

- **Authority** — `SundaySchoolAuthority`: `SERVANT` or `COORDINATOR`
- **Scope** — exactly one of `classId` or `ageGroupId`. Never both, never
  neither. Prisma cannot express that, so the API validates it.

An **age group** (`SundaySchoolAgeGroup`) is a band like Elementary, Middle
School, or High School, owning a set of grade levels. A class's band is
**derived from its `level`** — whichever age group lists it. There is no
`ageGroupId` on the class, so moving a grade between bands re-parents its
classes with no migration.

### Who can do what

| Who | Scope | Powers |
|---|---|---|
| `SUPER_ADMIN` | Everything | All of the below, everywhere, plus age groups and servant accounts |
| `PRIEST` | Everything | Read only |
| Age-group coordinator | Every class in their band | Everything a class coordinator can, **plus create and delete classes** in that band. Sees only their own band. |
| Class coordinator | One class | Edit the class, staff it, manage its children, and record child and servant attendance. **No** create/delete. |
| Servant of a class | One class | That class's children and weekly child attendance; no servant-attendance entry or reporting |
| Anyone else, including an unassigned `SERVANT_PREP` | — | Nothing |

`SERVANT`, `MENTOR`, and `SERVANT_PREP` accounts may be assigned directly. A
`SUPER_ADMIN` may also be assigned when they have an active
`SUNDAY_SCHOOL_SERVANT` tag, allowing an administrator to personally serve a
class without weakening the read-only rule for priests.

### The role helpers that remain

Only these four things about Sunday School are genuinely role-derived:

| Helper | True for | Meaning |
|---|---|---|
| `canAdministerSundaySchool` | `SUPER_ADMIN` | Age groups, servant accounts, any class |
| `seesAllSundaySchoolClasses` | `SUPER_ADMIN`, `PRIEST` | Visibility without an assignment |
| `isSundaySchoolReadOnly` | `PRIEST` | Sees, never writes |
| `canBeAssignedToSundaySchool` | `SERVANT`, `MENTOR`, `SERVANT_PREP`; tagged `SUPER_ADMIN` | May receive an assignment |

Everything else goes through the resolver.

### Using the resolver

```typescript
import {
  getSundaySchoolAccess,
  canServeClass,
  canCoordinateClass,
  canTakeServantAttendance,
  canCreateClassAtLevel,
  canDeleteClass,
  canCoordinateAgeGroup,
  canViewClass,
  visibleClassFilter,
} from "@/lib/sunday-school-access"

// One DB round trip; defaults to the active academic year
const access = await getSundaySchoolAccess(user)

if (!canServeClass(access, classId)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
```

`getSundaySchoolAccess` returns a `SundaySchoolAccess`:

| Field | Meaning |
|---|---|
| `isAdmin` | `SUPER_ADMIN` — passes every check |
| `readOnly` | `PRIEST` — fails every write check |
| `canRead` | Has any way into the mode at all |
| `servantClassIds` | Classes they serve |
| `coordinatorClassIds` | Classes they coordinate — direct assignments **plus** every class expanded from their bands |
| `coordinatorAgeGroupIds` | Bands they coordinate |
| `coordinatorLevels` | Grade levels those bands own — what gates class creation |
| `visibleClassIds` | `'all'` for admin/priest, otherwise the visible set |

The predicates over it are pure, so they unit-test without a database — see
`__tests__/lib/sunday-school-access.test.ts`.

Legacy routes use `visibleClassFilter(access)`. New code should use the
explicit `ResourceScope` helpers in `lib/authorization.ts`: `none`, `all`, or
an ID set. `none` becomes `id IN []`; it must never become `undefined`, because
an omitted Prisma filter can accidentally mean unrestricted access.

### Non-negotiable rules

1. **Always re-derive authority from the database inside the route.** The
   `session.user.sundaySchool` standing (`{ hasAccess, isCoordinator }`, set in
   `lib/auth.ts`) exists only to decide whether to render a nav entry. It is
   coarse and up to a minute stale. Never authorize from it.
2. **Never grant Sunday School power from a prep role.** If you are about to
   write `role === 'SERVANT_PREP'` in a Sunday School route, that is the bug
   this model was built to prevent.
3. **Check the destination, not just the source.** Moving a child or a class
   needs authority over where it is going, or someone could push a record into
   a class they have nothing to do with.
4. **Guardian contact is sensitive.** Children are minors. It is returned only
   by `/api/sunday-school/children*` and `/api/sunday-school/families`, scoped
   to people who can see at least one child in that family — never from the
   dashboard summary or the command palette.
5. **A grade level belongs to at most one age group.** Enforced by
   `assertLevelsUnclaimed` on every age-group write. Without it a class would
   sit in two bands and answer to two coordinators.

### Feedback exception for priests

The Sunday School feedback board is a product forum, not a write to ministry
records. Anyone with `access.canRead` may submit ideas and vote, including
`PRIEST`. This is the sole deliberate exception to the normal priest read-only
rule. Priests may edit or delete only their own open ideas and never receive
moderation authority; changing idea statuses or deleting another person's idea
remains `SUPER_ADMIN`-only. All feedback routes still call
`getSundaySchoolAccess` and refuse users who cannot enter Sunday School.

---

## Why Sunday School is not role-based

The first implementation gave the `SERVANT_PREP` role blanket Sunday School
power. That was wrong: a prep leader with no Sunday School involvement could
create servant accounts, staff classes, and edit any child's record.

Adding roles like `HIGH_SCHOOL_COORDINATOR` would not have fixed it:

- It bakes one org chart into a Postgres enum. Splitting Elementary later, or
  handing one person both Middle and High, becomes a migration.
- `User.role` holds a single value, so a `SERVANT_PREP` who *also* coordinates
  High School still could not be described.

What the ministry actually has is one idea at three sizes — authority over a
class, over a band, or over everything. That is a **scope**, and scopes belong
in data. Every case is now a row: a High School Coordinator is a `COORDINATOR`
assignment scoped to the High School age group. Adding a Pre-K coordinator, or
moving Grade 6 from Elementary to Middle, is data entry.

---

## Session and client-side guards

The JWT carries a coarse standing so synchronous renders (the navbar switcher,
page guards) do not need a fetch:

```typescript
session.user.sundaySchool // { hasAccess: boolean, isCoordinator: boolean, hasHomeworkAccess: boolean }
```

It is recomputed on sign-in and on the periodic (~60s) token revalidation in
`lib/auth.ts`. Assignment changes therefore take effect within about a minute
for navigation purposes — and immediately for anything the server enforces.

Page guards:

| Hook | Use for |
|---|---|
| `useAdminGuard(roleCheck)` | Prep pages — takes a role predicate |
| `useSundaySchoolGuard()` | Sunday School pages — reads session standing |

Both redirect to `/login` when signed out and `/dashboard` when unauthorized.
Neither is a security boundary; the API is.

Per-class affordances come from the **API payload**, not from the client
re-deriving anything: list and detail responses carry `canServe`,
`canCoordinate`, `canTakeServantAttendance`, and `canDelete` for each class.

---

## Testing authorization

| File | Covers |
|---|---|
| `__tests__/lib/roles.test.ts` | Every prep helper; `SERVANT` denied across all of them; `SERVANT_PREP` cannot manage a `SERVANT` |
| `__tests__/lib/sunday-school-access.test.ts` | The predicates: band coordinator reaches their band and nothing outside it; class coordinator cannot create or delete; unassigned `SERVANT_PREP` gets nothing; `PRIEST` reads but never writes; level-ownership rules |
| `__tests__/api/api-authorization.test.ts` | Route-level expectations across both models |
| `__tests__/api/sunday-school-servant-attendance.test.ts` | Servant-attendance authorization, validation, roster scope, and idempotent saves |

When you add a permission, add its denial cases too — a test that only proves
the happy path does not protect anything.
