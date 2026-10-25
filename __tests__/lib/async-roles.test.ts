import { describe, it, expect } from 'vitest'
import {
  canManageSundaySchool,
  canManageSundaySchoolAttendance,
  canSetAsyncStatus,
} from '@/lib/roles'

const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  PRIEST: 'PRIEST',
  SERVANT_PREP: 'SERVANT_PREP',
  MENTOR: 'MENTOR',
  STUDENT: 'STUDENT',
} as const

type UserRoleType = (typeof UserRole)[keyof typeof UserRole]

describe('Async Student Permission Helpers', () => {
  describe('canManageSundaySchool', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP', () => {
      expect(canManageSundaySchool(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canManageSundaySchool(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('allows priests while denying mentors and students', () => {
      expect(canManageSundaySchool(UserRole.PRIEST as UserRoleType)).toBe(true)
      expect(canManageSundaySchool(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canManageSundaySchool(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canManageSundaySchoolAttendance', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP', () => {
      expect(canManageSundaySchoolAttendance(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canManageSundaySchoolAttendance(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('should return false for other roles', () => {
      expect(canManageSundaySchoolAttendance(UserRole.PRIEST as UserRoleType)).toBe(true)
      expect(canManageSundaySchoolAttendance(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canManageSundaySchoolAttendance(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })

  describe('canSetAsyncStatus', () => {
    it('should return true for SUPER_ADMIN and SERVANT_PREP', () => {
      expect(canSetAsyncStatus(UserRole.SUPER_ADMIN as UserRoleType)).toBe(true)
      expect(canSetAsyncStatus(UserRole.SERVANT_PREP as UserRoleType)).toBe(true)
    })

    it('allows priests while denying mentors and students', () => {
      expect(canSetAsyncStatus(UserRole.PRIEST as UserRoleType)).toBe(true)
      expect(canSetAsyncStatus(UserRole.MENTOR as UserRoleType)).toBe(false)
      expect(canSetAsyncStatus(UserRole.STUDENT as UserRoleType)).toBe(false)
    })
  })
})
