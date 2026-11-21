import { getClassCheckInWindow } from '@/lib/sunday-school-attendance-check-in-time'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { recordAuditEvent } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { CheckInError, hashCheckInToken, lockCheckInSession, newCheckInToken, requireCheckInManager } from '@/lib/sunday-school-attendance-check-in'
import { normalizeSessionDate } from '@/lib/sunday-school-class'

// Sunday School mode only: authenticated class staff open/replace/close a meeting's QR.
export async function POST(request: Request) {
  try {
    if (!request.headers.get('content-type')?.includes('application/json') || (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const auth = await requireAuth()
    const body = await request.json()
    if (!body || typeof body.classId !== 'string' || typeof body.date !== 'string' || !['open', 'close', 'approve', 'reject'].includes(body.action)) return NextResponse.json({ error: 'Choose a class, meeting date and action.' }, { status: 400 })
    const { user, classroom } = await requireCheckInManager(auth.id, body.classId)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return NextResponse.json({ error: 'Invalid meeting date.' }, { status: 400 })
    let date: Date
    try { date = normalizeSessionDate(body.date) } catch { return NextResponse.json({ error: 'Invalid meeting date.' }, { status: 400 }) }
    if (date.toISOString().slice(0, 10) !== body.date) return NextResponse.json({ error: 'Invalid meeting date.' }, { status: 400 })
    if (auth.authVersion !== user.authVersion) throw new CheckInError('Please sign in again.', 401)
    if (body.action === 'approve' || body.action === 'reject') {
      if (!Array.isArray(body.childIds) || !body.childIds.length || body.childIds.length > 150 || !body.childIds.every((id: unknown) => typeof id === 'string')) return NextResponse.json({ error: 'Choose check-in requests to confirm.' }, { status: 400 })
      const session = await prisma.sundaySchoolSession.findUnique({ where: { classId_date: { classId: classroom.id, date } } })
      if (!session) return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 })
      const reviewed = await prisma.$transaction(async tx => {
        await lockCheckInSession(tx, session.id)
        const pending = await tx.sundaySchoolAttendanceCheckInRequest.findMany({ where: { sessionId: session.id, childId: { in: body.childIds }, reviewedAt: null, child: { classId: classroom.id, isActive: true, status: 'ACTIVE' } } })
        const existing = await tx.sundaySchoolChildAttendance.findMany({ where: { sessionId: session.id, childId: { in: pending.map(row => row.childId) } }, select: { childId: true } })
        const existingIds = new Set(existing.map(row => row.childId))
        const additions = body.action === 'approve' ? pending.filter(row => !existingIds.has(row.childId)) : []
        const saved = additions.length
          ? await tx.sundaySchoolChildAttendance.createMany({ data: additions.map(row => ({ sessionId: session.id, childId: row.childId, status: 'PRESENT', recordedBy: user.id, selfCheckedInAt: row.submittedAt })), skipDuplicates: true })
          : { count: 0 }
        await tx.sundaySchoolAttendanceCheckInRequest.updateMany({ where: { id: { in: pending.map(row => row.id) } }, data: { reviewedAt: new Date(), approved: body.action === 'approve' } })
        return { requestCount: pending.length, added: saved.count }
      })
      if (reviewed.requestCount) {
        await recordAuditEvent({
          actorUserId: user.id,
          action: body.action === 'approve' ? 'sunday_school.attendance_qr.approved' : 'sunday_school.attendance_qr.dismissed',
          entityType: 'SundaySchoolSession', entityId: session.id, result: 'SUCCESS',
          metadata: { classId: classroom.id, targetName: classroom.name, attendanceDate: body.date,
            requestCount: reviewed.requestCount, attendanceAddedCount: reviewed.added },
        })
      }
      return NextResponse.json({ confirmed: true, added: reviewed.added }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const token = newCheckInToken()
    const hours = getClassCheckInWindow(body.date, classroom.level)
    if (body.action === 'open' && (!hours || hours.expiresAt.getTime() <= Date.now())) return NextResponse.json({ error: 'This meeting’s check-in window has ended.' }, { status: 409 })
    const opensAt = hours?.opensAt ?? new Date()
    const expiresAt = hours?.expiresAt ?? new Date()
    const session = await prisma.sundaySchoolSession.upsert({ where: { classId_date: { classId: classroom.id, date } }, create: { classId: classroom.id, date }, update: {} })
    const activity = await prisma.$transaction(async tx => {
      await lockCheckInSession(tx, session.id)
      if (body.action === 'close') {
        const closed = await tx.sundaySchoolAttendanceCheckIn.updateMany({ where: { sessionId: session.id, closedAt: null }, data: { closedAt: new Date() } })
        return closed.count ? 'sunday_school.attendance_qr.closed' : null
      } else {
        const existing = await tx.sundaySchoolAttendanceCheckIn.findUnique({ where: { sessionId: session.id }, select: { sessionId: true } })
        const data = { tokenHash: hashCheckInToken(token), opensAt, expiresAt, createdById: user.id, authVersion: user.authVersion, closedAt: null }
        await tx.sundaySchoolAttendanceCheckIn.upsert({ where: { sessionId: session.id }, create: { sessionId: session.id, ...data }, update: data })
        return existing ? 'sunday_school.attendance_qr.replaced' : 'sunday_school.attendance_qr.created'
      }
    })
    if (activity) {
      await recordAuditEvent({
        actorUserId: user.id, action: activity,
        entityType: 'SundaySchoolSession', entityId: session.id, result: 'SUCCESS',
        metadata: { classId: classroom.id, targetName: classroom.name, attendanceDate: body.date,
          ...(body.action === 'open' ? { opensAt: opensAt.toISOString(), expiresAt: expiresAt.toISOString() } : {}),
        },
      })
    }
    return NextResponse.json(body.action === 'open' ? { token, codeVersion: hashCheckInToken(token).slice(0, 12), opensAt: opensAt.toISOString(), expiresAt: expiresAt.toISOString(), sessionId: session.id } : { closed: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    if (error instanceof CheckInError) return NextResponse.json({ error: error.message }, { status: error.status })
    return handleApiError(error)
  }
}
