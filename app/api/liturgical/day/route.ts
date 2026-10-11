import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getLiturgicalDay, liturgicalCacheControl } from '@/lib/coptic-io'
import { isLiturgicalDateKey, parseLiturgicalLanguage } from '@/lib/liturgical'
import { getSundaySchoolTodayDateInputValue } from '@/lib/sunday-school-class'

// GET /api/liturgical/day?date=YYYY-MM-DD&lang=en|ar
//
// The church calendar for one day (Coptic date, season, fast, feasts, saints,
// reading references), from Coptic IO. Reference content for every signed-in
// user in both modes; it carries no user data and grants nothing.
// `date` defaults to today at the church, not on the server.
export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const params = request.nextUrl.searchParams
    const pinnedDate = params.has('date')
    const date = params.get('date') ?? getSundaySchoolTodayDateInputValue()
    if (!isLiturgicalDateKey(date)) {
      return NextResponse.json({ error: 'date must be a valid YYYY-MM-DD day' }, { status: 400 })
    }

    const day = await getLiturgicalDay(date, parseLiturgicalLanguage(params.get('lang')))
    return NextResponse.json(day, {
      headers: { 'Cache-Control': liturgicalCacheControl({ complete: day.available, pinnedDate }) },
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
