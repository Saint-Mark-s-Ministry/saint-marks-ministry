import { UserRole } from "@prisma/client"
import { DefaultSession } from "next-auth"

/**
 * Coarse Sunday School standing, for rendering only. Which classes and what
 * authority is always re-derived server-side (lib/sunday-school-access.ts).
 */
export interface SundaySchoolStanding {
  hasAccess: boolean
  isCoordinator: boolean
  hasHomeworkAccess: boolean
}

export interface MinistryMembership {
  sundaySchoolServant: boolean
  servantsPrepLeader: boolean
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
      mustChangePassword: boolean
      isAsyncStudent: boolean
      sundaySchool: SundaySchoolStanding
      ministryMembership: MinistryMembership
      profileImageUrl?: string | null
    } & DefaultSession["user"]
    // Read-only View as mode. user.* is the effective identity while this
    // object preserves the real Super Admin actor.
    impersonating?: {
      originalId: string
      originalName: string | null
      originalEmail: string | null
      expiresAt: number
      readOnly: true
    } | null
  }

  interface User {
    role: UserRole
    authVersion: number
    mustChangePassword: boolean
    isAsyncStudent: boolean
    sundaySchool?: SundaySchoolStanding
    ministryMembership?: MinistryMembership
    profileImageUrl?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole
    id: string
    authVersion?: number
    mustChangePassword: boolean
    isAsyncStudent: boolean
    sundaySchool?: SundaySchoolStanding
    ministryMembership?: MinistryMembership
    profileImageUrl?: string | null
    validatedAt?: number
    invalidated?: boolean
    // Read-only View as state
    originalId?: string
    originalName?: string | null
    originalEmail?: string | null
    viewAsExpiresAt?: number
  }
}
