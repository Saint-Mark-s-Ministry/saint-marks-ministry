import { describe, expect, it } from 'vitest'
import {
  copticToGregorian,
  daysFromEaster,
  getChurchSeason,
  getReadingCycle,
  gregorianToCoptic,
  orthodoxEaster,
} from '@/lib/liturgical-cycle'
import { getSundaySchoolTodayDateInputValue } from '@/lib/sunday-school-class'
import { addDaysToDateKey } from '@/lib/liturgical'

const season = (date: string) => getChurchSeason(date).name
const cycle = (date: string) => {
  const { kind, label, available } = getReadingCycle(date)
  return { kind, label, available }
}

describe('Coptic calendar arithmetic', () => {
  it('converts Gregorian days to Coptic dates, including the Nayrouz shift before a leap year', () => {
    expect(gregorianToCoptic('2026-09-10')).toEqual({ year: 1742, month: 13, day: 5 }) // 5 Nasie
    expect(gregorianToCoptic('2026-09-11')).toEqual({ year: 1743, month: 1, day: 1 }) // Nayrouz
    expect(gregorianToCoptic('2026-10-18')).toEqual({ year: 1743, month: 2, day: 8 }) // 8 Baba
    expect(gregorianToCoptic('2027-01-07')).toEqual({ year: 1743, month: 4, day: 29 }) // Nativity
    // 2028 is a Gregorian leap year, so Coptic 1743 gets a 6th day of Nasie and Nayrouz moves to 12 September.
    expect(gregorianToCoptic('2027-09-11')).toEqual({ year: 1743, month: 13, day: 6 })
    expect(gregorianToCoptic('2027-09-12')).toEqual({ year: 1744, month: 1, day: 1 })
  })

  it('round-trips every day in the supported range', () => {
    for (let date = '1900-01-01'; date <= '2199-12-31'; date = addDaysToDateKey(date, 1)) {
      if (copticToGregorian(gregorianToCoptic(date)) !== date) throw new Error(`round trip failed for ${date}`)
    }
  })

  it('finds the Coptic Feast of the Resurrection', () => {
    expect(orthodoxEaster(2024)).toBe('2024-05-05')
    expect(orthodoxEaster(2025)).toBe('2025-04-20')
    expect(orthodoxEaster(2026)).toBe('2026-04-12')
    expect(orthodoxEaster(2027)).toBe('2027-05-02')
    expect(orthodoxEaster(2030)).toBe('2030-04-28')
    // After 2100 the Julian calendar runs 14 days behind, not 13.
    expect(orthodoxEaster(2101)).toBe('2101-04-24')
    for (let year = 1900; year <= 2199; year++) {
      expect(new Date(`${orthodoxEaster(year)}T00:00:00Z`).getUTCDay()).toBe(0)
    }
  })

  it('does not depend on the process time zone', () => {
    const before = process.env.TZ
    try {
      const results = ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/New_York'].map((zone) => {
        process.env.TZ = zone
        return [getReadingCycle('2026-10-18'), getChurchSeason('2027-01-06'), daysFromEaster('2027-05-02')]
      })
      expect(results[1]).toEqual(results[0])
      expect(results[2]).toEqual(results[0])
    } finally {
      process.env.TZ = before
    }
  })
})

