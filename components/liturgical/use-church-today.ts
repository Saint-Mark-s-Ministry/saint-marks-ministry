'use client'

import { useEffect, useState } from 'react'
import { secondsUntilChurchMidnight } from '@/lib/liturgical'
import { getSundaySchoolTodayDateInputValue } from '@/lib/sunday-school-class'

/**
 * Today's date at the church (YYYY-MM-DD), updating itself at midnight there.
 * Passing it explicitly to the liturgical hooks gives each day its own cache
 * key, so a tab left open overnight moves on to the new day by itself.
 */
export function useChurchToday(): string {
  const [today, setToday] = useState(() => getSundaySchoolTodayDateInputValue())

  useEffect(() => {
    // A second past midnight, so the new date has definitely begun.
    const timer = setTimeout(
      () => setToday(getSundaySchoolTodayDateInputValue()),
      (secondsUntilChurchMidnight() + 1) * 1000
    )
    return () => clearTimeout(timer)
  }, [today])

  return today
}
