import { describe, expect, it } from 'vitest'
import {
  createSundaySchoolRosterCsvTemplate,
  parseSundaySchoolRosterCsv,
} from '@/lib/sunday-school-roster-csv'

describe('Sunday School roster CSV parsing', () => {
  it('parses the supported columns and normalizes common dates and emails', () => {
    const result = parseSundaySchoolRosterCsv([
      'first_name,last_name,gender,birth_date,guardian_name,guardian_phone,guardian_email,notes',
      'Jane,Doe,Girl,4/12/2015,John Doe,555-1234,PARENT@EXAMPLE.COM,"Needs, inhaler"',
    ].join('\n'))

    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([{
      rowNumber: 2,
      firstName: 'Jane',
      lastName: 'Doe',
      gender: 'FEMALE',
      birthDate: '2015-04-12',
      guardianName: 'John Doe',
      guardianPhone: '555-1234',
      guardianEmail: 'parent@example.com',
      notes: 'Needs, inhaler',
    }])
  })

  it('supports a full-name column and escaped quotes', () => {
    const result = parseSundaySchoolRosterCsv('full_name,notes\n"Mary Ann Smith","Says ""hello"""')

    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({
      firstName: 'Mary Ann',
      lastName: 'Smith',
      notes: 'Says "hello"',
    })
  })

  it('reports row-level validation errors before upload', () => {
    const result = parseSundaySchoolRosterCsv([
      'first_name,last_name,birth_date,guardian_email',
      'Jane,,2026-02-31,not-an-email',
    ].join('\n'))

    expect(result.errors.map(error => error.message)).toEqual([
      'Last name is required',
      'Birth date must be YYYY-MM-DD or MM/DD/YYYY',
      'Guardian email is invalid',
    ])
  })

  it('rejects unsupported gender values', () => {
    const result = parseSundaySchoolRosterCsv('first_name,last_name,gender\nJane,Doe,Unknown')
    expect(result.errors.map(error => error.message)).toContain(
      'Gender must be Male, Female, Boy, or Girl'
    )
  })

  it('provides a template that round-trips through the parser', () => {
    const result = parseSundaySchoolRosterCsv(createSundaySchoolRosterCsvTemplate())
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(1)
  })
})
