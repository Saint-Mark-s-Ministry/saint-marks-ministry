import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "./prisma"
import bcrypt from "bcryptjs"
import { AuditEventResult, RoleTag, SundaySchoolAuthority, UserRole, type PrismaClient } from "@prisma/client"
import type { JWT } from "next-auth/jwt"
import { checkLoginRateLimit, resetLoginRateLimit } from "./rate-limit"
import { seesAllSundaySchoolClasses } from "./roles"
import { recordAuditEvent } from "./audit"
import { normalizeEmail } from "./email"
import { classBelongsToElementaryBand } from "./sunday-school-homework"

async function getUserSessionData(user: { id: string; role: UserRole }) {
  let isAsyncStudent = false
  if (user.role === UserRole.STUDENT) {
    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { studentId: user.id },
      select: { isAsyncStudent: true }
    })
    isAsyncStudent = enrollment?.isAsyncStudent ?? false
  }
  return { isAsyncStudent, sundaySchool: await getSundaySchoolStanding(user) }
}

/**
 * Whether this person has any Sunday School standing, for rendering only —
 * the navbar mode switcher and the page guard are synchronous and cannot wait
 * on a fetch. Deliberately coarse: which classes and what authority is
 * re-derived from the database on every request (lib/sunday-school-access.ts),
 * so a stale token can at worst show or hide a nav entry for up to a minute.
 */
async function getSundaySchoolStanding(user: { id: string; role: UserRole }) {
  if (seesAllSundaySchoolClasses(user.role)) {
    return { hasAccess: true, isCoordinator: user.role === UserRole.SUPER_ADMIN, hasHomeworkAccess: true }
  }

  const [participantGrant, assignments, elementaryBands] = await Promise.all([
    prisma.userRoleAssignment.findFirst({
      where: {
        userId: user.id,
        tag: RoleTag.SUNDAY_SCHOOL_SERVANT,
        revokedAt: null,
      },
      select: { id: true },
    }),
    prisma.sundaySchoolServantAssignment.findMany({
      where: { userId: user.id, academicYear: { isActive: true }, endedAt: null },
      select: { authority: true, classId: true, ageGroupId: true }
    }),
    prisma.sundaySchoolAgeGroup.findMany({
      where: { isElementary: true, isActive: true },
      select: { id: true, sundaySchoolYearId: true, levels: true },
    }),
  ])

  const directClassIds = assignments.flatMap(assignment => assignment.classId ? [assignment.classId] : [])
  const directClasses = directClassIds.length > 0
    ? await prisma.sundaySchoolClass.findMany({
        where: { id: { in: directClassIds } },
        select: { level: true, sundaySchoolYearId: true },
      })
    : []
  const elementaryAgeGroupIds = new Set(elementaryBands.map(group => group.id))
  const hasHomeworkAccess = assignments.some(
    assignment => assignment.ageGroupId && elementaryAgeGroupIds.has(assignment.ageGroupId),
  ) || directClasses.some(cls => classBelongsToElementaryBand(cls, elementaryBands))

  return {
    hasAccess: participantGrant !== null || assignments.length > 0,
    isCoordinator: assignments.some(a => a.authority === SundaySchoolAuthority.COORDINATOR),
    hasHomeworkAccess,
  }
}

// Re-validate token against the current DB state at most once per this window.
// Keeps the blast radius for disabled accounts / role demotions to ~1 minute
// without paying a DB lookup on every authenticated request.
const TOKEN_REVALIDATE_INTERVAL_MS = 60 * 1000
const VIEW_AS_MAX_AGE_MS = 30 * 60 * 1000

async function loadAuthUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      authVersion: true,
      isDisabled: true,
      mustChangePassword: true,
      profileImageUrl: true,
    },
  })
}

async function loadViewAsActor(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      authVersion: true,
      isDisabled: true,
      mustChangePassword: true,
      profileImageUrl: true,
      roleAssignments: {
        where: { tag: RoleTag.SUPER_ADMIN, revokedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  })
}

function canUseViewAs(actor: Awaited<ReturnType<typeof loadViewAsActor>>): actor is NonNullable<typeof actor> {
  return !!actor &&
    !actor.isDisabled &&
    actor.role === UserRole.SUPER_ADMIN &&
    actor.roleAssignments.length > 0
}

