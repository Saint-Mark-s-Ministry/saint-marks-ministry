import { AuditEventResult, NotificationType, Prisma, RegistrationStatus, RoleTag } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireAuth } from '@/lib/auth-helpers'
import { canWriteBusinessData, getAuthorizationContext } from '@/lib/authorization'
import { getAnnualMentorRequirement, queueAnnualMentorReview } from '@/lib/annual-mentor-information'
import { normalizeOptionalEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'

import { MentorFormConflictError } from '@/lib/mentor-form-error'
export { MentorFormConflictError, isMentorFormConflict } from '@/lib/mentor-form-error'

export async function requireMentorFormStaff() {
  const actor = await requireAuth()
  const [context, session] = await Promise.all([getAuthorizationContext(actor.id), getServerSession(authOptions)])
  if (session?.impersonating || !canWriteBusinessData(context) || context.roleTags.has(RoleTag.PRIEST) ||
    (!context.roleTags.has(RoleTag.SUPER_ADMIN) && !context.roleTags.has(RoleTag.SERVANTS_PREP_SERVANT))) throw new Error('Forbidden')
  return actor
}

export async function loadStaffMentorForm(studentId: string) {
  const [application, requirement, enrollment] = await Promise.all([
    prisma.registrationSubmission.findFirst({ where: { createdUserId: studentId, status: RegistrationStatus.APPROVED }, orderBy: { createdAt: 'desc' }, select: {
      id: true, updatedAt: true, fatherOfConfessionName: true,
      mentorName: true, mentorPhone: true, mentorEmail: true, approvalFormUrl: true, approvalFormFilename: true,
    } }),
    getAnnualMentorRequirement(studentId),
    prisma.studentEnrollment.findUnique({ where: { studentId }, select: {
      id: true, updatedAt: true, mentorName: true, mentorPhone: true,
      approvalFormUrl: true, approvalFormFilename: true, student: { select: { name: true } },
    } }),
  ])
  if (!enrollment || (!application && !requirement)) throw new Error('Not found')
  const contact = requirement ? requirement.information : application
  const version = JSON.stringify({ academicYearId: requirement?.activeYear.id ?? null, application: application?.updatedAt.toISOString() ?? null,
    annual: requirement?.information?.updatedAt.toISOString() ?? null, enrollment: enrollment.updatedAt.toISOString() })
  const form = {
    studentName: enrollment.student.name, version,
    mentorName: contact?.mentorName ?? '', mentorPhone: contact?.mentorPhone ?? '', mentorEmail: contact?.mentorEmail ?? '',
    approvalFormUrl: application?.approvalFormUrl ?? enrollment.approvalFormUrl,
    approvalFormFilename: application?.approvalFormFilename ?? enrollment.approvalFormFilename,
    academicYear: requirement?.activeYear.name ?? null,
    pendingReview: Boolean(requirement && !requirement.information?.reviewedAt),
  }
  return { application, requirement, enrollment, version, form }
}

export type StaffMentorFormState = Awaited<ReturnType<typeof loadStaffMentorForm>>
const nextVersion = (previous: Date) => new Date(Math.max(Date.now(), previous.getTime() + 1))

/** Lock/version-check the existing source rows before any staff change. */
export async function guardStaffMentorForm(tx: Prisma.TransactionClient, state: StaffMentorFormState) {
  if (state.application) {
    const result = await tx.registrationSubmission.updateMany({
      where: { id: state.application.id, updatedAt: state.application.updatedAt },
      data: { updatedAt: nextVersion(state.application.updatedAt) },
    })
    if (result.count !== 1) throw new MentorFormConflictError()
  }
  const result = await tx.studentEnrollment.updateMany({ where: { id: state.enrollment.id, updatedAt: state.enrollment.updatedAt },
    data: { updatedAt: nextVersion(state.enrollment.updatedAt) } })
  if (result.count !== 1) throw new MentorFormConflictError()
}

/** Reset verification and queue its new version, never enrollment status. */
export async function saveStaffAnnualMentor(tx: Prisma.TransactionClient, studentId: string, state: StaffMentorFormState,
  contact?: { mentorName: string; mentorPhone: string; mentorEmail: string }) {
  const requirement = state.requirement
  if (!requirement || (!requirement.information && !contact)) return
  let submission
  if (requirement.information) {
    const result = await tx.annualMentorInformation.updateMany({
      where: { id: requirement.information.id, updatedAt: requirement.information.updatedAt },
      data: { ...contact, submittedAt: new Date(), reviewedAt: null, reviewedBy: null, updatedAt: nextVersion(requirement.information.updatedAt) },
    })
    if (result.count !== 1) throw new MentorFormConflictError()
    submission = await tx.annualMentorInformation.findUniqueOrThrow({ where: { id: requirement.information.id } })
  } else {
    submission = await tx.annualMentorInformation.create({ data: {
      studentId, academicYearId: requirement.activeYear.id, ...contact!,
    } })
  }
  await queueAnnualMentorReview(tx, { studentId, studentName: state.enrollment.student.name,
    academicYearId: requirement.activeYear.id, id: submission.id, updatedAt: submission.updatedAt })
}

export async function auditStaffMentorForm(tx: Prisma.TransactionClient, actorId: string, studentId: string, state: StaffMentorFormState, change: 'contact' | 'file') {
  await tx.auditEvent.create({ data: { actorUserId: actorId, action: 'STUDENT_MENTOR_FORM_UPDATED', entityType: 'User', entityId: studentId,
    result: AuditEventResult.SUCCESS, metadata: { change, academicYearId: state.requirement?.activeYear.id ?? null } } })
}

export function parseStaffMentorContact(body: Record<string, unknown>) {
  const mentorName = typeof body.mentorName === 'string' ? body.mentorName.trim() : ''
  const mentorPhone = typeof body.mentorPhone === 'string' ? body.mentorPhone.trim() : ''
  const mentorEmail = normalizeOptionalEmail(body.mentorEmail) ?? ''
  if (!mentorName || !mentorPhone || !mentorEmail) return null
  if (mentorName.length > 200 || mentorPhone.length > 100 || mentorEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mentorEmail)) return null
  return { mentorName, mentorPhone, mentorEmail }
}

export async function saveStaffMentorContact(studentId: string, actorId: string, state: StaffMentorFormState, contact: NonNullable<ReturnType<typeof parseStaffMentorContact>>) {
  await prisma.$transaction(async tx => {
    await guardStaffMentorForm(tx, state)
    if (state.application) await tx.registrationSubmission.update({ where: { id: state.application.id }, data: contact })
    await tx.studentEnrollment.update({ where: { id: state.enrollment.id }, data: { mentorName: contact.mentorName, mentorPhone: contact.mentorPhone } })
    await saveStaffAnnualMentor(tx, studentId, state, contact)
    if (!state.requirement && state.application?.fatherOfConfessionName && state.application.approvalFormUrl && state.application.approvalFormFilename) {
      await tx.notification.deleteMany({ where: { userId: studentId, type: NotificationType.REGISTRATION_INCOMPLETE, isPersistent: true } })
    }
    await auditStaffMentorForm(tx, actorId, studentId, state, 'contact')
  })
}
