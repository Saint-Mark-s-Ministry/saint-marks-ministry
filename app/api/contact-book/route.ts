import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { canReadContactBook } from '@/lib/contact-book'
import { getContactBookRoles } from '@/lib/contact-book-roles'
import { prisma } from '@/lib/prisma'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  try {
    const user = await requireAuth()
    const context = await getAuthorizationContext(user.id)
    if (!canReadContactBook(context)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
    }

    const contacts = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, phone: true, profileImageUrl: true, role: true,
        roleAssignments: {
          where: { revokedAt: null },
          select: { tag: true },
          orderBy: { grantedAt: 'asc' },
        },
        mentorAssignments: {
          where: { endedAt: null, studentEnrollment: { status: 'ACTIVE' } },
          select: { id: true },
          take: 1,
        },
        sundaySchoolServing: {
          where: { academicYear: { isActive: true }, endedAt: null },
          select: {
            id: true, authority: true, classId: true, ageGroupId: true,
            class: { select: { id: true, name: true, level: true } },
            ageGroup: { select: { id: true, name: true, levels: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
    const entries = contacts.map(({ role, roleAssignments, mentorAssignments, ...contact }) => ({
      ...contact,
      roles: getContactBookRoles({ role, roleAssignments, mentorAssignments, sundaySchoolServing: contact.sundaySchoolServing }),
    }))
    return NextResponse.json({ contacts: entries, total: entries.length }, { headers })
  } catch (error) {
    const response = handleApiError(error)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
}
