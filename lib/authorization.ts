import { RoleTag, SundaySchoolAuthority } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export type ResourceScope =
  | { kind: "none" }
  | { kind: "all" }
  | { kind: "ids"; ids: ReadonlySet<string> }

export interface AuthorizationContext {
  userId: string
  disabled: boolean
  canAccessContactBook: boolean
  roleTags: ReadonlySet<RoleTag>
  readOnly: boolean
  sundaySchoolYearId: string | null
  prepStudentScope: ResourceScope
  sundaySchoolClassScope: ResourceScope
  guardianChildScope: ResourceScope
  ownSundaySchoolChildId: string | null
}

export class AuthorizationError extends Error {
  constructor(message: "Unauthorized" | "Forbidden" = "Forbidden") {
    super(message)
    this.name = "AuthorizationError"
  }
}

export const NO_SCOPE: ResourceScope = Object.freeze({ kind: "none" })
export const ALL_SCOPE: ResourceScope = Object.freeze({ kind: "all" })

export function idScope(ids: Iterable<string>): ResourceScope {
  const uniqueIds = new Set(ids)
  return uniqueIds.size === 0 ? NO_SCOPE : { kind: "ids", ids: uniqueIds }
}

export function scopeAllows(scope: ResourceScope, id: string): boolean {
  if (scope.kind === "all") return true
  if (scope.kind === "none") return false
  return scope.ids.has(id)
}

/**
 * Converts a scope into a Prisma-compatible ID clause without using
 * `undefined` as a fail-open sentinel. `none` becomes an empty IN clause;
 * `all` becomes an empty object.
 */
export function scopeIdWhere(scope: ResourceScope): { id?: { in: string[] } } {
  if (scope.kind === "all") return {}
  if (scope.kind === "none") return { id: { in: [] } }
  return { id: { in: Array.from(scope.ids) } }
}

export function canWriteBusinessData(context: AuthorizationContext): boolean {
  return !context.disabled && !context.readOnly
}

export function assertCanWriteBusinessData(context: AuthorizationContext): void {
  if (!canWriteBusinessData(context)) throw new AuthorizationError("Forbidden")
}

function newYorkCalendarDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`)
}

/**
 * Loads the authorization principal from current database state. JWT role
 * claims are intentionally not accepted by this function.
 *
 * This resolver is additive during the compatibility rollout; routes should
 * switch to it only after the role/enrollment backfill has been reconciled.
 */
export async function getAuthorizationContext(
  userId: string,
  options: { sundaySchoolYearId?: string; now?: Date } = {}
): Promise<AuthorizationContext> {
  const today = newYorkCalendarDate(options.now ?? new Date())

  const [user, requestedYear] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isDisabled: true,
        canAccessContactBook: true,
        roleAssignments: {
          where: { revokedAt: null },
          select: { tag: true },
        },
        mentorAssignments: {
          where: {
            endedAt: null,
            studentEnrollment: { status: "ACTIVE" },
          },
          select: {
            studentEnrollment: { select: { studentId: true } },
          },
        },
        guardianOfChildren: {
          where: { endedAt: null },
          select: { childId: true },
        },
        linkedSundaySchoolChild: { select: { id: true } },
      },
    }),
    options.sundaySchoolYearId
      ? prisma.sundaySchoolYear.findUnique({
          where: { id: options.sundaySchoolYearId },
          select: { id: true },
        })
      : prisma.sundaySchoolYear.findFirst({
          where: {
            status: "OPEN",
            startDate: { lte: today },
            endDate: { gte: today },
          },
          select: { id: true },
        }),
  ])

  if (!user) throw new AuthorizationError("Unauthorized")

  const roleTags = new Set(user.roleAssignments.map((assignment) => assignment.tag))
  const readOnly = roleTags.has(RoleTag.PRIEST)
  const isSuperAdmin = roleTags.has(RoleTag.SUPER_ADMIN)
  const isPrepServant = roleTags.has(RoleTag.SERVANTS_PREP_SERVANT)
  const yearId = requestedYear?.id ?? null

  let sundaySchoolClassScope: ResourceScope = NO_SCOPE
  if (isSuperAdmin || readOnly) {
    sundaySchoolClassScope = ALL_SCOPE
  } else if (roleTags.has(RoleTag.SUNDAY_SCHOOL_SERVANT) && yearId) {
    const assignments = await prisma.sundaySchoolServantAssignment.findMany({
      where: {
        userId,
        sundaySchoolYearId: yearId,
        endedAt: null,
      },
      select: {
        authority: true,
        classId: true,
        ageGroup: {
          select: {
            levelRows: { select: { level: true } },
          },
        },
      },
    })

    const classIds = new Set(
      assignments.flatMap((assignment) => (assignment.classId ? [assignment.classId] : []))
    )
    const coordinatedLevels = assignments.flatMap((assignment) =>
      assignment.authority === SundaySchoolAuthority.COORDINATOR
        ? (assignment.ageGroup?.levelRows.map((row) => row.level) ?? [])
        : []
    )

    if (coordinatedLevels.length > 0) {
      const coordinatedClasses = await prisma.sundaySchoolClass.findMany({
        where: {
          sundaySchoolYearId: yearId,
          level: { in: coordinatedLevels },
          status: "ACTIVE",
        },
        select: { id: true },
      })
      for (const coordinatedClass of coordinatedClasses) classIds.add(coordinatedClass.id)
    }
    sundaySchoolClassScope = idScope(classIds)
  }

  return {
    userId,
    disabled: user.isDisabled,
    canAccessContactBook: user.canAccessContactBook,
    roleTags,
    readOnly,
    sundaySchoolYearId: yearId,
    prepStudentScope:
      isSuperAdmin || readOnly || isPrepServant
        ? ALL_SCOPE
        : idScope(
            user.mentorAssignments.map(
              (assignment) => assignment.studentEnrollment.studentId
            )
          ),
    sundaySchoolClassScope,
    guardianChildScope: idScope(user.guardianOfChildren.map((link) => link.childId)),
    ownSundaySchoolChildId: user.linkedSundaySchoolChild?.id ?? null,
  }
}
