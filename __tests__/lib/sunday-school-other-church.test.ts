import { describe, expect, it } from 'vitest'
import { otherChurchFields } from '@/lib/sunday-school-other-church'

describe('other church fields', () => {
  it('preserves omitted fields on partial updates', () => {
    expect(otherChurchFields.parse({ notes: 'unrelated' })).toEqual({})
  })
  it('allows a reported church without knowing its name', () => {
    expect(otherChurchFields.parse({ attendsOtherChurch: true })).toEqual({ attendsOtherChurch: true })
  })
  it('trims names and marks named churches', () => {
    expect(otherChurchFields.parse({ otherChurchName: '  Synthetic Church  ' })).toEqual({ attendsOtherChurch: true, otherChurchName: 'Synthetic Church' })
  })
  it('clears the name when unmarking, including a stale submitted name', () => {
    expect(otherChurchFields.parse({ attendsOtherChurch: false, otherChurchName: 'Old Church' })).toEqual({ attendsOtherChurch: false, otherChurchName: null })
  })
  it('clears blank or null names without removing the marker', () => {
    for (const otherChurchName of ['  ', null]) {
      expect(otherChurchFields.parse({ attendsOtherChurch: true, otherChurchName })).toEqual({ attendsOtherChurch: true, otherChurchName: null })
    }
  })
  it('accepts the length limit and rejects invalid types and oversized names', () => {
    expect(otherChurchFields.safeParse({ otherChurchName: 'a'.repeat(200) }).success).toBe(true)
    for (const fields of [{ attendsOtherChurch: 'false' }, { attendsOtherChurch: null }, { otherChurchName: 123 }, { otherChurchName: 'a'.repeat(201) }]) {
      expect(otherChurchFields.safeParse(fields).success).toBe(false)
    }
  })
})
