import { beforeEach, describe, it, expect, vi } from 'vitest'
import { RoleTag, UserRole, type SundaySchoolLevel } from '@prisma/client'

const prismaMocks = vi.hoisted(() => ({
  activeYear: vi.fn(),
  participantGrant: vi.fn(),
  servantAssignments: vi.fn(),
  ageGroups: vi.fn(),
  classes: vi.fn(),
  admins: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    academicYear: { findFirst: prismaMocks.activeYear },
    userRoleAssignment: { findFirst: prismaMocks.participantGrant },
    sundaySchoolServantAssignment: { findMany: prismaMocks.servantAssignments },
    sundaySchoolAgeGroup: { findMany: prismaMocks.ageGroups },
    sundaySchoolClass: { findMany: prismaMocks.classes },
    user: { findMany: prismaMocks.admins },
  },
}))

import {
  canCoordinateAgeGroup,
  canCoordinateClass,
  canAssignWeeklyLessonOwner,
  canEditWeeklyLesson,
  canCreateClassAtLevel,
  canDeleteClass,
  canReviewChildRegistrationAtLevel,
  canServeClass,
  canTakeServantAttendance,
  canViewClass,
  canViewServantAttendance,
  canViewServantAttendanceReport,
  getSundaySchoolAccess,
  getChildRegistrationReviewerIds,
  visibleClassFilter,
  type SundaySchoolAccess,
} from '@/lib/sunday-school-access'
import { assertLevelsUnclaimed, findAgeGroupForLevel } from '@/lib/sunday-school-class'

/**
 * These cover the predicates over a resolved SundaySchoolAccess — the part of
 * the authority model that is pure. Resolution itself (reading assignments and
 * expanding an age group into its classes) needs a database.
 */

const CLASS_A = 'class-grade-2'
const CLASS_B = 'class-grade-9'
const CLASS_C = 'class-grade-11'
const HIGH_SCHOOL = 'band-high'

function makeAccess(overrides: Partial<SundaySchoolAccess> = {}): SundaySchoolAccess {
  const base: SundaySchoolAccess = {
    isAdmin: false,
    readOnly: false,
    canRead: true,
    servantClassIds: new Set<string>(),
    coordinatorClassIds: new Set<string>(),
    coordinatorAgeGroupIds: new Set<string>(),
    coordinatorLevels: new Set<SundaySchoolLevel>(),
    visibleClassIds: new Set<string>(),
    ...overrides,
  }
  // Keep visibility consistent with the assignments unless a test sets it
  if (!overrides.visibleClassIds && base.visibleClassIds !== 'all') {
    base.visibleClassIds = new Set<string>([
      ...base.servantClassIds,
      ...base.coordinatorClassIds,
    ])
  }
  return base
}

// A servant on one class, nothing else
const servantOfA = makeAccess({ servantClassIds: new Set([CLASS_A]) })

// Coordinator of a single class
const classCoordinator = makeAccess({ coordinatorClassIds: new Set([CLASS_A]) })

// High School coordinator: the band expands to its classes at resolve time
const highSchoolCoordinator = makeAccess({
  coordinatorClassIds: new Set([CLASS_B, CLASS_C]),
  coordinatorAgeGroupIds: new Set([HIGH_SCHOOL]),
  coordinatorLevels: new Set<SundaySchoolLevel>(['GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12']),
})

const superAdmin = makeAccess({ isAdmin: true, visibleClassIds: 'all' })
const priest = makeAccess({ readOnly: true, visibleClassIds: 'all' })

// A SERVANT_PREP who has not been assigned anything: the bug this model fixes
const unassignedPrepLeader = makeAccess({ canRead: false })