async function applyUserToToken(
  token: JWT,
  user: NonNullable<Awaited<ReturnType<typeof loadAuthUser>>>,
  options: { suppressPasswordChange?: boolean } = {}
) {
  const { isAsyncStudent, sundaySchool } = await getUserSessionData(user)
  token.id = user.id
  token.role = user.role
  token.authVersion = user.authVersion
  token.name = user.name
  token.email = user.email
  token.mustChangePassword = options.suppressPasswordChange ? false : user.mustChangePassword
  token.isAsyncStudent = isAsyncStudent
  token.sundaySchool = sundaySchool
  token.profileImageUrl = user.profileImageUrl ?? null
  token.validatedAt = Date.now()
  token.invalidated = undefined
}

async function recordViewAsAudit(input: {
  actorUserId: string | null
  action: 'ADMIN_VIEW_AS_STARTED' | 'ADMIN_VIEW_AS_SWITCHED' | 'ADMIN_VIEW_AS_STOPPED'
  targetUserId?: string | null
  result: AuditEventResult
  reason?: string
  metadata?: Record<string, string | number | boolean | null>
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: 'User',
        entityId: input.targetUserId ?? null,
        result: input.result,
        reason: input.reason,
        metadata: input.metadata,
      },
    })
  } catch (error) {
    // Audit availability must not strand an administrator inside View as mode.
    console.error('Failed to write View as audit event', error)
  }
}

function clearViewAsTokenState(token: JWT) {
  token.originalId = undefined
  token.originalName = undefined
  token.originalEmail = undefined
  token.viewAsExpiresAt = undefined
}

