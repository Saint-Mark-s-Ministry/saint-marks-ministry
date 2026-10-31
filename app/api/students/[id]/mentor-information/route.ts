import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-utils'
import { requireMentorFormStaff, loadStaffMentorForm, parseStaffMentorContact, saveStaffMentorContact, isMentorFormConflict, MentorFormConflictError } from '@/lib/staff-mentor-form'

type Context = { params: Promise<{ id: string }> }
export async function GET(_request: Request, { params }: Context) {
  try {
    await requireMentorFormStaff()
    return NextResponse.json((await loadStaffMentorForm((await params).id)).form)
  } catch (error) { return handleApiError(error) }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireMentorFormStaff()
    const { id } = await params
    const state = await loadStaffMentorForm(id)
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid mentor form' }, { status: 400 })
    const data = body as Record<string, unknown>
    if (data.version !== state.version) throw new MentorFormConflictError()
    const contact = parseStaffMentorContact(data)
    if (!contact) return NextResponse.json({ error: 'Enter a mentor name, phone number and valid email address' }, { status: 400 })
    if (contact.mentorName === state.form.mentorName && contact.mentorPhone === state.form.mentorPhone && contact.mentorEmail === state.form.mentorEmail) {
      return NextResponse.json(state.form)
    }
    await saveStaffMentorContact(id, actor.id, state, contact)
    return NextResponse.json((await loadStaffMentorForm(id)).form)
  } catch (error) {
    if (isMentorFormConflict(error)) return NextResponse.json({ error: 'Mentor form changed. Refresh the form before saving again.' }, { status: 409 })
    return handleApiError(error)
  }
}
