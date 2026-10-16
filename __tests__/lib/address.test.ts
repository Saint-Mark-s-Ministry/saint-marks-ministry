import { describe, expect, it } from 'vitest'
import { normalizeHomeAddress } from '@/lib/address'
import { normalizeSundaySchoolFamilyDetails } from '@/lib/sunday-school-family'
import { parseSundaySchoolRosterCsv } from '@/lib/sunday-school-roster-csv'

describe('address formatting', () => {
  it.each([
    ['  37 suburbia dr. jersey city, nj 07305  ', '37 Suburbia Dr, Jersey City, NJ 07305'],
    ['156 summit avenue apt. 2l jersey city nj 07304', '156 Summit Ave, Apt 2L, Jersey City, NJ 07304'],
    ['413 union street, jc, nj 07304', '413 Union St, Jersey City, NJ 07304'],
    ['717 watchung avenue', '717 Watchung Ave'],
    ['85 w 55TH st. bayonne nj, 07002', '85 W 55th St, Bayonne, NJ 07002'],
    ['110 williams ave apt 2 L, jersey city nj 07304', '110 Williams Ave, Apt 2 L, Jersey City, NJ 07304'],
    ['775 n broad st, apt a207, elizabeth new jersey 07208', '775 N Broad St, Apt A207, Elizabeth, NJ 07208'],
    ['1024 john f kennedy blvd', '1024 John F Kennedy Blvd'],
    ['175 mcadoo ave,, jersey city, nj 07304', '175 McAdoo Ave, Jersey City, NJ 07304'],
    ['158virginia ave jc nj 07304', '158 Virginia Ave, Jersey City, NJ 07304'],
    ['37 suburbia dr', '37 Suburbia Dr'],
    ['151 Highland Ave, NJ 078306', '151 Highland Ave, NJ 078306'],
    ['7 or 12 terhune ave, jc, nj', '7 or 12 Terhune Ave, Jersey City, NJ'],
    ['confidential', 'Confidential'],
    ['100 main st, boston ma 02108', '100 Main St, Boston, MA 02108'],
  ])('formats %s without inventing address details', (input, expected) => {
    const result = normalizeHomeAddress(input)
    expect(result).toBe(expected)
    expect(normalizeHomeAddress(result)).toBe(result)
    expect(result?.match(/\d+/g)).toEqual(input.match(/\d+/g))
  })

  it.each([undefined, null, 123, '', '  \n '])('treats an absent address as empty', value => {
    expect(normalizeHomeAddress(value)).toBeNull()
  })

  it('uses the same formatting for manual family saves and CSV previews', () => {
    const address = '156 summit avenue apt. 2l jersey city nj 07304'
    const family = normalizeSundaySchoolFamilyDetails({ homeAddress: address })
    const csv = parseSundaySchoolRosterCsv(`first_name,last_name,home_address\nKaren,Milad,${address}`)
    expect(csv.errors).toEqual([])
    expect(family?.homeAddress).toBe('156 Summit Ave, Apt 2L, Jersey City, NJ 07304')
    expect(csv.rows[0].homeAddress).toBe(family?.homeAddress)
  })
})
