import { describe, expect, it } from 'vitest'
import { requiresAnnualMentorUpdate } from '@/lib/annual-mentor-requirement'

describe('annual mentor renewal eligibility shared by server and roster', () => {
  it.each([
    { yearLevel: null, isActive: true, isAsyncStudent: true, expected: false },
    { yearLevel: 'YEAR_1', isActive: true, isAsyncStudent: false, expected: false },
    { yearLevel: 'YEAR_1', isActive: true, isAsyncStudent: true, expected: false },
    { yearLevel: 'YEAR_2', isActive: true, isAsyncStudent: false, expected: true },
    { yearLevel: 'YEAR_2', isActive: true, isAsyncStudent: true, expected: true },
    { yearLevel: 'YEAR_2', isActive: false, isAsyncStudent: false, expected: false },
    { yearLevel: 'YEAR_2', isActive: false, status: 'WITHDRAWN', expected: true },
    { yearLevel: 'YEAR_1', isActive: false, status: 'WITHDRAWN', expected: false },
    { yearLevel: null, isActive: false, status: 'WITHDRAWN', expected: false },
    { yearLevel: 'YEAR_2', isActive: false, status: 'GRADUATED', expected: false },
  ] as const)('requires active or withdrawn Year 2 enrollment: %o', ({ expected, ...enrollment }) => {
    expect(requiresAnnualMentorUpdate(enrollment)).toBe(expected)
  })

  it('does not require renewal without an enrollment', () => {
    expect(requiresAnnualMentorUpdate(null)).toBe(false)
    expect(requiresAnnualMentorUpdate(undefined)).toBe(false)
  })
})
