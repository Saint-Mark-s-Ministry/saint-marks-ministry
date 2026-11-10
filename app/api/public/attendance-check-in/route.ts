import { NextResponse } from 'next/server'
import { matchCheckInName, normalizeCheckInName } from '@/lib/sunday-school-check-in-name'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { checkRateLimit } from '@/lib/rate-limit'
import { CheckInError, hashCheckInToken, loadCheckIn, lockCheckInSession } from '@/lib/sunday-school-attendance-check-in'

// Name-only classroom requests. No roster disclosure and no attendance write:
// a class servant must confirm the matched child on the authenticated screen.
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
function failure(error: unknown) {
  if (error instanceof CheckInError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  return handleApiError(error)
}
export async function GET(request: Request) {
  try {
    const window = await loadCheckIn(request.headers.get('X-Attendance-Check-In') ?? '', undefined, true)
    const now = Date.now()
    const state = window.closedAt || window.expiresAt.getTime() <= now ? 'closed' : window.opensAt.getTime() > now ? 'upcoming' : 'open'
    return NextResponse.json({ className: window.session.class.name, date: window.session.date.toISOString().slice(0, 10), opensAt: window.opensAt.toISOString(), expiresAt: window.expiresAt.toISOString(), state }, { headers })
  } catch (error: unknown) { return failure(error) }
}
export async function POST(request: Request) {
  try {
    if (!request.headers.get('content-type')?.includes('application/json') || (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await request.json()
    if (!body || typeof body.token !== 'string' || typeof body.name !== 'string') return NextResponse.json({ error: 'Please enter your first and last name.' }, { status: 400, headers })
    const name = normalizeCheckInName(body.name)
    if (!name || name.length > 200) return NextResponse.json({ error: 'Please enter your first and last name.' }, { status: 400, headers })
    const tokenKey = hashCheckInToken(body.token)
    const network = hashCheckInToken(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown')
    const nameKey = hashCheckInToken(name)
    const limits = await Promise.all([
      checkRateLimit(`qr-name:${tokenKey}:${nameKey}`, 10, 15 * 60_000),
      checkRateLimit(`qr-network:${tokenKey}:${network}`, 200, 15 * 60_000),
      checkRateLimit(`qr-token:${tokenKey}`, 1000, 2 * 60 * 60_000),
    ])
    if (limits.some(limit => !limit.allowed)) return NextResponse.json({ error: 'Please ask your servant to help you check in.' }, { status: 429, headers })
    const initial = await loadCheckIn(body.token)
    await prisma.$transaction(async tx => {
      await lockCheckInSession(tx, initial.sessionId)
      const window = await loadCheckIn(body.token, tx)
      const children = await tx.sundaySchoolChild.findMany({ where: { classId: window.session.classId, isActive: true, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true } })
      const childId = matchCheckInName(children, name)
      if (childId) await tx.sundaySchoolAttendanceCheckInRequest.createMany({ data: [{ sessionId: window.sessionId, childId }], skipDuplicates: true })
    })
    // Identical response for unmatched/ambiguous, duplicate and matching names.
    return NextResponse.json({ received: true }, { headers })
  } catch (error: unknown) { return failure(error) }
}
