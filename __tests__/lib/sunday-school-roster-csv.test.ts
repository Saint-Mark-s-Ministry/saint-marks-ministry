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
    expect(result.rows).toMatchObject([{
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

  it('imports child and household details using readable column headings', () => {
    const result = parseSundaySchoolRosterCsv([
      'Student Name,Child Phone,Father of Confession,Home Address,Mother Name,Mother Phone,Mother Email,Father Name,Father Phone,Father Email',
      'Jane Doe,555-1111,Fr. Mark,123 Main St,Mary Doe,555-2222,MOM@EXAMPLE.COM,John Doe,555-3333,DAD@EXAMPLE.COM',
    ].join('\n'))
    expect(result.errors).toEqual([])
    expect(result.ignoredColumns).toEqual([])
    expect(result.rows[0]).toMatchObject({
      firstName: 'Jane', lastName: 'Doe', cellPhone: '555-1111',
      fatherOfConfession: 'Fr. Mark', homeAddress: '123 Main St',
      motherName: 'Mary Doe', motherPhone: '555-2222', motherEmail: 'mom@example.com',
      fatherName: 'John Doe', fatherPhone: '555-3333', fatherEmail: 'dad@example.com',
    })
  })

  it('makes unrecognized columns visible rather than silently losing them', () => {
    const result = parseSundaySchoolRosterCsv('full_name,Emergency contact\nJane Doe,555-1234')
    expect(result.ignoredColumns).toEqual(['Emergency contact'])
  })

  it('validates parent emails and phone lengths before import', () => {
    const result = parseSundaySchoolRosterCsv(`full_name,mother_email,child_phone\nJane Doe,invalid,${'1'.repeat(51)}`)
    expect(result.errors.map(error => error.message)).toEqual([
      "Child's phone must be 50 characters or fewer", 'Mother email is invalid',
    ])
  })

  it('provides a template that round-trips through the parser', () => {
    const result = parseSundaySchoolRosterCsv(createSundaySchoolRosterCsvTemplate())
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(1)
  })
})
