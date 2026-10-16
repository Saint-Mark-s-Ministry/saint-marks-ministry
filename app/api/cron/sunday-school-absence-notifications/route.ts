import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-utils'
import { sendSundaySchoolAbsenceNotifications } from '@/lib/sunday-school-absence-notifications'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await sendSundaySchoolAbsenceNotifications()
    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
