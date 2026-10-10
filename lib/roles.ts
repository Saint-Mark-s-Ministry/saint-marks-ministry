import { RoleTag, UserRole } from "@prisma/client"

// Role hierarchy and permissions

export const isAdmin = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.PRIEST || role === UserRole.SERVANT_PREP
}

export const isSuperAdmin = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN
}

export const isPriest = (role: UserRole) => {
  return role === UserRole.PRIEST
}

export const isServantPrep = (role: UserRole) => {
  return role === UserRole.SERVANT_PREP
}

export const isMentor = (role: UserRole) => {
  return role === UserRole.MENTOR
}

export const isStudent = (role: UserRole) => {
  return role === UserRole.STUDENT
}

// Sunday School servant (serves in the Sunday School class, not a prep student)
export const isServant = (role: UserRole) => {
  return role === UserRole.SERVANT
}

// A child's guardian, self-registered. No authority over anyone else's data —
// only their own linked children (SundaySchoolChildGuardian).
export const isParent = (role: UserRole) => {
  return role === UserRole.PARENT
}

// Can manage users (create, edit, delete)
export const canManageUsers = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// The roles a SERVANT_PREP servant may create, edit, or delete.
// SUPER_ADMIN is unrestricted; everyone else manages nobody.
// Deliberately excludes SERVANT: running the prep program confers no authority
// over Sunday School. Servant accounts are created by SUPER_ADMIN, and Sunday
// School authority comes from an assignment (lib/sunday-school-access.ts).
export const SERVANT_PREP_MANAGEABLE_ROLES: UserRole[] = [
  UserRole.STUDENT,
  UserRole.MENTOR,
]

export const canServantPrepManageRole = (targetRole: UserRole) => {
  return SERVANT_PREP_MANAGEABLE_ROLES.includes(targetRole)
}

// Can manage only students (SERVANT_PREP limitation)
export const canManageStudents = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can manage all user types (only SUPER_ADMIN)
export const canManageAllUsers = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN
}

// Can access admin dashboard (view-only for PRIEST)
export const canAccessAdmin = (role: UserRole) => {
  return isAdmin(role)
}

// Can take attendance and enter scores (PRIEST is read-only)
export const canManageData = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can create/edit curriculum and lessons (PRIEST is read-only)
export const canManageCurriculum = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can create/edit exams and scores (PRIEST is read-only)
export const canManageExams = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can create/edit enrollments (PRIEST is read-only)
export const canManageEnrollments = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Has read-only admin access (PRIEST)
export const isReadOnlyAdmin = (role: UserRole) => {
  return role === UserRole.PRIEST
}

// Can assign mentors to students (PRIEST is read-only)
export const canAssignMentors = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can self-assign mentees (mentors)
export const canSelfAssignMentees = (role: UserRole) => {
  return role === UserRole.MENTOR
}

// Can be assigned as a mentor (have mentees). Priests remain read-only in the
// application; this only allows an enrollment to name them as its mentor.
export const MENTOR_ELIGIBLE_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.PRIEST,
  UserRole.SERVANT_PREP,
  UserRole.MENTOR,
]

export const canBeMentor = (role: UserRole) => {
  return MENTOR_ELIGIBLE_ROLES.includes(role)
}

// Can view students (admins and mentors)
export const canViewStudents = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.PRIEST || role === UserRole.SERVANT_PREP || role === UserRole.MENTOR
}

// Can generate/manage Sunday School codes and manage assignments
export const canManageSundaySchool = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can excuse/manually approve/reject Sunday School attendance
export const canManageSundaySchoolAttendance = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can set async student status on enrollments
export const canSetAsyncStatus = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can manage invite codes (generate, edit, revoke)
export const canManageInviteCodes = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can review registration submissions (approve/reject)
export const canReviewRegistrations = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP
}

// Can view registration submissions (read-only access)
export const canViewRegistrations = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.SERVANT_PREP || role === UserRole.PRIEST
}

// Can review servant sign-up applications (approve/reject). SUPER_ADMIN
// only — same reasoning as SERVANT_PREP_MANAGEABLE_ROLES excluding SERVANT:
// prep service confers no authority to create Sunday School servant
// accounts.
export const canReviewServantApplications = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN
}

// ============================================
// SUNDAY SCHOOL MODE PERMISSIONS
//
// Sunday School authority is NOT conferred by a role. It comes from an
// assignment naming a scope — one class, or one age group (Elementary, Middle,
// High) — resolved in lib/sunday-school-access.ts. That is what lets one
// person wear two hats: a SERVANT_PREP who also serves gets in because they
// are assigned to a class, not because of their prep title.
//
// Only the handful of things below are genuinely role-derived.
// ============================================

// Full authority over every class, plus age groups and servant accounts
export const canAdministerSundaySchool = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN
}

// Sees every class without needing an assignment (PRIEST is read-only)
export const seesAllSundaySchoolClasses = (role: UserRole) => {
  return role === UserRole.SUPER_ADMIN || role === UserRole.PRIEST
}

// Has Sunday School visibility but every write is refused
export const isSundaySchoolReadOnly = (role: UserRole) => {
  return role === UserRole.PRIEST
}

// The legacy roles that may be given a Sunday School assignment without an
// existing Sunday School tag. MENTOR and SERVANT_PREP are here because someone
// can serve in both programs — as an individual, by assignment, not by virtue
// of their primary account role.
export const SUNDAY_SCHOOL_ASSIGNABLE_ROLES: UserRole[] = [
  UserRole.SERVANT,
  UserRole.MENTOR,
  UserRole.SERVANT_PREP,
]

export const canBeAssignedToSundaySchool = (
  role: UserRole,
  roleTags: Iterable<RoleTag> = []
) => {
  if (SUNDAY_SCHOOL_ASSIGNABLE_ROLES.includes(role)) return true

  // A super admin may also personally serve in a class, but only when their
  // multi-role identity explicitly includes Sunday School service. Priests
  // remain read-only even if they carry the participation tag.
  return role === UserRole.SUPER_ADMIN &&
    new Set(roleTags).has(RoleTag.SUNDAY_SCHOOL_SERVANT)
}

// Display names for roles
export const getRoleDisplayName = (role: UserRole): string => {
  const displayNames: Record<UserRole, string> = {
    SUPER_ADMIN: 'Super Admin',
    PRIEST: 'Priest',
    SERVANT_PREP: 'Servants Prep Servant',
    MENTOR: 'Mentor',
    STUDENT: 'Student',
    SERVANT: 'Sunday School Servant',
    PARENT: 'Parent'
  }
  return displayNames[role]
}
