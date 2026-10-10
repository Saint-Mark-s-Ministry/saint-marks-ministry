import { describe, it, expect } from 'vitest'
import { RoleTag } from '@prisma/client'
import {
  isAdmin,
  isSuperAdmin,
  isPriest,
  isServantPrep,
  isMentor,
  isStudent,
  canManageUsers,
  canManageStudents,
  canManageAllUsers,
  canAccessAdmin,
  canManageData,
  canManageCurriculum,
  canManageExams,
  canManageEnrollments,
  isReadOnlyAdmin,
  canAssignMentors,
  canSelfAssignMentees,
  canBeMentor,
  canViewStudents,
  canManageInviteCodes,
  canReviewRegistrations,
  canViewRegistrations,
  getRoleDisplayName,
  isServant,
  isParent,
  canAdministerSundaySchool,
  seesAllSundaySchoolClasses,
  isSundaySchoolReadOnly,
  canBeAssignedToSundaySchool,
  canServantPrepManageRole,
  canReviewServantApplications,
} from '@/lib/roles'

// Mock UserRole enum since it comes from Prisma
const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  PRIEST: 'PRIEST',
  SERVANT_PREP: 'SERVANT_PREP',
  MENTOR: 'MENTOR',
  STUDENT: 'STUDENT',
  SERVANT: 'SERVANT',
  PARENT: 'PARENT',
} as const

type UserRoleType = (typeof UserRole)[keyof typeof UserRole]