describe('Sunday School access resolution', () => {
  beforeEach(() => {
    prismaMocks.activeYear.mockReset().mockResolvedValue({ id: 'active-year' })
    prismaMocks.participantGrant.mockReset().mockResolvedValue(null)
    prismaMocks.servantAssignments.mockReset().mockResolvedValue([])
    prismaMocks.ageGroups.mockReset().mockResolvedValue([])
    prismaMocks.classes.mockReset().mockResolvedValue([])
    prismaMocks.admins.mockReset().mockResolvedValue([])
  })

  it('lets a tagged servant enter the mode without granting any class scope', async () => {
    prismaMocks.participantGrant.mockResolvedValue({ id: 'active-tag' })

    const access = await getSundaySchoolAccess({
      id: 'mentor-and-servant',
      role: UserRole.MENTOR,
    })

    expect(prismaMocks.participantGrant).toHaveBeenCalledWith({
      where: {
        userId: 'mentor-and-servant',
        tag: RoleTag.SUNDAY_SCHOOL_SERVANT,
        revokedAt: null,
      },
      select: { id: true },
    })
    expect(prismaMocks.servantAssignments).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: 'mentor-and-servant',
        academicYearId: 'active-year',
        endedAt: null,
      },
    }))
    expect(access.canRead).toBe(true)
    expect(access.visibleClassIds).toEqual(new Set())
    expect(canViewClass(access, CLASS_A)).toBe(false)
    expect(canServeClass(access, CLASS_A)).toBe(false)
  })

  it('keeps an untagged and unassigned prep leader out of the mode', async () => {
    const access = await getSundaySchoolAccess({
      id: 'prep-only',
      role: UserRole.SERVANT_PREP,
    })

    expect(access.canRead).toBe(false)
    expect(access.visibleClassIds).toEqual(new Set())
  })

  it('notifies only active age-group coordinators about registrations', async () => {
    prismaMocks.ageGroups.mockResolvedValue([{ id: 'elementary' }])
    await getChildRegistrationReviewerIds('GRADE_2', 'active-year')

    expect(prismaMocks.ageGroups).toHaveBeenCalledWith({
      where: { isActive: true, levels: { has: 'GRADE_2' } },
      select: { id: true },
    })
    expect(prismaMocks.servantAssignments).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        academicYearId: 'active-year',
        authority: 'COORDINATOR',
        ageGroupId: { in: ['elementary'] },
        endedAt: null,
      }),
    }))
  })

  it('expands a legacy age-group assignment into its active classes without a relation join', async () => {
    prismaMocks.servantAssignments.mockResolvedValue([{
      authority: 'COORDINATOR',
      classId: null,
      ageGroupId: 'middle-school',
    }])
    prismaMocks.ageGroups.mockResolvedValue([{
      id: 'middle-school',
      levels: ['GRADE_6', 'GRADE_7', 'GRADE_8'],
    }])
    prismaMocks.classes.mockResolvedValue([{ id: 'sixth-grade' }, { id: 'seventh-grade' }])

    const access = await getSundaySchoolAccess({
      id: 'middle-school-coordinator',
      role: UserRole.SERVANT,
    })

    expect(prismaMocks.ageGroups).toHaveBeenCalledWith({
      where: { id: { in: ['middle-school'] }, isActive: true },
      select: { id: true, levels: true },
    })
    expect(prismaMocks.classes).toHaveBeenCalledWith({
      where: {
        academicYearId: 'active-year',
        level: { in: ['GRADE_6', 'GRADE_7', 'GRADE_8'] },
      },
      select: { id: true },
    })
    expect(access.coordinatorAgeGroupIds).toEqual(new Set(['middle-school']))
    expect(access.coordinatorClassIds).toEqual(new Set(['sixth-grade', 'seventh-grade']))
    expect(access.visibleClassIds).toEqual(new Set(['sixth-grade', 'seventh-grade']))
  })
})

