import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { canReadContactBook } from '@/lib/contact-book'
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
    return NextResponse.json({ contacts, total: contacts.length }, { headers })
  } catch (error) {
    const response = handleApiError(error)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
}