describe('Role Helper Functions', () => {
  describe('isAdmin', () => {
    it('should return true for SUPER_ADMIN', () => {
      expect(isAdmin(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
    })

    it('should return true for PRIEST', () => {
      expect(isAdmin(UserRole.PRIEST as UserRoleType)).toBe(true)
    })

    it('should return true for SERVANT_PREP', () => {
      expect(isAdmin(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for MENTOR', () => {
      expect(isAdmin(UserRole.MENTOR as UserRoleType)).toBe(false)
    })

    it('should return false for STUDENT', () => {
      expect(isAdmin(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('isSuperAdmin', () => {
    it('should return true only for SUPER_ADMIN', () => {
      expect(isSuperAdmin(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(isSuperAdmin(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(isSuperAdmin(UserRole.SERVANT_PREP as UserRoleType)).toBe(false)
      expect(isSuperAdmin(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(isSuperAdmin(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('isPriest', () => {
    it('should return true only for PRIEST', () => {
      expect(isPriest(UserRole.PRIEST as UserRoleType)).toBe(true)
      expect(isPriest(UserRole.SUPER_ADMIN as UserRoleType)).toBe(false)
      expect(isPriest(UserRole.SERVANT_PREP as UserRoleType)).toBe(false)
    })
  })

  describe('isServantPrep', () => {
    it('should return true only for SERVANT_PREP', () => {
      expect(isServantPrep(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
      expect(isServantPrep(UserRole.SUPER_ADMIN as UserRoleType)).toBe(false)
      expect(isServantPrep(UserRole.PRIEST as UserRoleType)).toBe(false)
    })
  })

  describe('isMentor', () => {
    it('should return true only for MENTOR', () => {
      expect(isMentor(UserRole.MENTOR as UserRoleType)).toBe(true)
      expect(isMentor(UserRole.SUPER_ADMIN as UserRoleType)).toBe(false)
      expect(isMentor(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('isStudent', () => {
    it('should return true only for STUDENT', () => {
      expect(isStudent(UserRole.STUDENT as UserRoleType)).toBe(true)
      expect(isStudent(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(isStudent(UserRole.SUPER_ADMIN as UserRoleType)).toBe(false)
    })
  })

  describe('canManageUsers', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP', () => {
      expect(canManageUsers(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canManageUsers(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for PRIEST, MENTOR, and STUDENT', () => {
      expect(canManageUsers(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canManageUsers(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canManageUsers(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canManageStudents', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP', () => {
      expect(canManageStudents(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canManageStudents(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for other roles', () => {
      expect(canManageStudents(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canManageStudents(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canManageStudents(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canManageAllUsers', () => {
    it('should return true only for SUPER_ADMIN', () => {
      expect(canManageAllUsers(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
    })

    it('should return false for all other roles including SERVANT_PREP', () => {
      expect(canManageAllUsers(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canManageAllUsers(UserRole.SERVANT_PREP as UserRoleType)).toBe(false)
      expect(canManageAllUsers(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canManageAllUsers(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canAccessAdmin', () => {
    it('should return true for admin roles', () => {
      expect(canAccessAdmin(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canAccessAdmin(UserRole.PRIEST as UserRoleType)).toBe(true)
      expect(canAccessAdmin(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for non-admin roles', () => {
      expect(canAccessAdmin(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canAccessAdmin(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canManageData', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP (PRIEST is read-only)', () => {
      expect(canManageData(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canManageData(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for PRIEST, MENTOR, and STUDENT', () => {
      expect(canManageData(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canManageData(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canManageData(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canAssignMentors', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP (PRIEST is read-only)', () => {
      expect(canAssignMentors(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canAssignMentors(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for PRIEST, MENTOR, and STUDENT', () => {
      expect(canAssignMentors(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canAssignMentors(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canAssignMentors(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canSelfAssignMentees', () => {
    it('should return true only for MENTOR', () => {
      expect(canSelfAssignMentees(UserRole.MENTOR as UserRoleType)).toBe(true)
    })

    it('should return false for all other roles', () => {
      expect(canSelfAssignMentees(UserRole.SUPER_ADMIN as UserRoleType)).toBe(false)
      expect(canSelfAssignMentees(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canSelfAssignMentees(UserRole.SERVANT_PREP as UserRoleType)).toBe(false)
      expect(canSelfAssignMentees(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canBeMentor', () => {
    it('should return true for SUPER_ADMIN, PRIEST, SERVANT_PREP, and MENTOR', () => {
      expect(canBeMentor(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canBeMentor(UserRole.PRIEST as UserRoleType)).toBe(true)
      expect(canBeMentor(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
      expect(canBeMentor(UserRole.MENTOR as UserRoleType)).toBe(true)
    })

    it('should return false for STUDENT', () => {
      expect(canBeMentor(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canViewStudents', () => {
    it('should return true for SUPER_ADMIN, PRIEST, SERVANT_PREP, and MENTOR', () => {
      expect(canViewStudents(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canViewStudents(UserRole.PRIEST as UserRoleType)).toBe(true)
      expect(canViewStudents(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
      expect(canViewStudents(UserRole.MENTOR as UserRoleType)).toBe(true)
    })

    it('should return false for STUDENT', () => {
      expect(canViewStudents(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('getRoleDisplayName', () => {
    it('should return correct display names for all roles', () => {
      expect(getRoleDisplayName(UserRole.SUPER_ADMIN as UserRoleType)).toBe('Super Admin')
      expect(getRoleDisplayName(UserRole.PRIEST as UserRoleType)).toBe('Priest')
      expect(getRoleDisplayName(UserRole.SERVANT_PREP as UserRoleType)).toBe('Servants Prep Servant')
      expect(getRoleDisplayName(UserRole.MENTOR as UserRoleType)).toBe('Mentor')
      expect(getRoleDisplayName(UserRole.STUDENT as UserRoleType)).toBe('Student')
    })
  })

  describe('canManageCurriculum', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP', () => {
      expect(canManageCurriculum(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canManageCurriculum(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for PRIEST, MENTOR, and STUDENT', () => {
      expect(canManageCurriculum(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canManageCurriculum(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canManageCurriculum(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canManageExams', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP', () => {
      expect(canManageExams(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canManageExams(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for PRIEST, MENTOR, and STUDENT', () => {
      expect(canManageExams(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canManageExams(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canManageExams(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canManageEnrollments', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP', () => {
      expect(canManageEnrollments(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canManageEnrollments(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for PRIEST, MENTOR, and STUDENT', () => {
      expect(canManageEnrollments(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canManageEnrollments(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canManageEnrollments(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('isReadOnlyAdmin', () => {
    it('should return true only for PRIEST', () => {
      expect(isReadOnlyAdmin(UserRole.PRIEST as UserRoleType)).toBe(true)
    })

    it('should return false for all other roles', () => {
      expect(isReadOnlyAdmin(UserRole.SUPER_ADMIN as UserRoleType)).toBe(false)
      expect(isReadOnlyAdmin(UserRole.SERVANT_PREP as UserRoleType)).toBe(false)
      expect(isReadOnlyAdmin(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(isReadOnlyAdmin(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canManageInviteCodes', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP', () => {
      expect(canManageInviteCodes(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canManageInviteCodes(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for PRIEST, MENTOR, and STUDENT', () => {
      expect(canManageInviteCodes(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canManageInviteCodes(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canManageInviteCodes(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canReviewRegistrations', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP', () => {
      expect(canReviewRegistrations(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canReviewRegistrations(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for PRIEST, MENTOR, and STUDENT', () => {
      expect(canReviewRegistrations(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canReviewRegistrations(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canReviewRegistrations(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canViewRegistrations', () => {
    it('should return true for SUPER_ADMIN, SERVANT_PREP, and PRIEST', () => {
      expect(canViewRegistrations(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canViewRegistrations(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
      expect(canViewRegistrations(UserRole.PRIEST as UserRoleType)).toBe(true)
    })

    it('should return false for MENTOR and STUDENT', () => {
      expect(canViewRegistrations(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canViewRegistrations(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })
})

describe('Role Permission Matrix', () => {
  // This tests the overall permission structure to ensure consistency

  it('SUPER_ADMIN should have the most permissions', () => {
    const role = UserRole.SUPER_ADMIN as UserRoleType
    expect(isAdmin(role)).toBe(true)
    expect(canManageUsers(role)).toBe(true)
    expect(canManageAllUsers(role)).toBe(true)
    expect(canManageData(role)).toBe(true)
    expect(canAssignMentors(role)).toBe(true)
    expect(canViewStudents(role)).toBe(true)
    expect(canBeMentor(role)).toBe(true)
  })

  it('PRIEST should have admin view access but be fully read-only', () => {
    const role = UserRole.PRIEST as UserRoleType
    expect(isAdmin(role)).toBe(true)
    expect(canManageUsers(role)).toBe(false)
    expect(canManageAllUsers(role)).toBe(false)
    expect(canManageData(role)).toBe(false) // PRIEST is read-only
    expect(canAssignMentors(role)).toBe(false) // PRIEST is read-only
    expect(canViewStudents(role)).toBe(true)
    expect(canBeMentor(role)).toBe(true)
  })

  it('SERVANT_PREP should be able to manage users but not all users', () => {
    const role = UserRole.SERVANT_PREP as UserRoleType
    expect(isAdmin(role)).toBe(true)
    expect(canManageUsers(role)).toBe(true)
    expect(canManageAllUsers(role)).toBe(false) // Can't manage priests/admins
    expect(canManageData(role)).toBe(true)
    expect(canAssignMentors(role)).toBe(true)
  })

  it('MENTOR should only be able to view students', () => {
    const role = UserRole.MENTOR as UserRoleType
    expect(isAdmin(role)).toBe(false)
    expect(canManageUsers(role)).toBe(false)
    expect(canManageData(role)).toBe(false)
    expect(canViewStudents(role)).toBe(true) // Key permission
    expect(canSelfAssignMentees(role)).toBe(true)
  })

  it('STUDENT should have minimal permissions', () => {
    const role = UserRole.STUDENT as UserRoleType
    expect(isAdmin(role)).toBe(false)
    expect(canManageUsers(role)).toBe(false)
    expect(canManageData(role)).toBe(false)
    expect(canViewStudents(role)).toBe(false)
    expect(canAssignMentors(role)).toBe(false)
    expect(canBeMentor(role)).toBe(false)
  })
})

describe('Sunday School mode permissions', () => {
  // Sunday School authority is not a role — it comes from an assignment,
  // resolved in lib/sunday-school-access.ts and tested there. Only the few
  // genuinely role-derived things live here.

  describe('isServant', () => {
    it('should return true only for SERVANT', () => {
      expect(isServant(UserRole.SERVANT as UserRoleType)).toBe(true)
      expect(isServant(UserRole.STUDENT as UserRoleType)).toBe(false)
      expect(isServant(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(isServant(UserRole.SERVANT_PREP as UserRoleType)).toBe(false)
      expect(isServant(UserRole.SUPER_ADMIN as UserRoleType)).toBe(false)
    })
  })

  describe('canAdministerSundaySchool', () => {
    it('should be SUPER_ADMIN alone', () => {
      expect(canAdministerSundaySchool(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canAdministerSundaySchool(UserRole.SERVANT_PREP as UserRoleType)).toBe(false)
      expect(canAdministerSundaySchool(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canAdministerSundaySchool(UserRole.SERVANT as UserRoleType)).toBe(false)
    })
  })

  describe('seesAllSundaySchoolClasses', () => {
    it('should cover SUPER_ADMIN and PRIEST only', () => {
      expect(seesAllSundaySchoolClasses(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(seesAllSundaySchoolClasses(UserRole.PRIEST as UserRoleType)).toBe(true)
      // A prep servant sees Sunday School only through their own assignments
      expect(seesAllSundaySchoolClasses(UserRole.SERVANT_PREP as UserRoleType)).toBe(false)
      expect(seesAllSundaySchoolClasses(UserRole.SERVANT as UserRoleType)).toBe(false)
    })
  })

  describe('isSundaySchoolReadOnly', () => {
    it('should be PRIEST', () => {
      expect(isSundaySchoolReadOnly(UserRole.PRIEST as UserRoleType)).toBe(true)
      expect(isSundaySchoolReadOnly(UserRole.SUPER_ADMIN as UserRoleType)).toBe(false)
      expect(isSundaySchoolReadOnly(UserRole.SERVANT as UserRoleType)).toBe(false)
    })
  })

  describe('canBeAssignedToSundaySchool', () => {
    it('should allow SERVANT, MENTOR, and SERVANT_PREP', () => {
      expect(canBeAssignedToSundaySchool(UserRole.SERVANT as UserRoleType)).toBe(true)
      expect(canBeAssignedToSundaySchool(UserRole.MENTOR as UserRoleType)).toBe(true)
      // This is what lets one person serve both sides: a prep servant is
      // assignable as an individual, without the role granting anything
      expect(canBeAssignedToSundaySchool(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should allow a tagged SUPER_ADMIN but not an untagged one', () => {
      expect(canBeAssignedToSundaySchool(
        UserRole.SUPER_ADMIN as UserRoleType,
        [RoleTag.SUNDAY_SCHOOL_SERVANT]
      )).toBe(true)
      expect(canBeAssignedToSundaySchool(UserRole.SUPER_ADMIN as UserRoleType)).toBe(false)
    })

    it('should exclude everyone else, including a tagged PRIEST', () => {
      expect(canBeAssignedToSundaySchool(UserRole.STUDENT as UserRoleType)).toBe(false)
      expect(canBeAssignedToSundaySchool(
        UserRole.PRIEST as UserRoleType,
        [RoleTag.SUNDAY_SCHOOL_SERVANT]
      )).toBe(false)
    })
  })

  describe('SERVANT_PREP does not manage servants', () => {
    it('should not be able to create, edit, or delete SERVANT accounts', () => {
      expect(canServantPrepManageRole(UserRole.SERVANT as UserRoleType)).toBe(false)
    })

    it('should still manage students and mentors', () => {
      expect(canServantPrepManageRole(UserRole.STUDENT as UserRoleType)).toBe(true)
      expect(canServantPrepManageRole(UserRole.MENTOR as UserRoleType)).toBe(true)
    })

    it('should never manage priests or admins', () => {
      expect(canServantPrepManageRole(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canServantPrepManageRole(UserRole.SUPER_ADMIN as UserRoleType)).toBe(false)
      expect(canServantPrepManageRole(UserRole.SERVANT_PREP as UserRoleType)).toBe(false)
    })
  })

  // The important isolation guarantee: the Sunday School role must not leak
  // into any Servants Prep permission.
  describe('SERVANT isolation from the prep program', () => {
    const role = UserRole.SERVANT as UserRoleType

    it('should have no prep-side permissions at all', () => {
      expect(isAdmin(role)).toBe(false)
      expect(isSuperAdmin(role)).toBe(false)
      expect(isPriest(role)).toBe(false)
      expect(isServantPrep(role)).toBe(false)
      expect(isMentor(role)).toBe(false)
      expect(isStudent(role)).toBe(false)
      expect(canAccessAdmin(role)).toBe(false)
      expect(canManageUsers(role)).toBe(false)
      expect(canManageStudents(role)).toBe(false)
      expect(canManageAllUsers(role)).toBe(false)
      expect(canManageData(role)).toBe(false)
      expect(canManageCurriculum(role)).toBe(false)
      expect(canManageExams(role)).toBe(false)
      expect(canManageEnrollments(role)).toBe(false)
      expect(isReadOnlyAdmin(role)).toBe(false)
      expect(canAssignMentors(role)).toBe(false)
      expect(canSelfAssignMentees(role)).toBe(false)
      expect(canBeMentor(role)).toBe(false)
      expect(canViewStudents(role)).toBe(false)
      expect(canManageInviteCodes(role)).toBe(false)
      expect(canReviewRegistrations(role)).toBe(false)
      expect(canViewRegistrations(role)).toBe(false)
    })

    it('should have a display name', () => {
      expect(getRoleDisplayName(role)).toBe('Sunday School Servant')
    })
  })

  describe('isParent', () => {
    it('should return true only for PARENT', () => {
      expect(isParent(UserRole.PARENT as UserRoleType)).toBe(true)
      expect(isParent(UserRole.STUDENT as UserRoleType)).toBe(false)
      expect(isParent(UserRole.SERVANT as UserRoleType)).toBe(false)
      expect(isParent(UserRole.SERVANT_PREP as UserRoleType)).toBe(false)
      expect(isParent(UserRole.SUPER_ADMIN as UserRoleType)).toBe(false)
    })
  })

  describe('canReviewServantApplications', () => {
    it('should be SUPER_ADMIN alone', () => {
      expect(canReviewServantApplications(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
    })

    it('should exclude SERVANT_PREP — servant accounts are never SERVANT_PREP-created', () => {
      expect(canReviewServantApplications(UserRole.SERVANT_PREP as UserRoleType)).toBe(false)
    })

    it('should exclude every other role', () => {
      expect(canReviewServantApplications(UserRole.PRIEST as UserRoleType)).toBe(false)
      expect(canReviewServantApplications(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canReviewServantApplications(UserRole.STUDENT as UserRoleType)).toBe(false)
      expect(canReviewServantApplications(UserRole.SERVANT as UserRoleType)).toBe(false)
      expect(canReviewServantApplications(UserRole.PARENT as UserRoleType)).toBe(false)
    })
  })

  // A parent has no authority over anyone else's data — only their own linked
  // children. Must not leak into any prep-side or Sunday-School-authority
  // permission.
  describe('PARENT isolation from every other permission', () => {
    const role = UserRole.PARENT as UserRoleType

    it('should have no prep-side permissions at all', () => {
      expect(isAdmin(role)).toBe(false)
      expect(isSuperAdmin(role)).toBe(false)
      expect(isPriest(role)).toBe(false)
      expect(isServantPrep(role)).toBe(false)
      expect(isMentor(role)).toBe(false)
      expect(isStudent(role)).toBe(false)
      expect(isServant(role)).toBe(false)
      expect(canAccessAdmin(role)).toBe(false)
      expect(canManageUsers(role)).toBe(false)
      expect(canManageStudents(role)).toBe(false)
      expect(canManageAllUsers(role)).toBe(false)
      expect(canManageData(role)).toBe(false)
      expect(canManageCurriculum(role)).toBe(false)
      expect(canManageExams(role)).toBe(false)
      expect(canManageEnrollments(role)).toBe(false)
      expect(isReadOnlyAdmin(role)).toBe(false)
      expect(canAssignMentors(role)).toBe(false)
      expect(canSelfAssignMentees(role)).toBe(false)
      expect(canBeMentor(role)).toBe(false)
      expect(canViewStudents(role)).toBe(false)
      expect(canManageInviteCodes(role)).toBe(false)
      expect(canReviewRegistrations(role)).toBe(false)
      expect(canViewRegistrations(role)).toBe(false)
      expect(canReviewServantApplications(role)).toBe(false)
    })

    it('should have no Sunday School authority at all', () => {
      expect(canAdministerSundaySchool(role)).toBe(false)
      expect(seesAllSundaySchoolClasses(role)).toBe(false)
      expect(isSundaySchoolReadOnly(role)).toBe(false)
      expect(canBeAssignedToSundaySchool(role)).toBe(false)
    })

    it('should have a display name', () => {
      expect(getRoleDisplayName(role)).toBe('Parent')
    })
  })
})
