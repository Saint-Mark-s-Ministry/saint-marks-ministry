import { AuditEventResult, type Prisma } from '@prisma/client'
import { matchPrepStudentsToRoster } from '@/lib/servants-prep-roster-matching'

export interface PrepRosterLinkResult {
  status: 'linked' | 'already_linked' | 'review' | 'unmatched' | 'not_applicable'
  reason: string
}

export class PrepRosterLinkConflictError extends Error {
  constructor() {
    super('The Sunday School roster changed. Refresh and approve the registration again.')
    this.name = 'PrepRosterLinkConflictError'
  }
}

/** Call after approving the registration, inside the same serializable transaction. */
export async function autoLinkPrepStudentToRoster(
  tx: Prisma.TransactionClient,
  studentId: string,
  actorId: string,
  registrationId: string,
): Promise<PrepRosterLinkResult> {
  const [accounts, children] = await Promise.all([
    tx.user.findMany({
      where: { isDisabled: false, enrollments: { some: { isActive: true, status: 'ACTIVE' } } },
      select: {
        id: true, name: true,
        createdFromRegistration: {
          where: { status: 'APPROVED' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1,
          select: { grade: true, dateOfBirth: true },
        },
      },
    }),
    // Include archived records and existing links when checking name uniqueness.
    tx.sundaySchoolChild.findMany({
      select: {
        id: true, firstName: true, lastName: true, level: true,
        birthDate: true, userId: true, isActive: true, status: true,
      },
    }),
  ])
  const matches = matchPrepStudentsToRoster(accounts.map(account => {
    const registration = account.createdFromRegistration[0]
    return {
      id: account.id, name: account.name,
      registration: registration ? { grade: registration.grade, birthDate: registration.dateOfBirth.toISOString().slice(0, 10) } : null,
    }
  }), children.map(child => ({ ...child, birthDate: child.birthDate?.toISOString().slice(0, 10) ?? null })))
  const match = matches.find(item => item.studentId === studentId)
  if (!match) return { status: 'not_applicable', reason: 'No eligible grade 11 or 12 Prep student roster match' }
  if (match.status === 'linked') return { status: 'already_linked', reason: 'Existing Sunday School roster link preserved' }
  if (match.status !== 'ready') return { status: match.status, reason: match.reason }
  const child = children.find(item => item.id === match.candidates[0].id)!
  if (!child.isActive || child.status !== 'ACTIVE') {
    return { status: 'review', reason: 'Roster record is archived or inactive' }
  }
  const updated = await tx.sundaySchoolChild.updateMany({
    where: {
      id: child.id, userId: null, isActive: true, status: 'ACTIVE',
      firstName: child.firstName, lastName: child.lastName, birthDate: child.birthDate, level: child.level,
    },
    data: { userId: studentId },
  })
  if (updated.count !== 1) throw new PrepRosterLinkConflictError()
  await tx.auditEvent.create({
    data: {
      actorUserId: actorId, action: 'sunday_school.prep_roster.auto_link',
      entityType: 'SundaySchoolChild', entityId: child.id, result: AuditEventResult.SUCCESS,
      metadata: { studentId, registrationId, verification: 'unique_full_name_birth_date_grade' },
    },
  })
  return { status: 'linked', reason: 'Linked to the verified Sunday School student roster record' }
}
