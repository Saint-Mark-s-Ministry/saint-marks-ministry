import { describe, expect, it } from 'vitest'
import { normalizeFamilyPhone, planFamilyMatches } from '@/lib/sunday-school-family-matching'
import { normalizeSundaySchoolFamilyDetails } from '@/lib/sunday-school-family'

const family = (id: string, details: Record<string, string> = {}) => ({
  ...normalizeSundaySchoolFamilyDetails(details)!, id,
  createdAt: new Date(id === 'a' ? '2025-01-01' : '2026-01-01'), matchingHistory: null,
})
const child = (id: string, familyId: string | null, guardianPhone: string | null = null) => ({ id, familyId, guardianPhone })

describe('family phone matching', () => {
  it.each(['(201) 555-0123', '201.555.0123', '+1 201 555 0123', '0012015550123'])('normalizes %s', phone => {
    expect(normalizeFamilyPhone(phone)).toBe('12015550123')
  })
  it.each(['', '555-0123', '12345678', '123456789', '0000000000', '1111111111', '2015550123 / 2015550124', '2015550123 ext 2'])('ignores empty, incomplete or ambiguous phone %s', phone => {
    expect(normalizeFamilyPhone(phone)).toBeNull()
  })
  it('keeps international country codes distinct', () => {
    expect(normalizeFamilyPhone('+20 100 123 4567')).toBe('201001234567')
    expect(normalizeFamilyPhone('+44 20 5555 0123')).not.toBe(normalizeFamilyPhone('+1 201 555 0123'))
  })
  it('connects Johnny and Henry despite different parent names and fills the missing address once', () => {
    const plans = planFamilyMatches([
      family('a', { motherPhone: '2015550123', motherName: 'Mary', homeAddress: '123 Main St' }),
      family('b', { motherPhone: '+1 (201) 555-0123', motherName: 'Mery' }),
    ], [child('Johnny', 'a'), child('Henry', 'b')])
    expect(plans).toHaveLength(1)
    expect(plans[0].canonical?.id).toBe('a')
    expect(plans[0].details.homeAddress).toBe('123 Main St')
    expect(plans[0].linkedChildren.map(c => c.id)).toEqual(['Henry'])
    expect(plans[0].conflicts).toEqual([{ field: 'motherName', values: ['Mary', 'Mery'] }])
  })
  it('fills a blank canonical address from another child’s family', () => {
    const [plan] = planFamilyMatches([
      family('a', { fatherPhone: '2015550123' }),
      family('b', { fatherPhone: '2015550123', homeAddress: '123 Main St' }),
    ], [child('Johnny', 'a'), child('Henry', 'b')])
    expect(plan.filled).toContainEqual({ field: 'homeAddress', sourceFamilyId: 'b' })
  })
  it('preserves different addresses and reports both while still connecting the family', () => {
    const [plan] = planFamilyMatches([
      family('a', { fatherPhone: '2015550123', homeAddress: '1 Main St' }),
      family('b', { motherPhone: '2015550123', homeAddress: '2 Main St' }),
    ], [child('Johnny', 'a'), child('Henry', 'b')])
    expect(plan.details.homeAddress).toBe('1 Main St')
    expect(plan.conflicts).toContainEqual({ field: 'homeAddress', values: ['1 Main St', '2 Main St'] })
    expect(plan.linkedChildren).toHaveLength(1)
  })
  it('handles transitive matches through either parent and legacy guardian phone', () => {
    const [plan] = planFamilyMatches([
      family('a', { motherPhone: '2015550123', fatherPhone: '2015550124' }),
      family('b', { fatherPhone: '2015550123' }),
    ], [child('one', 'a'), child('two', 'b'), child('three', null, '2015550124')], ['three'])
    expect(plan.children.map(c => c.id).sort()).toEqual(['one', 'three', 'two'])
  })
  it('does not match by name, address or partial phone', () => {
    expect(planFamilyMatches([
      family('a', { name: 'Same', homeAddress: '1 Main St', motherPhone: '2015550123' }),
      family('b', { name: 'Same', homeAddress: '1 Main St', motherPhone: '3055550123' }),
    ], [child('one', 'a'), child('two', 'b')])).toEqual([])
  })
  it('uses contact numbers from active linked guardian profiles', () => {
    const [plan] = planFamilyMatches([family('a', { fatherPhone: '2015550123' })], [
      child('one', 'a'), { ...child('two', null), parentPhones: ['+1 (201) 555-0123'] },
    ])
    expect(plan.linkedChildren.map(c => c.id)).toEqual(['two'])
  })
  it('does not fill a blank address from conflicting sources or touch unrelated components', () => {
    const [plan] = planFamilyMatches([
      family('a', { motherPhone: '2015550123' }),
      family('b', { motherPhone: '2015550123', homeAddress: '1 Main St' }),
      family('c', { motherPhone: '2015550123', homeAddress: '2 Main St' }),
      family('d', { fatherPhone: '3055550123' }), family('e', { fatherPhone: '3055550123' }),
    ], [child('one', 'a'), child('two', 'b'), child('three', 'c'), child('four', 'd'), child('five', 'e')], ['one'])
    expect(plan.details.homeAddress).toBeNull()
    expect(plan.children).toHaveLength(3)
  })
  it('creates one family for legacy siblings without inventing a parent name or gender', () => {
    const [plan] = planFamilyMatches([], [child('one', null, '2015550123'), child('two', null, '+1 2015550123')])
    expect(plan.canonical).toBeNull()
    expect(plan.details.motherName).toBeNull()
    expect(plan.details.fatherName).toBeNull()
    expect(planFamilyMatches([], [child('one', null, '2015550123')])).toEqual([])
  })
})
