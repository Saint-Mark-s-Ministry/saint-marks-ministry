import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ALL_CLASSES, resolveViewingClassId, useViewingClassId } from '@/lib/sunday-school-viewing'

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

describe('useViewingClassId', () => {
  const classes = [{ id: 'a' }, { id: 'b' }]

  beforeEach(() => window.localStorage.clear())

  it('applies a class link once, then lets the picker change the class', async () => {
    const { result } = renderHook(() => useViewingClassId(classes, { requested: 'a' }))
    expect(result.current[0]).toBe('a')
    await waitFor(() => expect(window.localStorage.getItem('sunday-school.viewing')).toBe('a'))

    act(() => result.current[1]('b'))
    expect(result.current[0]).toBe('b')
    expect(window.localStorage.getItem('sunday-school.viewing')).toBe('b')
  })

  it('saves the class a one-class page shows when the choice was "All classes"', async () => {
    window.localStorage.setItem('sunday-school.viewing', ALL_CLASSES)
    const { result } = renderHook(() => useViewingClassId(classes, { preferred: 'b' }))
    expect(result.current[0]).toBe('b')
    await waitFor(() => expect(window.localStorage.getItem('sunday-school.viewing')).toBe('b'))
  })

  it('leaves a specific class chosen elsewhere alone on a page that lists other classes', async () => {
    window.localStorage.setItem('sunday-school.viewing', 'elsewhere')
    const { result } = renderHook(() => useViewingClassId(classes))
    expect(result.current[0]).toBe('a')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(window.localStorage.getItem('sunday-school.viewing')).toBe('elsewhere')
  })
})
