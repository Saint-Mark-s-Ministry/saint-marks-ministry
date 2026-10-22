import { describe, expect, it } from 'vitest'
import { ALL_CLASSES, resolveViewingClassId } from '@/lib/sunday-school-viewing'

describe('Sunday School "Viewing" class choice', () => {
  const ids = ['a', 'b']

  it('lets a link to a class win over the saved choice', () => {
    expect(resolveViewingClassId(ids, 'a', 'b', true)).toBe('b')
  })

  it('ignores a link or saved class the person cannot see', () => {
    expect(resolveViewingClassId(ids, 'gone', 'other', false)).toBe('a')
    expect(resolveViewingClassId(ids, 'gone', null, true)).toBe(ALL_CLASSES)
  })

  it('shows all classes by default on pages that can, and the only class when there is one', () => {
    expect(resolveViewingClassId(ids, null, null, true)).toBe(ALL_CLASSES)
    expect(resolveViewingClassId(['a'], null, null, true)).toBe('a')
    expect(resolveViewingClassId(['a'], ALL_CLASSES, null, true)).toBe('a')
  })

  it('falls back to the first class on single-class pages', () => {
    expect(resolveViewingClassId(ids, ALL_CLASSES, null, false)).toBe('a')
    expect(resolveViewingClassId([], null, null, false)).toBe('')
  })
})