async function restoreViewAsActor(
  token: JWT,
  reason: 'STOPPED_BY_ADMIN' | 'EXPIRED' | 'TARGET_UNAVAILABLE'
) {
  const actorId = token.originalId
  if (!actorId) return false

  const previousTargetId = token.id
  const actor = await loadViewAsActor(actorId)
  if (!canUseViewAs(actor)) {
    token.invalidated = true
    return false
  }

  await applyUserToToken(token, actor)
  clearViewAsTokenState(token)
  await recordViewAsAudit({
    actorUserId: actor.id,
    action: 'ADMIN_VIEW_AS_STOPPED',
    targetUserId: previousTargetId,
    result: AuditEventResult.SUCCESS,
    reason,
  })
  return true
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma as unknown as PrismaClient) as unknown as NextAuthOptions['adapter'],
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Do NOT auto-link Google accounts to existing credentials accounts by
      // matching email - that would let anyone who can change a victim's
      // email address take the account over via "Sign in with Google".
      allowDangerousEmailAccountLinking: false,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials")
        }

        const normalizedEmail = normalizeEmail(credentials.email)

        // Rate limit check
        const rateLimit = checkLoginRateLimit(normalizedEmail)
        if (!rateLimit.allowed) {
          throw new Error(`Too many login attempts. Please try again in ${rateLimit.retryAfterSeconds} seconds.`)
        }

        const user = await prisma.user.findUnique({
          where: {
            email: normalizedEmail
          },
          omit: { password: false }
        })

        if (!user || !user.password) {
          throw new Error("Invalid credentials")
        }

        // Check if user is disabled
        if (user.isDisabled) {
          await recordAuditEvent({
            actorUserId: user.id,
            action: 'AUTH_LOGIN',
            entityType: 'User',
            entityId: user.id,
            result: AuditEventResult.DENIED,
            reason: 'ACCOUNT_DISABLED',
          })
          throw new Error("Invalid credentials")
        }

        const isCorrectPassword = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!isCorrectPassword) {
          await recordAuditEvent({
            actorUserId: user.id,
            action: 'AUTH_LOGIN',
            entityType: 'User',
            entityId: user.id,
            result: AuditEventResult.DENIED,
            reason: 'INVALID_CREDENTIALS',
          })
          throw new Error("Invalid credentials")
        }

        // Successful login - reset rate limit
        resetLoginRateLimit(normalizedEmail)

        const { isAsyncStudent, sundaySchool } = await getUserSessionData(user)

        await recordAuditEvent({
          actorUserId: user.id,
          action: 'AUTH_LOGIN',
          entityType: 'User',
          entityId: user.id,
          result: AuditEventResult.SUCCESS,
          metadata: { provider: 'credentials' },
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          authVersion: user.authVersion,
          mustChangePassword: user.mustChangePassword,
          isAsyncStudent,
          sundaySchool,
          profileImageUrl: user.profileImageUrl,
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      // For Google sign-in, only allow existing users
      if (account?.provider === "google") {
        if (!user.email) return false

        const existingUser = await prisma.user.findUnique({
          where: { email: normalizeEmail(user.email) }
        })

        if (!existingUser || existingUser.isDisabled) {
          if (existingUser) {
            await recordAuditEvent({
              actorUserId: existingUser.id,
              action: 'AUTH_LOGIN',
              entityType: 'User',
              entityId: existingUser.id,
              result: AuditEventResult.DENIED,
              reason: 'ACCOUNT_DISABLED',
              metadata: { provider: 'google' },
            })
          }
          return "/login?error=GoogleSignInFailed"
        }

        await recordAuditEvent({
          actorUserId: existingUser.id,
          action: 'AUTH_LOGIN',
          entityType: 'User',
          entityId: existingUser.id,
          result: AuditEventResult.SUCCESS,
          metadata: { provider: 'google' },
        })

        return true
      }

      return true
    },
    async jwt({ token, user, account, trigger, session }) {
      // Credentials sign-in: user object has all our custom fields
      if (user && account?.provider === "credentials") {
        token.role = user.role
        token.id = user.id
        token.authVersion = user.authVersion
        token.mustChangePassword = user.mustChangePassword
        token.isAsyncStudent = user.isAsyncStudent ?? false
        token.sundaySchool = user.sundaySchool ?? { hasAccess: false, isCoordinator: false, hasHomeworkAccess: false }
        token.profileImageUrl = user.profileImageUrl ?? null
        token.validatedAt = Date.now()
      }

      // Google sign-in: look up user from database
      if (account?.provider === "google" && user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: normalizeEmail(user.email) }
        })

        if (dbUser) {
          const { isAsyncStudent, sundaySchool } = await getUserSessionData(dbUser)
          token.id = dbUser.id
          token.role = dbUser.role
          token.authVersion = dbUser.authVersion
          token.mustChangePassword = dbUser.mustChangePassword
          token.isAsyncStudent = isAsyncStudent
          token.sundaySchool = sundaySchool
          token.profileImageUrl = dbUser.profileImageUrl ?? null
          token.validatedAt = Date.now()
        }
      }

      // Handle session update (e.g., after password change, profile pic, name)
      if (trigger === 'update' && session) {
        if (session.mustChangePassword !== undefined) {
          // Never trust the client to clear the password-change gate. Re-read
          // the current value after the password API has committed it.
          const dbUser = token.id ? await loadAuthUser(token.id) : null
          if (
            !dbUser ||
            dbUser.isDisabled ||
            (token.authVersion !== undefined && token.authVersion !== dbUser.authVersion)
          ) {
            token.invalidated = true
          } else {
            token.mustChangePassword = dbUser.mustChangePassword
            token.validatedAt = Date.now()
          }
        }
        if (session.profileImageUrl !== undefined) {
          token.profileImageUrl = session.profileImageUrl
        }
        if (session.name !== undefined) {
          token.name = session.name
        }

        // Read-only View as mode. The client may request a target, but the
        // acting identity and current SUPER_ADMIN grant are re-derived from
        // the database before the effective session can change.
        if ('impersonate' in (session as Record<string, unknown>)) {
          const impersonateId = (session as { impersonate?: string | null }).impersonate

          if (impersonateId) {
            const actorId = token.originalId ?? token.id
            const [actor, target] = await Promise.all([
              loadViewAsActor(actorId),
              loadAuthUser(impersonateId),
            ])

            if (canUseViewAs(actor) && target && !target.isDisabled && target.id !== actor.id) {
              const previousTargetId = token.originalId ? token.id : null
              if (!token.originalId) {
                token.originalId = actor.id
                token.originalName = actor.name
                token.originalEmail = actor.email
              }
              token.viewAsExpiresAt = Date.now() + VIEW_AS_MAX_AGE_MS
              await applyUserToToken(token, target, { suppressPasswordChange: true })
              await recordViewAsAudit({
                actorUserId: actor.id,
                action: previousTargetId ? 'ADMIN_VIEW_AS_SWITCHED' : 'ADMIN_VIEW_AS_STARTED',
                targetUserId: target.id,
                result: AuditEventResult.SUCCESS,
                metadata: previousTargetId
                  ? { previousTargetUserId: previousTargetId, readOnly: true }
                  : { readOnly: true },
              })
            } else {
              await recordViewAsAudit({
                actorUserId: actor?.id ?? null,
                action: 'ADMIN_VIEW_AS_STARTED',
                targetUserId: target?.id ?? null,
                result: AuditEventResult.DENIED,
                reason: 'Actor is not an active Super Admin, or the target is unavailable',
              })
            }
          } else {
            await restoreViewAsActor(token, 'STOPPED_BY_ADMIN')
          }
        }
      }

      if (
        token.originalId &&
        token.viewAsExpiresAt &&
        Date.now() >= token.viewAsExpiresAt
      ) {
        await restoreViewAsActor(token, 'EXPIRED')
      }

      // Periodically re-check the user against the DB so that disabling an
      // account or changing its role takes effect without waiting for the
      // long-lived JWT to expire. While viewing as another user, validate both
      // the real administrator and the effective target.
      const validatedAt = (token.validatedAt as number | undefined) ?? 0
      if (token.originalId && token.id && Date.now() - validatedAt > TOKEN_REVALIDATE_INTERVAL_MS) {
        const [actor, target] = await Promise.all([
          loadViewAsActor(token.originalId),
          loadAuthUser(token.id),
        ])

        if (!canUseViewAs(actor)) {
          token.invalidated = true
        } else if (!target || target.isDisabled) {
          await restoreViewAsActor(token, 'TARGET_UNAVAILABLE')
        } else {
          await applyUserToToken(token, target, { suppressPasswordChange: true })
        }
      } else if (!token.originalId && token.id && Date.now() - validatedAt > TOKEN_REVALIDATE_INTERVAL_MS) {
        const [dbUser, enrollment] = await Promise.all([
          prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              id: true,
              role: true,
              authVersion: true,
              isDisabled: true,
              mustChangePassword: true,
            }
          }),
          prisma.studentEnrollment.findUnique({
            where: { studentId: token.id as string },
            select: { isAsyncStudent: true }
          }),
        ])

        if (
          !dbUser ||
          dbUser.isDisabled ||
          (token.authVersion !== undefined && token.authVersion !== dbUser.authVersion)
        ) {
          token.invalidated = true
        } else {
          token.role = dbUser.role
          token.authVersion = dbUser.authVersion
          token.mustChangePassword = dbUser.mustChangePassword
          // Pick up async status changes made by a servant without a re-login
          token.isAsyncStudent = dbUser.role === UserRole.STUDENT && !!enrollment?.isAsyncStudent
          token.sundaySchool = await getSundaySchoolStanding(dbUser)
          token.validatedAt = Date.now()
        }
      }

      return token
    },
    async session({ session, token }) {
      // Token was invalidated by the jwt callback (account disabled or deleted).
      // Strip the user so requireAuth() / getCurrentUser() treat it as anonymous.
      if (token.invalidated) {
        return { ...session, user: undefined } as unknown as typeof session
      }

      if (session.user) {
        session.user.role = token.role as UserRole
        session.user.id = token.id as string
        session.user.mustChangePassword = token.mustChangePassword as boolean
        session.user.isAsyncStudent = (token.isAsyncStudent as boolean) ?? false
        session.user.profileImageUrl = (token.profileImageUrl as string | null) ?? null
        session.user.sundaySchool = (token.sundaySchool as { hasAccess: boolean; isCoordinator: boolean; hasHomeworkAccess: boolean } | undefined)
          ?? { hasAccess: false, isCoordinator: false, hasHomeworkAccess: false }
      }
      // Surface View as state without exposing any authority-changing input.
      if (token.originalId) {
        session.impersonating = {
          originalId: token.originalId as string,
          originalName: (token.originalName as string | null) ?? null,
          originalEmail: (token.originalEmail as string | null) ?? null,
          expiresAt: (token.viewAsExpiresAt as number | undefined) ?? Date.now(),
          readOnly: true,
        }
      } else {
        session.impersonating = null
      }
      return session
    }
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 24 * 60 * 60, // 60 days
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
}
