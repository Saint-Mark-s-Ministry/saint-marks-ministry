import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { recordAuditEvent } from '@/lib/audit'
import { normalizeOptionalEmail } from '@/lib/email'
import { getLevelDisplayName } from '@/lib/sunday-school-class'
import { enrollChildInClass } from '@/lib/sunday-school-enrollment'
import { hashRosterLinkToken } from '@/lib/sunday-school-roster-link-token'
import {
  isRosterLinkTokenShaped,
  rosterLinkState,
} from '@/lib/sunday-school-roster-link'
import {
  normalizeRosterBirthDate,
  normalizeRosterGender,
  validateSundaySchoolRosterRow,
} from '@/lib/sunday-school-roster-csv'

/**
 * PUBLIC, UNAUTHENTICATED. Sunday School mode: a family adding their own child
 * to one class's roster with a temporary sign-up link (the QR code a servant
 * hands out).
 *
 * This route is deliberately outside app/api/sunday-school/ so it is obvious at
 * a glance that it has no session behind it. The rules that keep it safe:
 *
 * - The destination is never in the request. Class, Sunday School year, and
 *   grade level are read from the link row, so a caller cannot aim a sign-up at
 *   a class the link was not created for, nor pick their own grade.
 * - The token is matched by SHA-256 against a unique column; the plaintext is
 *   never stored. 256 bits of entropy means no lockout is needed to stop
 *   guessing.
 * - Writes are bounded by the link itself: maxUses, expiresAt, and revokedAt,
 *   claimed atomically so concurrent submissions cannot exceed the cap.
 * - Nothing about the roster is returned. A caller learns the class name and
 *   grade (so they know they scanned the right poster) and nothing else — no
 *   child list, no guardian contact, not even whether their own name matched.
 * - A submission that matches a child already on the roster fills in blanks
 *   only. A public caller can never overwrite detail a servant entered.
 */

const MAX_FIELD_LENGTH = 2000

function readField(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.trim().slice(0, MAX_FIELD_LENGTH) || null
}

async function loadLinkByToken(token: unknown) {
  if (!isRosterLinkTokenShaped(token)) return null

  return prisma.sundaySchoolRosterLink.findUnique({
    where: { tokenHash: hashRosterLinkToken(token) },
    select: {
      id: true,
      classId: true,
      sundaySchoolYearId: true,
      label: true,
      expiresAt: true,
      maxUses: true,
      useCount: true,
      revokedAt: true,
      class: {
        select: { id: true, name: true, level: true, status: true, isActive: true },
      },
    },
  })
}

const UNUSABLE_MESSAGES = {
  REVOKED: 'This sign-up link has been closed. Ask a Sunday School servant for a new one.',
  EXPIRED: 'This sign-up link has expired. Ask a Sunday School servant for a new one.',
  EXHAUSTED: 'This sign-up link has reached its limit. Ask a Sunday School servant for a new one.',
} as const

