import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getDailyReadings, liturgicalCacheControl } from '@/lib/coptic-io'
import { isLiturgicalDateKey, parseLiturgicalLanguage } from '@/lib/liturgical'
import { getSundaySchoolTodayDateInputValue } from '@/lib/sunday-school-class'

// GET /api/liturgical/readings?date=YYYY-MM-DD&lang=en|ar
//
// The day's Katameros with full verse text, and the Synaxarium stories, from
// Coptic IO. Open to every signed-in user. 503 when Coptic IO is unreachable.
export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const params = request.nextUrl.searchParams
    const pinnedDate = params.has('date')
    const date = params.get('date') ?? getSundaySchoolTodayDateInputValue()
    if (!isLiturgicalDateKey(date)) {
      return NextResponse.json({ error: 'date must be a valid YYYY-MM-DD day' }, { status: 400 })
    }

    const readings = await getDailyReadings(date, parseLiturgicalLanguage(params.get('lang')))
    if (!readings) {
      return NextResponse.json({ error: 'The readings are unavailable right now' }, { status: 503 })
    }
    return NextResponse.json(readings, {
      headers: { 'Cache-Control': liturgicalCacheControl({ complete: true, pinnedDate }) },
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
