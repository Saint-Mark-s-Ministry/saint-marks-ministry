import { describe, expect, it } from 'vitest'
import { comparePersonNames, getPersonInitials } from '@/lib/person-name'

describe('comparePersonNames', () => {
  const names = ['Zoe Adel', 'Mina Youssef', '  anna   Adel ', 'Mina Adel', 'Mariam']

  it('alphabetizes full names without treating case or extra spaces differently', () => {
    expect([...names].sort((a, b) => comparePersonNames(a, b, 'first'))).toEqual([
      '  anna   Adel ', 'Mariam', 'Mina Adel', 'Mina Youssef', 'Zoe Adel',
    ])
  })

  it('sorts by the final name, breaking ties by the full name and allowing single names', () => {
    expect([...names].sort((a, b) => comparePersonNames(a, b, 'last'))).toEqual([
      '  anna   Adel ', 'Mina Adel', 'Zoe Adel', 'Mariam', 'Mina Youssef',
    ])
    expect(comparePersonNames('Mina George Adel', 'Anna Youssef', 'last')).toBeLessThan(0)
  })
})

describe('getPersonInitials', () => {
  it('ignores clerical titles and uses the first and last meaningful names', () => {
    expect(getPersonInitials('Very Rev. Fr. Markos Ayoub')).toBe('MA')
    expect(getPersonInitials('Rev. Fr. Daniel Abdel-Maseih')).toBe('DA')
  })

  it('uses compact initials for ordinary and single-word names', () => {
    expect(getPersonInitials('Joshua Kaisar')).toBe('JK')
    expect(getPersonInitials('Mina')).toBe('M')
  })

  it('provides a fallback for an empty name', () => {
    expect(getPersonInitials(null)).toBe('??')
    expect(getPersonInitials('   ')).toBe('??')
  })
})
