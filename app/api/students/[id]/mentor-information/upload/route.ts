import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-utils'
import { handleApprovalFormUpload } from '@/lib/approval-form-submission'
import { requireMentorFormStaff, loadStaffMentorForm, guardStaffMentorForm, saveStaffAnnualMentor, auditStaffMentorForm, isMentorFormConflict, MentorFormConflictError } from '@/lib/staff-mentor-form'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMentorFormStaff()
    const { id } = await params
    const state = await loadStaffMentorForm(id)
    const body: unknown = await request.clone().json().catch(() => null)
    if (!body || typeof body !== 'object' || !('version' in body) || body.version !== state.version) throw new MentorFormConflictError()
    const response = await handleApprovalFormUpload(request, id, async (tx, source) => {
      if (source.applicationId !== (state.application?.id ?? null) || source.academicYearId !== (state.requirement?.activeYear.id ?? null) || source.annualVersion !== (state.requirement?.information?.updatedAt.toISOString() ?? null)) throw new MentorFormConflictError()
      await guardStaffMentorForm(tx, state)
      await saveStaffAnnualMentor(tx, id, state)
      await auditStaffMentorForm(tx, actor.id, id, state, 'file')
    })
    if (!response.ok || !('action' in body) || body.action !== 'complete') return response
    const data = await response.json()
    const form = (await loadStaffMentorForm(id)).form
    return NextResponse.json({ ...data, version: form.version, pendingReview: form.pendingReview })
  } catch (error) {
    if (isMentorFormConflict(error)) return NextResponse.json({ error: 'Mentor form changed. Refresh the form before uploading again.' }, { status: 409 })
    return handleApiError(error)
  }
}
