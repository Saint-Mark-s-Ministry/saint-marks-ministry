import type { Prisma } from '@prisma/client'

// This is display information only. Sunday School access still comes from
// assignments, and linking a Prep login does not grant a servant assignment.
export const sundaySchoolChildAccountSelect = {
  id: true,
  name: true,
  email: true,
  profileImageUrl: true,
  isDisabled: true,
  enrollments: {
    where: { isActive: true, status: 'ACTIVE' },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.UserSelect

type ChildAccount = Prisma.UserGetPayload<{ select: typeof sundaySchoolChildAccountSelect }>

export function withServantsPrepStudentStatus<T extends { user: ChildAccount | null }>(child: T) {
  const { user, ...record } = child
  return {
    ...record,
    isServantsPrepStudent: Boolean(user && !user.isDisabled && user.enrollments.length > 0),
    // Keep enrollment IDs and account state out of the Sunday School response.
    user: user ? {
      id: user.id,
      name: user.name,
      email: user.email,
      profileImageUrl: user.profileImageUrl,
    } : null,
  }
}
