import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAuditEvent } from '@/lib/audit'
import { checkRateLimit } from '@/lib/rate-limit'
import { normalizeFamilyPhone } from '@/lib/sunday-school-family-matching'
import { ROSTER_CONTACT_LINK_HOURS } from '@/lib/sunday-school-roster-link'
import { normalizeRosterBirthDate } from '@/lib/sunday-school-roster-csv'

// PUBLIC write-only contact collection. The link row, never body fields,
// supplies the class and purpose. No lookup results leave this function.
type ContactLink = { id: string; classId: string }
const WINDOW_MS = 15 * 60 * 1000
const ACKNOWLEDGEMENT = { success: true }

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function submitRosterContactUpdate(
  request: Request,
  link: ContactLink,
  body: Record<string, unknown>
) {
  const firstName = text(body.firstName)
  const lastName = text(body.lastName)
  const rawBirthDate = text(body.birthDate)
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(rawBirthDate) ? normalizeRosterBirthDate(rawBirthDate) : null
  if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100 ||
      !birthDate || birthDate > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: 'Enter your first name, last name, and a valid date of birth.' }, { status: 400 })
  }

  const phones = { cellPhone: text(body.cellPhone), guardianPhone: text(body.guardianPhone) }
  if (!phones.cellPhone && !phones.guardianPhone) {
    return NextResponse.json({ error: 'Enter your phone number or a parent or guardian’s phone number.' }, { status: 400 })
  }
  for (const phone of Object.values(phones)) {
    if (phone && (phone.length > 50 || !normalizeFamilyPhone(phone))) {
      return NextResponse.json({ error: 'Enter a complete phone number, including the area or country code.' }, { status: 400 })
    }
  }

  // Do not include the birth date in the key: changing guesses must not reset
  // the limit. Hash names/IPs so rate-limit records contain no raw identifiers.
  const digest = (value: string) => createHash('sha256').update(value).digest('hex')
  const identity = digest(`${firstName.toLowerCase()}\n${lastName.toLowerCase()}`)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const identityLimit = await checkRateLimit(`roster-contact:${link.id}:name:${identity}`, 5, WINDOW_MS)
  const networkLimit = await checkRateLimit(`roster-contact:${link.id}:network:${digest(ip)}`, 100, WINDOW_MS)
  if (!identityLimit.allowed || !networkLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait or ask a Sunday School servant for help.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(identityLimit.retryAfterSeconds ?? 1, networkLimit.retryAfterSeconds ?? 1)) } }
    )
  }

  const result = await prisma.$transaction(async tx => {
    // The row lock serializes submissions against the same link. Recheck both
    // class and year here, including when a link was closed mid-request.
    const claimed = await tx.sundaySchoolRosterLink.updateMany({
      where: {
        id: link.id, classId: link.classId, contactUpdateOnly: true,
        revokedAt: null, expiresAt: { gt: new Date() },
        createdAt: { gt: new Date(Date.now() - ROSTER_CONTACT_LINK_HOURS * 3600_000) },
        class: { isActive: true, status: 'ACTIVE' },
        sundaySchoolYear: { status: 'OPEN' },
      },
      data: { useCount: { increment: 1 } },
    })
    if (!claimed.count) return null

    const identityWhere: Prisma.SundaySchoolChildWhereInput = {
      classId: link.classId, isActive: true, status: 'ACTIVE',
      firstName: { equals: firstName, mode: 'insensitive' },
      lastName: { equals: lastName, mode: 'insensitive' },
      birthDate: new Date(`${birthDate}T00:00:00.000Z`),
      class: { isActive: true, status: 'ACTIVE', sundaySchoolYear: { status: 'OPEN' } },
    }
    const matches = await tx.sundaySchoolChild.findMany({
      where: identityWhere, select: { id: true }, take: 2,
    })
    // Missing DOB, no match and duplicate identities all have the same response.
    // Never create a child, enroll/reactivate one, or pick the first duplicate.
    if (matches.length !== 1) return { childId: null, fields: [] as string[] }

    const fields: string[] = []
    for (const field of ['cellPhone', 'guardianPhone'] as const) {
      if (!phones[field]) continue
      // Blankness is checked in the write, not in a stale read. A concurrent
      // servant edit always wins. Family records and siblings are untouched.
      const updated = await tx.sundaySchoolChild.updateMany({
        where: {
          ...identityWhere, id: matches[0].id,
          OR: [{ [field]: null }, { [field]: '' }],
        },
        data: { [field]: phones[field] },
      })
      if (updated.count) fields.push(field)
    }
    return { childId: matches[0].id, fields }
  })
  if (!result) {
    return NextResponse.json({ error: 'This contact update link is closed. Ask a Sunday School servant for help.' }, { status: 410 })
  }

  if (result.childId && result.fields.length) {
    await recordAuditEvent({
      action: 'SUNDAY_SCHOOL_ROSTER_CONTACT_UPDATED', entityType: 'SundaySchoolChild',
      entityId: result.childId, result: 'SUCCESS',
      metadata: { rosterLinkId: link.id, classId: link.classId, fields: result.fields },
    })
  }
  // Identical for a match, mismatch, duplicate and already-populated contacts.
  // No existing names, birth dates, phones, IDs or match flags are exposed.
  return NextResponse.json(ACKNOWLEDGEMENT, { headers: { 'Cache-Control': 'no-store' } })
}
