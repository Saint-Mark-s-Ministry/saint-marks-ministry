import { describe, expect, it } from 'vitest'
import {
  hasSundaySchoolFamilyDetails,
  normalizeSundaySchoolFamilyDetails,
} from '@/lib/sunday-school-family'

describe('Sunday School family details', () => {
  it('trims family, parent, and address fields', () => {
    expect(normalizeSundaySchoolFamilyDetails({
      name: '  Girgis Family ',
      homeAddress: ' 125 St. Mark Way ',
      motherName: ' Mariam Girgis ',
      motherPhone: ' 555-0191 ',
      fatherEmail: ' Nader@Example.COM ',
    })).toEqual({
      name: 'Girgis Family',
      homeAddress: '125 St Mark Way',
      motherName: 'Mariam Girgis',
      motherPhone: '555-0191',
      motherEmail: null,
      fatherName: null,
      fatherPhone: null,
      fatherEmail: 'nader@example.com',
    })
  })

  it('normalizes blank fields to null', () => {
    const details = normalizeSundaySchoolFamilyDetails({ name: '   ' })

    expect(details).toEqual({
      name: null,
      homeAddress: null,
      motherName: null,
      motherPhone: null,
      motherEmail: null,
      fatherName: null,
      fatherPhone: null,
      fatherEmail: null,
    })
    expect(hasSundaySchoolFamilyDetails(details)).toBe(false)
  })

  it('rejects non-object family data', () => {
    expect(normalizeSundaySchoolFamilyDetails('Girgis Family')).toBeNull()
    expect(normalizeSundaySchoolFamilyDetails(null)).toBeNull()
  })
})