// GET /api/public/roster-signup?token=...
// Just enough for the form to show which class it will add a child to.
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token')
    const link = await loadLinkByToken(token)

    if (!link) {
      return NextResponse.json({ error: 'This sign-up link is not valid.' }, { status: 404 })
    }

    const state = rosterLinkState(link)
    if (state !== 'ACTIVE') {
      return NextResponse.json({ error: UNUSABLE_MESSAGES[state] }, { status: 410 })
    }

    if (!link.class.isActive || link.class.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'This class is no longer taking sign-ups.' }, { status: 410 })
    }

    return NextResponse.json({
      className: link.class.name,
      levelLabel: getLevelDisplayName(link.class.level),
      label: link.label,
      expiresAt: link.expiresAt,
      remainingUses: link.maxUses - link.useCount,
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/public/roster-signup
// Body: { token, firstName, lastName, gender?, birthDate?, guardianName?, guardianPhone?,
//         guardianEmail?, notes? }
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const link = await loadLinkByToken(body.token)

    if (!link) {
      return NextResponse.json({ error: 'This sign-up link is not valid.' }, { status: 404 })
    }

    const state = rosterLinkState(link)
    if (state !== 'ACTIVE') {
      return NextResponse.json({ error: UNUSABLE_MESSAGES[state] }, { status: 410 })
    }

    if (!link.class.isActive || link.class.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'This class is no longer taking sign-ups.' }, { status: 410 })
    }

    // The same validator the roster CSV import uses, so a hand-typed sign-up and
    // an uploaded row are held to one standard.
    const submission = {
      rowNumber: 1,
      firstName: readField(body.firstName) ?? '',
      lastName: readField(body.lastName) ?? '',
      gender: readField(body.gender) as 'MALE' | 'FEMALE' | null,
      birthDate: readField(body.birthDate),
      guardianName: readField(body.guardianName),
      guardianPhone: readField(body.guardianPhone),
      guardianEmail: normalizeOptionalEmail(body.guardianEmail),
      notes: readField(body.notes),
    }

    const errors = validateSundaySchoolRosterRow(submission)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.map(error => error.message).join('. ') }, { status: 400 })
    }

    const birthDate = normalizeRosterBirthDate(submission.birthDate)
    if (submission.birthDate && !birthDate) {
      return NextResponse.json({ error: 'Birth date must be a real date' }, { status: 400 })
    }
    const parsedBirthDate = birthDate ? new Date(`${birthDate}T00:00:00.000Z`) : null
    const gender = normalizeRosterGender(submission.gender)

    // Scoped to this class on purpose: a name that also exists in another class
    // is a different child as far as this link is concerned, and must not be
    // reachable from a public request.
    const existing = await prisma.sundaySchoolChild.findFirst({
      where: {
        classId: link.classId,
        firstName: { equals: submission.firstName, mode: 'insensitive' },
        lastName: { equals: submission.lastName, mode: 'insensitive' },
        ...(parsedBirthDate ? { OR: [{ birthDate: parsedBirthDate }, { birthDate: null }] } : {}),
      },
      select: {
        id: true,
        birthDate: true,
        gender: true,
        guardianName: true,
        guardianPhone: true,
        guardianEmail: true,
        notes: true,
      },
    })

    const result = await prisma.$transaction(async tx => {
      // Claim one use before writing anything. The where clause re-checks every
      // bound, so two families submitting at once cannot both take the last slot
      // and an expiry that passed mid-request is caught here.
      const claimed = await tx.sundaySchoolRosterLink.updateMany({
        where: {
          id: link.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          useCount: { lt: link.maxUses },
        },
        data: { useCount: { increment: 1 } },
      })
      if (claimed.count === 0) return null

      // Only ever fills blanks. Detail a servant already entered wins over a
      // public submission.
      const childId = existing
        ? (await tx.sundaySchoolChild.update({
            where: { id: existing.id },
            data: {
              status: 'ACTIVE',
              isActive: true,
              ...(existing.birthDate || !parsedBirthDate ? {} : { birthDate: parsedBirthDate }),
              ...(existing.gender || !gender ? {} : { gender }),
              ...(existing.guardianName || !submission.guardianName ? {} : { guardianName: submission.guardianName }),
              ...(existing.guardianPhone || !submission.guardianPhone ? {} : { guardianPhone: submission.guardianPhone }),
              ...(existing.guardianEmail || !submission.guardianEmail ? {} : { guardianEmail: submission.guardianEmail }),
              ...(existing.notes || !submission.notes ? {} : { notes: submission.notes }),
            },
            select: { id: true },
          })).id
        : (await tx.sundaySchoolChild.create({
            data: {
              firstName: submission.firstName,
              lastName: submission.lastName,
              // From the link's class, never from the request.
              level: link.class.level,
              classId: link.classId,
              rosterLinkId: link.id,
              birthDate: parsedBirthDate,
              gender,
              guardianName: submission.guardianName,
              guardianPhone: submission.guardianPhone,
              guardianEmail: submission.guardianEmail,
              notes: submission.notes,
              status: 'ACTIVE',
              isActive: true,
            },
            select: { id: true },
          })).id

      const enrolled = await enrollChildInClass(tx, {
        childId,
        classId: link.classId,
        sundaySchoolYearId: link.sundaySchoolYearId,
        level: link.class.level,
        movedById: null,
        moveReason: 'Self sign-up via roster link',
      })

      return { childId, matched: Boolean(existing), levelMismatch: enrolled === null }
    })

    if (!result) {
      return NextResponse.json({ error: UNUSABLE_MESSAGES.EXHAUSTED }, { status: 410 })
    }

    // An existing enrollment at another grade is a real conflict a servant has
    // to resolve; the roster row is saved either way so the visit is not wasted.
    await recordAuditEvent({
      action: 'SUNDAY_SCHOOL_ROSTER_LINK_SIGNUP',
      entityType: 'SundaySchoolChild',
      entityId: result.childId,
      result: result.levelMismatch ? 'FAILED' : 'SUCCESS',
      reason: result.levelMismatch ? 'Existing enrollment is at a different grade' : undefined,
      metadata: {
        rosterLinkId: link.id,
        classId: link.classId,
        matchedExistingChild: result.matched,
      },
    })

    return NextResponse.json(
      {
        success: true,
        firstName: submission.firstName,
        className: link.class.name,
        needsServantReview: result.levelMismatch,
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
