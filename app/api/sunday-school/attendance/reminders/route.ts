import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { getPendingSundaySchoolAttendance } from '@/lib/sunday-school-attendance-reminders'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireAuth()
    const context = await getAuthorizationContext(user.id)
    if (context.disabled) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (context.readOnly) return NextResponse.json({ reminders: [] })
    // Use current direct assignments, matching the attendance editor during year backfill.
    const pending = await getPendingSundaySchoolAttendance(new Date(), context.userId)
    return NextResponse.json({ reminders: pending.map(({ classId, className, sessionDate, url }) => ({ classId, className, sessionDate, url })) })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