describe('Sunday School access predicates', () => {
  describe('an unassigned prep leader', () => {
    it('has no Sunday School access at all', () => {
      expect(unassignedPrepLeader.canRead).toBe(false)
      expect(canViewClass(unassignedPrepLeader, CLASS_A)).toBe(false)
      expect(canServeClass(unassignedPrepLeader, CLASS_A)).toBe(false)
      expect(canCoordinateClass(unassignedPrepLeader, CLASS_A)).toBe(false)
      expect(canCreateClassAtLevel(unassignedPrepLeader, 'GRADE_2')).toBe(false)
    })
  })

  describe('a servant of one class', () => {
    it('serves that class', () => {
      expect(canViewClass(servantOfA, CLASS_A)).toBe(true)
      expect(canServeClass(servantOfA, CLASS_A)).toBe(true)
    })

    it('can take servant attendance without coordinating the class', () => {
      expect(canCoordinateClass(servantOfA, CLASS_A)).toBe(false)
      expect(canTakeServantAttendance(servantOfA, CLASS_A)).toBe(true)
      expect(canViewServantAttendance(servantOfA, CLASS_A)).toBe(true)
      expect(canViewServantAttendanceReport(servantOfA)).toBe(true)
    })

    it('may edit every lesson and manage lesson owners in that class', () => {
      expect(canEditWeeklyLesson(servantOfA, CLASS_A)).toBe(true)
      expect(canEditWeeklyLesson(servantOfA, CLASS_B)).toBe(false)
      expect(canAssignWeeklyLessonOwner(servantOfA, CLASS_A)).toBe(true)
      expect(canAssignWeeklyLessonOwner(servantOfA, CLASS_B)).toBe(false)
    })

    it('cannot touch another class', () => {
      expect(canViewClass(servantOfA, CLASS_B)).toBe(false)
      expect(canServeClass(servantOfA, CLASS_B)).toBe(false)
      expect(canTakeServantAttendance(servantOfA, CLASS_B)).toBe(false)
      expect(canViewServantAttendance(servantOfA, CLASS_B)).toBe(false)
    })

    it('cannot create or delete classes', () => {
      expect(canCreateClassAtLevel(servantOfA, 'GRADE_2')).toBe(false)
      expect(canDeleteClass(servantOfA, 'GRADE_2')).toBe(false)
    })
  })

  describe('a class coordinator', () => {
    it('serves and coordinates their class', () => {
      expect(canServeClass(classCoordinator, CLASS_A)).toBe(true)
      expect(canCoordinateClass(classCoordinator, CLASS_A)).toBe(true)
      expect(canTakeServantAttendance(classCoordinator, CLASS_A)).toBe(true)
      expect(canViewServantAttendance(classCoordinator, CLASS_A)).toBe(true)
      expect(canViewServantAttendanceReport(classCoordinator)).toBe(true)
      expect(canAssignWeeklyLessonOwner(classCoordinator, CLASS_A)).toBe(true)
      expect(canEditWeeklyLesson(classCoordinator, CLASS_A)).toBe(true)
    })

    it('cannot create or delete classes — that is the band coordinator', () => {
      expect(canCreateClassAtLevel(classCoordinator, 'GRADE_2')).toBe(false)
      expect(canDeleteClass(classCoordinator, 'GRADE_2')).toBe(false)
    })

    it('cannot reach a class they do not coordinate', () => {
      expect(canCoordinateClass(classCoordinator, CLASS_B)).toBe(false)
      expect(canServeClass(classCoordinator, CLASS_B)).toBe(false)
    })
  })

  describe('an age-group coordinator', () => {
    it('coordinates every class in their band', () => {
      expect(canCoordinateClass(highSchoolCoordinator, CLASS_B)).toBe(true)
      expect(canCoordinateClass(highSchoolCoordinator, CLASS_C)).toBe(true)
      expect(canServeClass(highSchoolCoordinator, CLASS_B)).toBe(true)
      expect(canTakeServantAttendance(highSchoolCoordinator, CLASS_B)).toBe(true)
    })

    it('reaches nothing outside their band', () => {
      expect(canCoordinateClass(highSchoolCoordinator, CLASS_A)).toBe(false)
      expect(canServeClass(highSchoolCoordinator, CLASS_A)).toBe(false)
      expect(canViewClass(highSchoolCoordinator, CLASS_A)).toBe(false)
    })

    it('creates and deletes classes at their own levels only', () => {
      expect(canCreateClassAtLevel(highSchoolCoordinator, 'GRADE_11')).toBe(true)
      expect(canDeleteClass(highSchoolCoordinator, 'GRADE_11')).toBe(true)
      expect(canCreateClassAtLevel(highSchoolCoordinator, 'GRADE_2')).toBe(false)
      expect(canDeleteClass(highSchoolCoordinator, 'GRADE_2')).toBe(false)
    })

    it('coordinates their own band and no other', () => {
      expect(canCoordinateAgeGroup(highSchoolCoordinator, HIGH_SCHOOL)).toBe(true)
      expect(canCoordinateAgeGroup(highSchoolCoordinator, 'band-elementary')).toBe(false)
    })
  })

  describe('SUPER_ADMIN', () => {
    it('passes every check for any class', () => {
      expect(canViewClass(superAdmin, 'any-class')).toBe(true)
      expect(canServeClass(superAdmin, 'any-class')).toBe(true)
      expect(canCoordinateClass(superAdmin, 'any-class')).toBe(true)
      expect(canTakeServantAttendance(superAdmin, 'any-class')).toBe(true)
      expect(canViewServantAttendance(superAdmin, 'any-class')).toBe(true)
      expect(canViewServantAttendanceReport(superAdmin)).toBe(true)
      expect(canCreateClassAtLevel(superAdmin, 'PRE_K')).toBe(true)
      expect(canDeleteClass(superAdmin, 'GRADE_12')).toBe(true)
      expect(canCoordinateAgeGroup(superAdmin, 'any-band')).toBe(true)
    })
  })

  describe('PRIEST', () => {
    it('sees everything', () => {
      expect(canViewClass(priest, 'any-class')).toBe(true)
      expect(canViewServantAttendance(priest, 'any-class')).toBe(true)
      expect(canViewServantAttendanceReport(priest)).toBe(true)
    })

    it('writes nothing', () => {
      expect(canServeClass(priest, 'any-class')).toBe(false)
      expect(canCoordinateClass(priest, 'any-class')).toBe(false)
      expect(canTakeServantAttendance(priest, 'any-class')).toBe(false)
      expect(canCreateClassAtLevel(priest, 'GRADE_3')).toBe(false)
      expect(canDeleteClass(priest, 'GRADE_3')).toBe(false)
      expect(canCoordinateAgeGroup(priest, HIGH_SCHOOL)).toBe(false)
      expect(canEditWeeklyLesson(priest, 'any-class')).toBe(false)
    })
  })

  describe('visibleClassFilter', () => {
    it('returns undefined when no filter is needed', () => {
      expect(visibleClassFilter(superAdmin)).toBeUndefined()
      expect(visibleClassFilter(priest)).toBeUndefined()
    })

    it('lists the classes an assigned user may see', () => {
      expect(visibleClassFilter(servantOfA)).toEqual([CLASS_A])
      expect(visibleClassFilter(highSchoolCoordinator)?.sort()).toEqual([CLASS_B, CLASS_C].sort())
    })

    it('is empty for someone with no assignments', () => {
      expect(visibleClassFilter(unassignedPrepLeader)).toEqual([])
    })
  })

  describe('canReviewChildRegistrationAtLevel', () => {
    // A thin alias over canCreateClassAtLevel — placing a child implies the
    // same authority as opening a class at that level.
    it('allows SUPER_ADMIN at any level', () => {
      expect(canReviewChildRegistrationAtLevel(superAdmin, 'PRE_K')).toBe(true)
      expect(canReviewChildRegistrationAtLevel(superAdmin, 'GRADE_12')).toBe(true)
    })

    it('allows the coordinator of the matching band', () => {
      expect(canReviewChildRegistrationAtLevel(highSchoolCoordinator, 'GRADE_11')).toBe(true)
    })

    it('refuses the coordinator for a level outside their band', () => {
      expect(canReviewChildRegistrationAtLevel(highSchoolCoordinator, 'GRADE_2')).toBe(false)
    })

    it('refuses a plain class servant with no coordination authority', () => {
      expect(canReviewChildRegistrationAtLevel(servantOfA, 'GRADE_2')).toBe(false)
    })

    it('refuses PRIEST — read-only', () => {
      expect(canReviewChildRegistrationAtLevel(priest, 'GRADE_3')).toBe(false)
    })
  })
})

