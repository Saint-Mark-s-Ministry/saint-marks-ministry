import { RoleTag, SundaySchoolAuthority, SundaySchoolLevel, UserRole } from "@prisma/client"
import { prisma } from "./prisma"
import {
  canAdministerSundaySchool,
  isSundaySchoolReadOnly,
  seesAllSundaySchoolClasses,
} from "./roles"

/**
 * Who may touch what in Sunday School mode.
 *
 * Authority is not a role. It comes from a SundaySchoolServantAssignment
 * naming a scope — one class, or one age group (Elementary / Middle / High) —
 * for one academic year. That is what lets a single person wear two hats: a
 * SERVANT_PREP who also serves Sunday School gets in because they are
 * assigned, not because of their prep title.
 *
 * A class's band is derived from its `level`: whichever age group lists that
 * level owns it. One source of truth, so moving a grade between bands
 * re-parents its classes with no data migration.
 *
 * Routes must always call getSundaySchoolAccess and check against the result.
 * The standing carried in the session (see lib/auth.ts) is for rendering only.
 */

export interface SundaySchoolAccess {
  /** SUPER_ADMIN: every class, every power, plus age groups */
  isAdmin: boolean
  /** PRIEST: sees everything, every write refused */
  readOnly: boolean
  /** true when this user has any way into Sunday School mode at all */
  canRead: boolean
  /** classes they serve in (children + attendance) */
  servantClassIds: Set<string>
  /** classes they coordinate — direct assignments plus age-group expansion */
  coordinatorClassIds: Set<string>
  /** age groups they coordinate */
  coordinatorAgeGroupIds: Set<string>
  /** levels covered by those age groups — lets them create classes there */
  coordinatorLevels: Set<SundaySchoolLevel>
  /** 'all' for SUPER_ADMIN and PRIEST; otherwise the classes they can see */
  visibleClassIds: Set<string> | "all"
}

interface AccessUser {
  id: string
  role: UserRole
}

/**
 * Resolve a user's Sunday School standing for an academic year (the active
 * year by default).
 */
export async function getSundaySchoolAccess(
  user: AccessUser,
  academicYearId?: string
): Promise<SundaySchoolAccess> {
  const isAdmin = canAdministerSundaySchool(user.role)
  const readOnly = isSundaySchoolReadOnly(user.role)
  const seesAll = seesAllSundaySchoolClasses(user.role)

  const [activeYear, participantGrant] = await Promise.all([
    academicYearId
      ? Promise.resolve({ id: academicYearId })
      : prisma.academicYear.findFirst({
          where: { isActive: true },
          select: { id: true },
        }),
    seesAll
      ? Promise.resolve(null)
      : prisma.userRoleAssignment.findFirst({
          where: {
            userId: user.id,
            tag: RoleTag.SUNDAY_SCHOOL_SERVANT,
            revokedAt: null,
          },
          select: { id: true },
        }),
  ])
  const yearId = activeYear?.id

  const servantClassIds = new Set<string>()
  const coordinatorClassIds = new Set<string>()
  const coordinatorAgeGroupIds = new Set<string>()
  const coordinatorLevels = new Set<SundaySchoolLevel>()

  if (yearId) {
    const assignments = await prisma.sundaySchoolServantAssignment.findMany({
      where: { userId: user.id, academicYearId: yearId, endedAt: null },
      select: {
        authority: true,
        classId: true,
        ageGroupId: true,
      },
    })

    const assignedAgeGroupIds = new Set<string>()

    for (const assignment of assignments) {
      const isCoordinator = assignment.authority === SundaySchoolAuthority.COORDINATOR

      if (assignment.classId) {
        if (isCoordinator) {
          coordinatorClassIds.add(assignment.classId)
        } else {
          servantClassIds.add(assignment.classId)
        }
        continue
      }

      // Resolve bands by ageGroupId below rather than through the composite
      // Prisma relation. Legacy age groups have sundaySchoolYearId = NULL, so
      // SQL cannot join the otherwise-valid assignment through that relation.
      if (isCoordinator && assignment.ageGroupId) {
        assignedAgeGroupIds.add(assignment.ageGroupId)
      }
    }

    const coordinatedBands = assignedAgeGroupIds.size > 0
      ? await prisma.sundaySchoolAgeGroup.findMany({
          where: {
            id: { in: Array.from(assignedAgeGroupIds) },
            isActive: true,
          },
          select: { id: true, levels: true },
        })
      : []

    for (const band of coordinatedBands) {
      coordinatorAgeGroupIds.add(band.id)
      for (const level of band.levels) coordinatorLevels.add(level)
    }

    // Expand each coordinated band into the classes it owns this year
    if (coordinatedBands.length > 0) {
      const levels = Array.from(coordinatorLevels)
      const bandClasses = await prisma.sundaySchoolClass.findMany({
        where: { academicYearId: yearId, level: { in: levels } },
        select: { id: true },
      })
      for (const cls of bandClasses) {
        coordinatorClassIds.add(cls.id)
      }
    }
  }

  const hasParticipantTag = participantGrant !== null
  const hasAssignment =
    servantClassIds.size > 0 || coordinatorClassIds.size > 0 || coordinatorAgeGroupIds.size > 0

  const visibleClassIds: Set<string> | "all" = seesAll
    ? "all"
    : new Set<string>([...servantClassIds, ...coordinatorClassIds])

  return {
    isAdmin,
    readOnly,
    // The tag grants entry to the mode, while assignments remain the only
    // source of class scope. A tagged, unassigned servant therefore gets a
    // valid empty workspace rather than access to somebody else's records.
    canRead: seesAll || hasParticipantTag || hasAssignment,
    servantClassIds,
    coordinatorClassIds,
    coordinatorAgeGroupIds,
    coordinatorLevels,
    visibleClassIds,
  }
}

