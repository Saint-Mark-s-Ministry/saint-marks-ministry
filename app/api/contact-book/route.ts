import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { canReadContactBook, CONTACT_BOOK_PAGE_SIZE } from '@/lib/contact-book'
import { prisma } from '@/lib/prisma'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const context = await getAuthorizationContext(user.id)
    if (!canReadContactBook(context)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
    }

    const { searchParams } = new URL(request.url)
    const page = Number(searchParams.get('page') ?? '1')
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger((page - 1) * CONTACT_BOOK_PAGE_SIZE)) {
      return NextResponse.json({ error: 'page must be a positive integer' }, { status: 400, headers })
    }
    const search = searchParams.get('search')?.trim() ?? ''
    const where: Prisma.UserWhereInput = search ? {
      OR: ['name', 'email', 'phone'].map(field => ({ [field]: { contains: search, mode: 'insensitive' } })),
    } : {}

    const [contacts, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, phone: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * CONTACT_BOOK_PAGE_SIZE,
        take: CONTACT_BOOK_PAGE_SIZE,
      }),
      prisma.user.count({ where }),
    ])
    return NextResponse.json({ contacts, total, page, pageSize: CONTACT_BOOK_PAGE_SIZE }, { headers })
  } catch (error) {
    const response = handleApiError(error)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
}