describe('age group level ownership', () => {
  const elementary = {
    name: 'Elementary',
    levels: ['PRE_K', 'KINDERGARTEN', 'GRADE_1', 'GRADE_2'] as SundaySchoolLevel[],
  }
  const middle = { name: 'Middle School', levels: ['GRADE_6', 'GRADE_7'] as SundaySchoolLevel[] }

  describe('assertLevelsUnclaimed', () => {
    it('accepts levels no other band owns', () => {
      expect(assertLevelsUnclaimed(['GRADE_9', 'GRADE_10'], [elementary, middle])).toBeNull()
    })

    it('rejects a level another band already owns, and names it', () => {
      const error = assertLevelsUnclaimed(['GRADE_2'], [elementary, middle])
      expect(error).toContain('Elementary')
      expect(error).toContain('2nd Grade')
    })

    it('reports every clashing level', () => {
      const error = assertLevelsUnclaimed(['GRADE_6', 'GRADE_7'], [middle])
      expect(error).toContain('6th Grade')
      expect(error).toContain('7th Grade')
    })

    it('allows a band to keep its own levels when it is excluded from the list', () => {
      expect(assertLevelsUnclaimed(elementary.levels, [middle])).toBeNull()
    })
  })

  describe('findAgeGroupForLevel', () => {
    it('finds the band owning a level', () => {
      expect(findAgeGroupForLevel('GRADE_7', [elementary, middle])?.name).toBe('Middle School')
    })

    it('returns undefined for an unbanded level', () => {
      expect(findAgeGroupForLevel('GRADE_12', [elementary, middle])).toBeUndefined()
    })
  })
})