// ============================================
// Predicates — pure, so they unit-test without a database
// ============================================

/** Can look at this class */
export function canViewClass(access: SundaySchoolAccess, classId: string): boolean {
  if (!access.canRead) return false
  if (access.visibleClassIds === "all") return true
  return access.visibleClassIds.has(classId)
}

/** Can manage this class's children and take its attendance */
export function canServeClass(access: SundaySchoolAccess, classId: string): boolean {
  if (access.isAdmin) return true
  if (access.readOnly) return false
  return access.servantClassIds.has(classId) || access.coordinatorClassIds.has(classId)
}

/** Can edit this class's details and decide who serves in it */
export function canCoordinateClass(access: SundaySchoolAccess, classId: string): boolean {
  if (access.isAdmin) return true
  if (access.readOnly) return false
  return access.coordinatorClassIds.has(classId)
}

/** Any active servant assigned to the class may choose its lesson owner. */
export function canAssignWeeklyLessonOwner(
  access: SundaySchoolAccess,
  classId: string
): boolean {
  return canServeClass(access, classId)
}

/** Any active servant assigned to the class may update its lesson content. */
export function canEditWeeklyLesson(
  access: SundaySchoolAccess,
  classId: string
): boolean {
  return canServeClass(access, classId)
}

/** Can record servant attendance for a class they actively serve. */
export function canTakeServantAttendance(
  access: SundaySchoolAccess,
  classId: string
): boolean {
  return canServeClass(access, classId)
}

/** Can view servant attendance for this class without necessarily editing it. */
export function canViewServantAttendance(
  access: SundaySchoolAccess,
  classId: string
): boolean {
  if (access.isAdmin) return true
  if (access.readOnly) return canViewClass(access, classId)
  return canTakeServantAttendance(access, classId)
}

/** Can request servant-attendance reporting for at least one class. */
export function canViewServantAttendanceReport(access: SundaySchoolAccess): boolean {
  if (access.isAdmin) return true
  if (access.readOnly) return access.canRead
  return access.servantClassIds.size > 0 || access.coordinatorClassIds.size > 0
}

/**
 * Can open a new class at this grade level — SUPER_ADMIN anywhere, or the
 * coordinator of the band that owns the level. A class coordinator cannot.
 */
export function canCreateClassAtLevel(
  access: SundaySchoolAccess,
  level: SundaySchoolLevel
): boolean {
  if (access.isAdmin) return true
  if (access.readOnly) return false
  return access.coordinatorLevels.has(level)
}

/**
 * Can delete a class — SUPER_ADMIN, or the coordinator of its band. Being
 * coordinator of the class itself is not enough.
 */
export function canDeleteClass(
  access: SundaySchoolAccess,
  level: SundaySchoolLevel
): boolean {
  return canCreateClassAtLevel(access, level)
}

/**
 * Can review a pending child registration request for this level — the same
 * authority as creating a class at that level, since approving a placement
 * means deciding (or already knowing) which class the child lands in.
 */
export function canReviewChildRegistrationAtLevel(
  access: SundaySchoolAccess,
  level: SundaySchoolLevel
): boolean {
  return canCreateClassAtLevel(access, level)
}

/** Can add or remove assignments on this age group */
export function canCoordinateAgeGroup(
  access: SundaySchoolAccess,
  ageGroupId: string
): boolean {
  if (access.isAdmin) return true
  if (access.readOnly) return false
  return access.coordinatorAgeGroupIds.has(ageGroupId)
}

/**
 * Narrow a Prisma `where` to the classes this user may see. Returns undefined
 * when no filter is needed, matching the contract of getMentorStudentIds.
 */
export function visibleClassFilter(access: SundaySchoolAccess): string[] | undefined {
  if (access.visibleClassIds === "all") return undefined
  return Array.from(access.visibleClassIds)
}

/**
 * Who should be notified about (and can review) a child registration request
 * at this level: every SUPER_ADMIN, plus the coordinators of whichever
 * age-group band owns this level for the given (or active) academic year.
 */
export async function getChildRegistrationReviewerIds(
  level: SundaySchoolLevel,
  academicYearId?: string
): Promise<string[]> {
  const yearId =
    academicYearId ??
    (await prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    }))?.id

  const [admins, ageGroups] = await Promise.all([
    prisma.user.findMany({
      where: { role: UserRole.SUPER_ADMIN, isDisabled: false },
      select: { id: true },
    }),
    yearId
      ? prisma.sundaySchoolAgeGroup.findMany({
          where: { isActive: true, levels: { has: level } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ])

  const coordinatorAssignments = yearId && ageGroups.length > 0
    ? await prisma.sundaySchoolServantAssignment.findMany({
        where: {
          academicYearId: yearId,
          authority: SundaySchoolAuthority.COORDINATOR,
          ageGroupId: { in: ageGroups.map(ageGroup => ageGroup.id) },
          endedAt: null,
        },
        select: { userId: true },
      })
    : []

  return Array.from(
    new Set([...admins.map((a) => a.id), ...coordinatorAssignments.map((a) => a.userId)])
  )
}
