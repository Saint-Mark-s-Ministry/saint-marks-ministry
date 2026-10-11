import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { canServeClass, getSundaySchoolAccess } from '@/lib/sunday-school-access'
import { recordAuditEvent } from '@/lib/audit'
import { UserRole } from '@prisma/client'
import { createRosterLinkToken, hashRosterLinkToken } from '@/lib/sunday-school-roster-link-token'
import {
  resolveRosterLinkExpiry,
  resolveRosterLinkMaxUses,
  rosterLinkState,
  ROSTER_LINK_MAX_HOURS,
  ROSTER_LINK_MAX_LABEL_LENGTH,
  ROSTER_LINK_MAX_USES,
} from '@/lib/sunday-school-roster-link'

// Sunday School mode: the temporary, class-scoped roster sign-up links whose
// QR codes families scan to add a child themselves.
//
// This is the authenticated side — minting and listing links. The public side a
// family actually uses is app/api/public/roster-signup, which never trusts a
// classId from the request.

const linkSelect = {
  id: true,
  label: true,
  expiresAt: true,
  maxUses: true,
  useCount: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { children: true } },
} as const

type LinkRow = {
  id: string
  label: string | null
  expiresAt: Date
  maxUses: number
  useCount: number
  revokedAt: Date | null
  createdAt: Date
  createdBy: { id: string; name: string }
  _count: { children: number }
}

// The token is deliberately absent: it exists in plaintext only in the response
// to the POST that created it.
function linkResponse(link: LinkRow) {
  return {
    id: link.id,
    label: link.label,
    expiresAt: link.expiresAt,
    maxUses: link.maxUses,
    useCount: link.useCount,
    revokedAt: link.revokedAt,
    createdAt: link.createdAt,
    createdBy: link.createdBy,
    childCount: link._count.children,
    state: rosterLinkState(link),
  }
}

async function loadServableClass(userId: string, role: UserRole, classId: string) {
  const targetClass = await prisma.sundaySchoolClass.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      level: true,
      academicYearId: true,
      sundaySchoolYearId: true,
      status: true,
      isActive: true,
    },
  })
  if (!targetClass || !targetClass.isActive || targetClass.status !== 'ACTIVE') {
    throw new Error('Not found')
  }

  const access = await getSundaySchoolAccess({ id: userId, role }, targetClass.academicYearId)
  if (!canServeClass(access, classId)) {
    throw new Error('Forbidden')
  }

  return targetClass
}

// GET /api/sunday-school/roster-links?classId=...
// The sign-up links for one class, newest first. Servants of the class only.
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const classId = new URL(request.url).searchParams.get('classId')?.trim() ?? ''
    if (!classId) {
      return NextResponse.json({ error: 'Choose a class to view sign-up links' }, { status: 400 })
    }

    await loadServableClass(user.id, user.role, classId)

    const links = await prisma.sundaySchoolRosterLink.findMany({
      where: { classId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: linkSelect,
    })

    return NextResponse.json(links.map(linkResponse))
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/sunday-school/roster-links
// Body: { classId, label?, expiresInHours?, maxUses? }
// Mints one link. The plaintext token is returned exactly once, here — only its
// hash is stored, so it cannot be recovered or re-displayed later.
export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const body = await request.json()

    const classId = typeof body.classId === 'string' ? body.classId.trim() : ''
    if (!classId) {
      return NextResponse.json({ error: 'Choose a class for this sign-up link' }, { status: 400 })
    }

    const targetClass = await loadServableClass(user.id, user.role, classId)

    // Sign-ups create an enrollment and a placement, both of which are keyed by
    // the Sunday School year. A legacy class with no year cannot receive them.
    if (!targetClass.sundaySchoolYearId) {
      return NextResponse.json(
        { error: 'This class is not linked to the current Sunday School year' },
        { status: 409 }
      )
    }

    const expiresAt = resolveRosterLinkExpiry(body.expiresInHours)
    if (!expiresAt) {
      return NextResponse.json(
        { error: `A sign-up link must last between 1 and ${ROSTER_LINK_MAX_HOURS} hours` },
        { status: 400 }
      )
    }

    const maxUses = resolveRosterLinkMaxUses(body.maxUses)
    if (maxUses === null) {
      return NextResponse.json(
        { error: `A sign-up link must allow between 1 and ${ROSTER_LINK_MAX_USES} sign-ups` },
        { status: 400 }
      )
    }

    const label = typeof body.label === 'string'
      ? body.label.trim().slice(0, ROSTER_LINK_MAX_LABEL_LENGTH) || null
      : null

    const token = createRosterLinkToken()
    const link = await prisma.sundaySchoolRosterLink.create({
      data: {
        classId,
        sundaySchoolYearId: targetClass.sundaySchoolYearId,
        tokenHash: hashRosterLinkToken(token),
        label,
        expiresAt,
        maxUses,
        createdById: user.id,
      },
      select: linkSelect,
    })

    await recordAuditEvent({
      actorUserId: user.id,
      action: 'SUNDAY_SCHOOL_ROSTER_LINK_CREATED',
      entityType: 'SundaySchoolRosterLink',
      entityId: link.id,
      result: 'SUCCESS',
      metadata: { classId, className: targetClass.name, maxUses, expiresAt: expiresAt.toISOString() },
    })

    return NextResponse.json({ ...linkResponse(link), token }, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
