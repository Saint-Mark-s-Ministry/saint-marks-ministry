import { describe, expect, it } from 'vitest'
import { matchCheckInName } from '@/lib/sunday-school-check-in-name'
const roster = [{ id: 'one', firstName: 'Mary Ann', lastName: 'Abdel Malak' }, { id: 'two', firstName: 'Mina', lastName: 'Mark' }]
describe('full-name QR matching', () => {
  it('handles multipart names, case and extra spaces without guessing the name split', () => {
    expect(matchCheckInName(roster, '  MARY   ANN  Abdel Malak ')).toBe('one')
    expect(matchCheckInName(roster, 'Mina Mark')).toBe('two')
    expect(matchCheckInName(roster, 'Mina')).toBeNull()
    expect(matchCheckInName(roster, 'Unknown Child')).toBeNull()
  })
  it('refuses ambiguous combined names even when stored first/last splits differ', () => {
    expect(matchCheckInName([...roster, { id: 'three', firstName: 'Mary', lastName: 'Ann Abdel Malak' }], 'Mary Ann Abdel Malak')).toBeNull()
  })
})