describe('reading cycles', () => {
  it('reads the Sunday Katameros on the 2nd Sunday of Baba, not the annual 8 Baba readings (the reported case)', () => {
    expect(getReadingCycle('2026-10-18')).toEqual({
      kind: 'sunday',
      label: '2nd Sunday of Baba',
      annualDay: '8 Baba',
      available: false,
    })
  })

  it('reads the annual Katameros on a regular weekday', () => {
    expect(getReadingCycle('2026-10-19')).toEqual({ kind: 'annual', label: '9 Baba', annualDay: '9 Baba', available: true })
  })

  it('numbers Sundays within the Coptic month, up to a 5th Sunday', () => {
    expect(cycle('2026-10-11').label).toBe('1st Sunday of Baba')
    expect(cycle('2026-10-25').label).toBe('3rd Sunday of Baba')
    expect(cycle('2026-11-08').label).toBe('5th Sunday of Baba')
    expect(cycle('2027-01-17').label).toBe('2nd Sunday of Toba')
  })

  it('lets a feast of the Lord on a Sunday keep its own readings', () => {
    expect(cycle('2029-01-07')).toEqual({ kind: 'annual', label: '29 Kiahk', available: true }) // Nativity on a Sunday
    expect(cycle('2030-01-06')).toEqual({ kind: 'annual', label: '28 Kiahk', available: true }) // Paramoun eve on a Sunday
    expect(cycle('2026-09-27')).toEqual({ kind: 'annual', label: '17 Tout', available: true }) // Feast of the Cross
    expect(cycle('2027-09-12')).toEqual({ kind: 'annual', label: '1 Tout', available: true }) // Nayrouz
  })

  it('switches to Jonah’s Fast and back', () => {
    expect(cycle('2027-02-21')).toMatchObject({ kind: 'sunday' })
    expect(cycle('2027-02-22')).toEqual({ kind: 'jonah', label: 'Jonah’s Fast', available: true })
    expect(cycle('2027-02-25')).toEqual({ kind: 'jonah', label: 'Jonah’s Passover', available: true })
    expect(cycle('2027-02-26')).toMatchObject({ kind: 'annual' })
  })

  it('uses the Lenten Katameros from the preparation weekend through Palm Sunday, Sundays included', () => {
    expect(cycle('2027-03-05')).toMatchObject({ kind: 'annual' })
    expect(cycle('2027-03-06')).toMatchObject({ kind: 'greatLent', available: true }) // Preparation Saturday
    expect(cycle('2027-03-21')).toMatchObject({ kind: 'greatLent' }) // a Sunday in Lent is not the Sunday cycle
    expect(cycle('2027-04-25')).toEqual({ kind: 'greatLent', label: 'Palm Sunday', available: true })
  })

  it('uses the Pascha book from Monday to Saturday of Holy Week', () => {
    expect(cycle('2027-04-26')).toEqual({ kind: 'pascha', label: 'Monday of Holy Week', available: false })
    expect(cycle('2027-04-29')).toEqual({ kind: 'pascha', label: 'Covenant Thursday', available: false })
    expect(cycle('2027-04-30')).toEqual({ kind: 'pascha', label: 'Good Friday', available: false })
    expect(cycle('2027-05-01')).toEqual({ kind: 'pascha', label: 'Holy Saturday', available: false })
  })

  it('uses the Holy 50s from the Resurrection to Pentecost, Sundays included, then returns to the annual cycle', () => {
    expect(cycle('2027-05-02')).toEqual({ kind: 'holy50', label: 'Feast of the Resurrection', available: false })
    expect(cycle('2027-05-09')).toEqual({ kind: 'holy50', label: 'Thomas Sunday', available: false })
    expect(cycle('2027-05-13')).toEqual({ kind: 'holy50', label: 'Day 12 of the Holy 50s', available: false })
    expect(cycle('2027-05-16')).toMatchObject({ kind: 'holy50' })
    expect(cycle('2027-06-10')).toEqual({ kind: 'holy50', label: 'Feast of the Ascension', available: false })
    expect(cycle('2027-06-20')).toEqual({ kind: 'holy50', label: 'Feast of Pentecost', available: false })
    expect(cycle('2027-06-21')).toMatchObject({ kind: 'annual', available: true })
    expect(cycle('2027-06-27')).toMatchObject({ kind: 'sunday' })
  })

  it('flags exactly the days Coptic IO has no readings for, matching its Lent (−57…−7) and Jonah (−69…−66) tables', () => {
    for (let year = 1950; year <= 2150; year += 7) {
      const easter = orthodoxEaster(year)
      for (let offset = -80; offset <= 60; offset++) {
        const date = addDaysToDateKey(easter, offset)
        const { kind } = getReadingCycle(date)
        const moveableUpstream = (offset >= -57 && offset <= -7) || (offset >= -69 && offset <= -66)
        expect(kind === 'greatLent' || kind === 'jonah', `${date} (${offset})`).toBe(moveableUpstream)
      }
    }
  })
})

