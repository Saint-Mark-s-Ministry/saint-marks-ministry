import type { UserRole } from '@prisma/client'

export interface DashboardUser {
  role: UserRole
  sundaySchool?: { hasAccess: boolean } | null
  ministryMembership?: {
    sundaySchoolServant: boolean
    servantsPrepLeader: boolean
  } | null
}

export function defaultDashboardPath(user?: DashboardUser | UserRole | null): string {
  const role = typeof user === 'string' ? user : user?.role
  if (
    typeof user === 'object' && user?.sundaySchool?.hasAccess &&
    user.ministryMembership?.sundaySchoolServant &&
    !user.ministryMembership.servantsPrepLeader &&
    role !== 'SERVANT_PREP' && role !== 'STUDENT' && role !== 'PARENT'
  ) {
    return '/dashboard/servants'
  }

  switch (role) {
    case 'STUDENT':
      return '/dashboard/student'
    case 'MENTOR':
      return '/dashboard/mentor'
    case 'SERVANT':
      return '/dashboard/servants'
    case 'PARENT':
      return '/dashboard/parent'
    case 'SERVANT_PREP':
    case 'PRIEST':
    case 'SUPER_ADMIN':
      return '/dashboard/admin'
    default:
      return '/login'
  }
}
