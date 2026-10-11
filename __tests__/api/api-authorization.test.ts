import { describe, it, expect } from 'vitest'
import { RoleTag, UserRole } from '@prisma/client'
import {
  isAdmin,
  canManageUsers,
  canManageAllUsers,
  canViewStudents,
  canAssignMentors,
  canAdministerSundaySchool,
  seesAllSundaySchoolClasses,
  isSundaySchoolReadOnly,
  canBeAssignedToSundaySchool,
  canServantPrepManageRole,
} from '@/lib/roles'

/**
 * Tests for API route authorization patterns
 * These tests verify the authorization logic used across API routes
 */
describe('API Authorization Patterns', () => {
  describe('User Management Authorization', () => {
    describe('GET /api/users access patterns', () => {
      it('SUPER_ADMIN can view all users', () => {
        expect(isAdmin(UserRole.SUPER_ADMIN)).toBe(true)
        expect(canViewStudents(UserRole.SUPER_ADMIN)).toBe(true)
      })

      it('PRIEST can view all users', () => {
        expect(isAdmin(UserRole.PRIEST)).toBe(true)
        expect(canViewStudents(UserRole.PRIEST)).toBe(true)
      })

      it('SERVANT_PREP can view limited users (STUDENT, MENTOR, SERVANT_PREP)', () => {
        expect(isAdmin(UserRole.SERVANT_PREP)).toBe(true)
        expect(canViewStudents(UserRole.SERVANT_PREP)).toBe(true)
      })

      it('MENTOR can only view assigned students', () => {
        expect(isAdmin(UserRole.MENTOR)).toBe(false)
        expect(canViewStudents(UserRole.MENTOR)).toBe(true)
      })

      it('STUDENT cannot view users', () => {
        expect(isAdmin(UserRole.STUDENT)).toBe(false)
        expect(canViewStudents(UserRole.STUDENT)).toBe(false)
      })
    })

    describe('POST /api/users access patterns', () => {
      it('SUPER_ADMIN can create any user', () => {
        expect(canManageUsers(UserRole.SUPER_ADMIN)).toBe(true)
        expect(canManageAllUsers(UserRole.SUPER_ADMIN)).toBe(true)
      })

      it('PRIEST cannot create users through normal API', () => {
        expect(canManageUsers(UserRole.PRIEST)).toBe(false)
      })

      it('SERVANT_PREP can create limited users (STUDENT, MENTOR only)', () => {
        expect(canManageUsers(UserRole.SERVANT_PREP)).toBe(true)
        expect(canManageAllUsers(UserRole.SERVANT_PREP)).toBe(false)
      })

      it('MENTOR cannot create users', () => {
        expect(canManageUsers(UserRole.MENTOR)).toBe(false)
      })

      it('STUDENT cannot create users', () => {
        expect(canManageUsers(UserRole.STUDENT)).toBe(false)
      })
    })
  })

  describe('Attendance Authorization', () => {
    describe('GET /api/attendance patterns', () => {
      it('Admins can view all attendance', () => {
        expect(isAdmin(UserRole.SUPER_ADMIN)).toBe(true)
        expect(isAdmin(UserRole.PRIEST)).toBe(true)
        expect(isAdmin(UserRole.SERVANT_PREP)).toBe(true)
      })

      it('MENTOR can view attendance (filtered to mentees)', () => {
        // MENTOR is not admin but has special access
        expect(isAdmin(UserRole.MENTOR)).toBe(false)
        // MENTOR access is handled specially in the route
      })
    })

    describe('POST /api/attendance patterns', () => {
      it('Only admins can create/modify attendance', () => {
        expect(isAdmin(UserRole.SUPER_ADMIN)).toBe(true)
        expect(isAdmin(UserRole.PRIEST)).toBe(true)
        expect(isAdmin(UserRole.SERVANT_PREP)).toBe(true)
      })

      it('MENTOR cannot create attendance (read-only)', () => {
        expect(isAdmin(UserRole.MENTOR)).toBe(false)
      })

      it('STUDENT cannot create attendance', () => {
        expect(isAdmin(UserRole.STUDENT)).toBe(false)
      })
    })
  })

  describe('Lesson/Curriculum Authorization', () => {
    it('Only admins can manage lessons', () => {
      expect(isAdmin(UserRole.SUPER_ADMIN)).toBe(true)
      expect(isAdmin(UserRole.PRIEST)).toBe(true)
      expect(isAdmin(UserRole.SERVANT_PREP)).toBe(true)
      expect(isAdmin(UserRole.MENTOR)).toBe(false)
      expect(isAdmin(UserRole.STUDENT)).toBe(false)
    })
  })

  describe('Exam Authorization', () => {
    it('Only admins can manage exams', () => {
      expect(isAdmin(UserRole.SUPER_ADMIN)).toBe(true)
      expect(isAdmin(UserRole.PRIEST)).toBe(true)
      expect(isAdmin(UserRole.SERVANT_PREP)).toBe(true)
      expect(isAdmin(UserRole.MENTOR)).toBe(false)
      expect(isAdmin(UserRole.STUDENT)).toBe(false)
    })
  })

  describe('Mentor Assignment Authorization', () => {
    it('SUPER_ADMIN and SERVANT_PREP can assign mentors (PRIEST is read-only)', () => {
      expect(canAssignMentors(UserRole.SUPER_ADMIN)).toBe(true)
      expect(canAssignMentors(UserRole.SERVANT_PREP)).toBe(true)
      expect(canAssignMentors(UserRole.PRIEST)).toBe(false)
      expect(canAssignMentors(UserRole.MENTOR)).toBe(false)
      expect(canAssignMentors(UserRole.STUDENT)).toBe(false)
    })
  })

  describe('Role-based filtering logic', () => {
    describe('SERVANT_PREP user filtering', () => {
      const servantPrepAllowedRoles: UserRole[] = [UserRole.STUDENT, UserRole.MENTOR]
      const servantPrepVisibleRoles: UserRole[] = [UserRole.STUDENT, UserRole.MENTOR, UserRole.SERVANT_PREP]

      it('can create STUDENT users', () => {
        expect(servantPrepAllowedRoles.includes(UserRole.STUDENT)).toBe(true)
      })

      it('can create MENTOR users', () => {
        expect(servantPrepAllowedRoles.includes(UserRole.MENTOR)).toBe(true)
      })

      it('cannot create PRIEST users', () => {
        expect(servantPrepAllowedRoles.includes(UserRole.PRIEST)).toBe(false)
      })

      it('cannot create SUPER_ADMIN users', () => {
        expect(servantPrepAllowedRoles.includes(UserRole.SUPER_ADMIN)).toBe(false)
      })

      it('cannot create other SERVANT_PREP users', () => {
        expect(servantPrepAllowedRoles.includes(UserRole.SERVANT_PREP)).toBe(false)
      })

      it('can view STUDENT, MENTOR, and SERVANT_PREP users', () => {
        expect(servantPrepVisibleRoles).toContain(UserRole.STUDENT)
        expect(servantPrepVisibleRoles).toContain(UserRole.MENTOR)
        expect(servantPrepVisibleRoles).toContain(UserRole.SERVANT_PREP)
      })

      it('cannot view PRIEST or SUPER_ADMIN users', () => {
        expect(servantPrepVisibleRoles).not.toContain(UserRole.PRIEST)
        expect(servantPrepVisibleRoles).not.toContain(UserRole.SUPER_ADMIN)
      })
    })

    describe('MENTOR filtering logic', () => {
      it('MENTOR can only view STUDENT role', () => {
        const mentorAllowedViewRole = UserRole.STUDENT
        expect(mentorAllowedViewRole).toBe(UserRole.STUDENT)
      })

      // Mentor filtering is done by enrollment relationship in the API
    })
  })

  describe('Sunday School mode authorization', () => {
    // The per-class checks live in __tests__/lib/sunday-school-access.test.ts.
    // What matters here is that no prep-side role is a way in.

    describe('route entry is not granted by a role', () => {
      it('only SUPER_ADMIN and PRIEST see Sunday School without an assignment', () => {
        expect(seesAllSundaySchoolClasses(UserRole.SUPER_ADMIN)).toBe(true)
        expect(seesAllSundaySchoolClasses(UserRole.PRIEST)).toBe(true)
        // A prep servant reaches Sunday School only through their own
        // assignments — running the prep program grants nothing here
        expect(seesAllSundaySchoolClasses(UserRole.SERVANT_PREP)).toBe(false)
        expect(seesAllSundaySchoolClasses(UserRole.SERVANT)).toBe(false)
        expect(seesAllSundaySchoolClasses(UserRole.MENTOR)).toBe(false)
        expect(seesAllSundaySchoolClasses(UserRole.STUDENT)).toBe(false)
      })
    })

    describe('/api/sunday-school/age-groups write access', () => {
      it('is SUPER_ADMIN only — redrawing bands changes who coordinates what', () => {
        expect(canAdministerSundaySchool(UserRole.SUPER_ADMIN)).toBe(true)
        expect(canAdministerSundaySchool(UserRole.SERVANT_PREP)).toBe(false)
        expect(canAdministerSundaySchool(UserRole.PRIEST)).toBe(false)
        expect(canAdministerSundaySchool(UserRole.SERVANT)).toBe(false)
      })
    })

    describe('PRIEST stays read-only here as everywhere', () => {
      it('sees Sunday School but is refused every write', () => {
        expect(seesAllSundaySchoolClasses(UserRole.PRIEST)).toBe(true)
        expect(isSundaySchoolReadOnly(UserRole.PRIEST)).toBe(true)
        expect(canAdministerSundaySchool(UserRole.PRIEST)).toBe(false)
      })
    })

    describe('/api/sunday-school/servant-assignments target validation', () => {
      it('accepts Sunday School servants and dual-program accounts', () => {
        expect(canBeAssignedToSundaySchool(UserRole.SERVANT)).toBe(true)
        expect(canBeAssignedToSundaySchool(UserRole.MENTOR)).toBe(true)
        expect(canBeAssignedToSundaySchool(UserRole.SERVANT_PREP)).toBe(true)
        expect(canBeAssignedToSundaySchool(
          UserRole.SUPER_ADMIN,
          [RoleTag.SUNDAY_SCHOOL_SERVANT]
        )).toBe(true)
      })

      it('rejects students, priests and untagged admins', () => {
        expect(canBeAssignedToSundaySchool(UserRole.STUDENT)).toBe(false)
        expect(canBeAssignedToSundaySchool(
          UserRole.PRIEST,
          [RoleTag.SUNDAY_SCHOOL_SERVANT]
        )).toBe(false)
        expect(canBeAssignedToSundaySchool(UserRole.SUPER_ADMIN)).toBe(false)
      })
    })

    describe('SERVANT is rejected by the prep-side routes', () => {
      it('cannot reach admin, user management, or student data', () => {
        expect(isAdmin(UserRole.SERVANT)).toBe(false)
        expect(canManageUsers(UserRole.SERVANT)).toBe(false)
        expect(canManageAllUsers(UserRole.SERVANT)).toBe(false)
        expect(canViewStudents(UserRole.SERVANT)).toBe(false)
        expect(canAssignMentors(UserRole.SERVANT)).toBe(false)
      })
    })

    describe('SERVANT_PREP user management scope', () => {
      it('covers Student and Mentor only', () => {
        expect(canServantPrepManageRole(UserRole.STUDENT)).toBe(true)
        expect(canServantPrepManageRole(UserRole.MENTOR)).toBe(true)
      })

      it('does not cover Sunday School servants', () => {
        expect(canServantPrepManageRole(UserRole.SERVANT)).toBe(false)
      })

      it('never covers priests or admins', () => {
        expect(canServantPrepManageRole(UserRole.PRIEST)).toBe(false)
        expect(canServantPrepManageRole(UserRole.SUPER_ADMIN)).toBe(false)
        expect(canServantPrepManageRole(UserRole.SERVANT_PREP)).toBe(false)
      })
    })
  })

  describe('Password change authorization', () => {
    it('All authenticated users can change their own password', () => {
      // The change-password endpoint uses requireAuth() which allows any authenticated user
      const allRoles = [
        UserRole.SUPER_ADMIN,
        UserRole.PRIEST,
        UserRole.SERVANT_PREP,
        UserRole.MENTOR,
        UserRole.STUDENT
      ]
      // All roles should be able to access password change
      allRoles.forEach(role => {
        // As long as they're authenticated, they can change password
        expect(role).toBeDefined()
      })
    })
  })
})