describe('church seasons', () => {
  it('calls days outside the seasons "Annual Days", never "Ordinary"', () => {
    expect(getChurchSeason('2026-10-18')).toEqual({ key: 'annual', name: 'Annual Days', startDate: null, endDate: null })
    for (let date = '2026-01-01'; date <= '2027-12-31'; date = addDaysToDateKey(date, 1)) {
      expect(season(date)).not.toMatch(/ordinary/i)
    }
  })

  it('marks Festive Days: Nayrouz to the Cross, the monthly 29th (not in Toba and Amshir) and feasts of the Lord', () => {
    expect(season('2026-09-11')).toBe('Festive Days') // Nayrouz
    expect(season('2026-09-29')).toBe('Festive Days') // 19 Tout, end of the Feast of the Cross
    expect(season('2026-09-30')).toBe('Annual Days')
    expect(season('2026-10-09')).toBe('Festive Days') // 29 Tout
    expect(season('2027-02-06')).toBe('Annual Days') // 29 Toba
    expect(season('2027-06-01')).toBe('Holy 50s') // 24 Bashans, Entry into Egypt inside the Holy 50s: the season wins
  })

  it('walks Advent, the Paramoun, Nativity, Theophany Paramoun and Theophany', () => {
    expect(season('2026-11-24')).toBe('Annual Days')
    expect(getChurchSeason('2026-11-25')).toEqual({ key: 'advent', name: 'Advent', startDate: '2026-11-25', endDate: '2027-01-05' })
    expect(season('2027-01-06')).toBe('Nativity Paramoun')
    expect(season('2027-01-07')).toBe('Nativity Feast')
    expect(getChurchSeason('2027-01-08')).toMatchObject({ key: 'nativity', name: 'Nativity Period', endDate: '2027-01-17' })
    expect(season('2027-01-18')).toBe('Theophany Paramoun')
    expect(season('2027-01-19')).toBe('Theophany Feast')
    expect(season('2027-01-21')).toBe('Theophany Period') // Wedding at Cana
    expect(season('2027-01-22')).toBe('Annual Days')
  })

  it('extends the Paramoun back to Friday when the feast falls on a Sunday or Monday', () => {
    // Nativity on Monday 7 January 2030: Friday, Saturday and Sunday.
    expect(season('2030-01-03')).toBe('Advent')
    expect(getChurchSeason('2030-01-04')).toMatchObject({ key: 'nativityParamoun', startDate: '2030-01-04', endDate: '2030-01-06' })
    // Nativity on Sunday 7 January 2029: Friday and Saturday.
    expect(season('2029-01-04')).toBe('Advent')
    expect(getChurchSeason('2029-01-05')).toMatchObject({ key: 'nativityParamoun', startDate: '2029-01-05', endDate: '2029-01-06' })
  })

  it('names Jonah’s Fast and Jonah’s Passover', () => {
    expect(getChurchSeason('2027-02-22')).toEqual({ key: 'jonah', name: 'Jonah’s Fast', startDate: '2027-02-22', endDate: '2027-02-25' })
    expect(season('2027-02-25')).toBe('Jonah’s Passover')
    expect(season('2027-02-26')).toBe('Annual Days')
  })

  it('separates Great Lent, Holy Week and the Holy 50s', () => {
    expect(season('2027-03-07')).toBe('Annual Days') // Preparation Sunday, before the fast begins
    expect(getChurchSeason('2027-03-08')).toEqual({ key: 'greatLent', name: 'Great Lent', startDate: '2027-03-08', endDate: '2027-04-24' })
    expect(getChurchSeason('2027-04-25')).toEqual({ key: 'holyWeek', name: 'Holy Week', startDate: '2027-04-25', endDate: '2027-05-01' })
    expect(getChurchSeason('2027-05-02')).toEqual({ key: 'holy50', name: 'Holy 50s', startDate: '2027-05-02', endDate: '2027-06-20' })
    expect(season('2027-06-20')).toBe('Holy 50s')
  })

  it('ends the Apostles’ Fast on the eve of the Feast of the Apostles (5 Epep)', () => {
    expect(getChurchSeason('2027-06-21')).toEqual({ key: 'apostlesFast', name: 'Apostles’ Fast', startDate: '2027-06-21', endDate: '2027-07-11' })
    expect(season('2027-07-12')).toBe('Annual Days')
  })

  it('marks St. Mary’s Fast, 1–15 Mesra, with the Transfiguration inside it', () => {
    expect(season('2027-08-06')).toBe('Annual Days')
    expect(getChurchSeason('2027-08-07')).toEqual({ key: 'stMarysFast', name: 'St. Mary’s Fast', startDate: '2027-08-07', endDate: '2027-08-21' })
    expect(season('2027-08-19')).toBe('St. Mary’s Fast')
    expect(season('2027-08-22')).toBe('Annual Days')
  })

  it('names seasons in Arabic when asked', () => {
    expect(getChurchSeason('2026-10-18', 'ar').name).toBe('الأيام السنوية')
    expect(getChurchSeason('2027-05-13', 'ar').name).toBe('الخماسين المقدسة')
    expect(getChurchSeason('2027-02-25', 'ar').name).toBe('فصح يونان')
  })

  it('gives every supported day a season and a cycle', () => {
    for (let date = '1900-01-01'; date <= '2199-12-31'; date = addDaysToDateKey(date, 1)) {
      const { name } = getChurchSeason(date)
      const { label } = getReadingCycle(date)
      if (!name || !label) throw new Error(`missing season or cycle for ${date}`)
    }
  })
})

describe('the liturgical day at the church', () => {
  it('stays on the 2nd Sunday of Baba until midnight in New York, whatever the UTC date', () => {
    // 11:30 pm Sunday at the church is already Monday in UTC.
    const lateSunday = getSundaySchoolTodayDateInputValue(new Date('2026-10-19T03:30:00Z'))
    expect(lateSunday).toBe('2026-10-18')
    expect(cycle(lateSunday).label).toBe('2nd Sunday of Baba')

    const mondayMorning = getSundaySchoolTodayDateInputValue(new Date('2026-10-19T04:30:00Z'))
    expect(mondayMorning).toBe('2026-10-19')
    expect(cycle(mondayMorning).kind).toBe('annual')
  })
})
