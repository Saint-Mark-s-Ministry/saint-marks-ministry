import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getLiturgicalCalendar } from '@/lib/coptic-io'
import { isLiturgicalDateKey, type LiturgicalCalendarResponse } from '@/lib/liturgical'

/** A year of weekly lessons, with room to spare. */
const MAX_CALENDAR_DATES = 60

// GET /api/liturgical/calendar?dates=YYYY-MM-DD,YYYY-MM-DD,...
//
// Coptic date, fast and feasts for specific days, from Coptic IO, so lesson
// schedules in both modes can show what the Church celebrates on each date.
// Open to every signed-in user; dates are the only input and the only thing
// sent upstream. Days Coptic IO could not answer are left out.
export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const raw = request.nextUrl.searchParams.get('dates') ?? ''
    const dates = Array.from(new Set(raw.split(',').map((value) => value.trim()).filter(Boolean)))
    if (dates.length === 0) {
      return NextResponse.json({ days: {} } satisfies LiturgicalCalendarResponse)
    }
    if (dates.length > MAX_CALENDAR_DATES) {
      return NextResponse.json({ error: `Ask for at most ${MAX_CALENDAR_DATES} dates` }, { status: 400 })
    }
    if (!dates.every(isLiturgicalDateKey)) {
      return NextResponse.json({ error: 'dates must be valid YYYY-MM-DD days' }, { status: 400 })
    }

    const days = await getLiturgicalCalendar(dates)
    return NextResponse.json({ days } satisfies LiturgicalCalendarResponse, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
