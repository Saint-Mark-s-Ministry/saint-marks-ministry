import { describe, expect, it } from 'vitest'
import { organizeAttendanceRoster } from '@stmark/domain'

const roster = [
  { id: '3', firstName: 'Zoe', lastName: 'Adams', gender: 'FEMALE' as const },
  { id: '2', firstName: 'Andrew', lastName: 'Young', gender: 'MALE' as const },
  { id: '1', firstName: 'Bella', lastName: 'Young', gender: null },
]

describe('attendance roster organization', () => {
  it('can alphabetize by first name', () => {
    const [group] = organizeAttendanceRoster(roster, {
      nameOrder: 'first',
      groupByGender: false,
    })

    expect(group.entries.map(entry => entry.firstName)).toEqual(['Andrew', 'Bella', 'Zoe'])
  })

  it('defaults the secondary sort to first name when ordering by last name', () => {
    const [group] = organizeAttendanceRoster(roster, {
      nameOrder: 'last',
      groupByGender: false,
    })

    expect(group.entries.map(entry => entry.id)).toEqual(['3', '2', '1'])
  })

  it('groups genders and preserves children without a recorded gender', () => {
    const groups = organizeAttendanceRoster(roster, {
      nameOrder: 'first',
      groupByGender: true,
    })

    expect(groups.map(group => [group.label, group.entries.map(entry => entry.id)])).toEqual([
      ['Boys', ['2']],
      ['Girls', ['3']],
      ['Gender not specified', ['1']],
    ])
  })
})
