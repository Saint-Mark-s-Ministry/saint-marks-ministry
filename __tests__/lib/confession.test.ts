import { describe, it, expect } from 'vitest'
import { getConfessionPeriods, getConfessionPeriodStatus, getStudentStart, formatConfessionPeriod, canStudentUploadConfessionSlip, CONFESSION_SLIP_TEMPLATE_URL } from '@/lib/confession'

const year = { startDate: '2025-09-01T00:00:00.000Z', endDate: '2026-06-30T00:00:00.000Z' }

describe('confession periods', () => {
  it('splits an academic year into 2-month batches', () => {
    const periods = getConfessionPeriods(year)
    expect(periods.map(formatConfessionPeriod)).toEqual([
      'Sep–Oct 2025', 'Nov–Dec 2025', 'Jan–Feb 2026', 'Mar–Apr 2026', 'May–Jun 2026',
    ])
    expect(periods[4].end.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })

  it('counts the registration period, then requires slips', () => {
    const [sepOct, novDec, janFeb, marApr] = getConfessionPeriods(year)
    const start = getStudentStart({ academicYear: { startDate: year.startDate }, enrolledAt: '2025-07-15' })
    const now = new Date('2026-01-10T00:00:00.000Z')

    expect(getConfessionPeriodStatus(sepOct, start, false, now)).toBe('registration')
    expect(getConfessionPeriodStatus(novDec, start, false, now)).toBe('missing')
    expect(getConfessionPeriodStatus(novDec, start, true, now)).toBe('slip')
    expect(getConfessionPeriodStatus(janFeb, start, false, now)).toBe('due')
    expect(getConfessionPeriodStatus(marApr, start, false, now)).toBe('upcoming')
  })

  it('uses the late-start date so earlier periods are N/A', () => {
    const [sepOct, novDec] = getConfessionPeriods(year)
    const start = getStudentStart({ attendanceStartDate: '2025-11-20', academicYear: { startDate: year.startDate }, enrolledAt: '2025-11-18' })

    expect(getConfessionPeriodStatus(sepOct, start, false)).toBe('na')
    expect(getConfessionPeriodStatus(novDec, start, false)).toBe('registration')
  })

  it('ignores a late enrolledAt from bulk-created accounts', () => {
    const [sepOct, novDec] = getConfessionPeriods(year)
    const start = getStudentStart({ academicYear: { startDate: year.startDate }, enrolledAt: '2025-12-05' })
    const now = new Date('2026-01-10')

    expect(getConfessionPeriodStatus(sepOct, start, false, now)).toBe('registration')
    expect(getConfessionPeriodStatus(novDec, start, false, now)).toBe('missing')
  })

  it('gives a second-year student no registration period in their second year', () => {
    const start = getStudentStart({ academicYear: { startDate: '2024-09-01' }, enrolledAt: '2024-08-01' })
    const [sepOct] = getConfessionPeriods(year)
    expect(getConfessionPeriodStatus(sepOct, start, false, new Date('2026-01-01'))).toBe('missing')
  })
})

describe('student confession uploads', () => {
  it('lets students upload only for open or ended periods', () => {
    expect(canStudentUploadConfessionSlip('due')).toBe(true)
    expect(canStudentUploadConfessionSlip('missing')).toBe(true)
    for (const status of ['registration', 'upcoming', 'na', 'slip'] as const) {
      expect(canStudentUploadConfessionSlip(status)).toBe(false)
    }
  })

  it('links the blank slip as a read-only preview, never the editor', () => {
    expect(CONFESSION_SLIP_TEMPLATE_URL).toMatch(/^https:\/\/docs\.google\.com\/document\/d\/[\w-]+\/preview$/)
  })
})
