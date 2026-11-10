import { createHash, randomBytes } from 'node:crypto'
import { AttendanceStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canServeClass, getSundaySchoolAccess } from '@/lib/sunday-school-access'
import { checkInIsOpen, isCheckInMeetingToday } from '@/lib/sunday-school-attendance-check-in-time'

export class CheckInError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
export const hashCheckInToken = (token: string) => createHash('sha256').update(token).digest('hex')
export async function currentCheckInUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, isDisabled: true, authVersion: true } })
  if (!user || user.isDisabled) throw new CheckInError('Please sign in again.', 401)
  return user
}
export async function requireCheckInManager(userId: string, classId: string) {
  const [user, classroom] = await Promise.all([
    currentCheckInUser(userId),
    prisma.sundaySchoolClass.findUnique({ where: { id: classId }, select: { id: true, name: true, academicYearId: true, level: true, isActive: true, status: true } }),
  ])
  if (!classroom || !classroom.isActive || classroom.status !== 'ACTIVE') throw new CheckInError('Class not found.', 404)
  const access = await getSundaySchoolAccess(user, classroom.academicYearId)
  if (user.role === 'PRIEST' || !canServeClass(access, classId)) throw new CheckInError('You cannot open check-in for this class.', 403)
  return { user, classroom }
}
export async function lockCheckInSession(tx: Prisma.TransactionClient, sessionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "SundaySchoolSession" WHERE "id" = ${sessionId} FOR UPDATE`
}
export async function loadCheckIn(token: string, tx?: Prisma.TransactionClient, allowOutsideWindow = false) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new CheckInError('This check-in code is invalid or has expired. Ask a servant for today’s code.', 410)
  const query = {
    where: { tokenHash: hashCheckInToken(token) },
    include: { session: { include: { class: { select: { id: true, name: true, level: true, academicYearId: true, isActive: true, status: true } } } } },
  } as const
  const window = tx ? await tx.sundaySchoolAttendanceCheckIn.findUnique(query) : await prisma.sundaySchoolAttendanceCheckIn.findUnique(query)
  if (!window || (!allowOutsideWindow && (!checkInIsOpen(window) || !isCheckInMeetingToday(window.session.date, window.session.class.level))) || !window.session.class.isActive || window.session.class.status !== 'ACTIVE') {
    throw new CheckInError('Check-in is closed. Ask a servant to record your attendance.', 410)
  }
  // Revoked assignments, disabled issuers and password/session invalidation close access too.
  let issuer
  try { issuer = await requireCheckInManager(window.createdById, window.session.classId) }
  catch (error: unknown) {
    if (error instanceof CheckInError) throw new CheckInError('Check-in is closed. Ask a servant for a new code.', 410)
    throw error
  }
  if (issuer.user.authVersion !== window.authVersion) throw new CheckInError('Check-in is closed. Ask a servant for a new code.', 410)
  return window
}
export function newCheckInToken() { return randomBytes(32).toString('base64url') }

/** Finish locks out new scans and preserves records not explicitly changed by the servant. */
export async function finishAttendanceWithCheckIn(sessionId: string, userId: string, records: Array<{ childId: string; status: AttendanceStatus; notes?: string | null; expectedSelfCheckedInAt?: string | null }>, explicitChildIds: string[]) {
  return prisma.$transaction(async tx => {
    await lockCheckInSession(tx, sessionId)
    const session = await tx.sundaySchoolSession.findUniqueOrThrow({ where: { id: sessionId }, select: { classId: true } })
    const waiting = await tx.sundaySchoolAttendanceCheckInRequest.count({ where: { sessionId, reviewedAt: null, child: { classId: session.classId, isActive: true, status: 'ACTIVE' } } })
    if (waiting) throw new CheckInError('Review the waiting QR requests before finishing attendance.', 409)
    await tx.sundaySchoolAttendanceCheckIn.updateMany({ where: { sessionId, closedAt: null }, data: { closedAt: new Date() } })
    const existing = await tx.sundaySchoolChildAttendance.findMany({ where: { sessionId }, select: { childId: true, selfCheckedInAt: true } })
    const savedByChild = new Map(existing.map(row => [row.childId, row]))
    const explicitIds = new Set(explicitChildIds)
    const now = new Date()
    for (const record of records) {
      const saved = savedByChild.get(record.childId)
      if (saved && (!explicitIds.has(record.childId) || (saved.selfCheckedInAt && saved.selfCheckedInAt.toISOString() !== record.expectedSelfCheckedInAt))) continue
      const data = { status: record.status, notes: record.notes?.trim() || null, recordedBy: userId, selfCheckedInAt: null, updatedAt: now }
      await tx.sundaySchoolChildAttendance.upsert({ where: { sessionId_childId: { sessionId, childId: record.childId } }, create: { sessionId, childId: record.childId, ...data }, update: data })
    }
    await tx.sundaySchoolSession.update({ where: { id: sessionId }, data: { takenBy: userId } })
    return now
  }, { timeout: 15000 })
}
