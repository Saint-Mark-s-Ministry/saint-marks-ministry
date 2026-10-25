import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { SundaySchoolLevel } from '@prisma/client'
import { defaultPriestViewing, ageGroupViewingValue, type ViewingAgeGroup } from '@/lib/sunday-school-viewing-scope'
import { ALL_CLASSES, resolveViewingClassId, useViewingClassId } from '@/lib/sunday-school-viewing'

const state = vi.hoisted(() => ({ user: undefined as { id: string; role: string } | undefined, groups: [] as ViewingAgeGroup[] | undefined }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: state.user } }) }))
vi.mock('@/lib/swr', () => ({ useSundaySchoolAgeGroups: () => ({ data: state.groups }) }))

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

  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    state.user = undefined
    state.groups = []
  })

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

describe('priest age-group defaults', () => {
  const priest = { id: 'priest', role: 'PRIEST' }
  const groups: ViewingAgeGroup[] = [
    { id: 'elementary', name: 'Elementary', levels: [SundaySchoolLevel.GRADE_1], overseerId: priest.id },
    { id: 'high', name: 'High School', levels: [SundaySchoolLevel.GRADE_9], overseerId: 'other' },
  ]
  const classes = [{ id: 'a', level: SundaySchoolLevel.GRADE_1 }, { id: 'b', level: SundaySchoolLevel.GRADE_9 }]

  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    state.user = priest
    state.groups = groups
  })

  it('defaults to the overseen band, ignoring inactive bands and other roles', () => {
    expect(defaultPriestViewing(priest, groups)).toBe(ageGroupViewingValue('elementary'))
    expect(defaultPriestViewing(priest, groups.map(g => ({ ...g, isActive: false })))).toBeNull()
    expect(defaultPriestViewing({ ...priest, role: 'SUPER_ADMIN' }, groups)).toBeNull()
    expect(defaultPriestViewing({ ...priest, id: 'unassigned' }, groups)).toBeNull()
  })

  it('ignores an old Elementary choice stored on the device', () => {
    window.localStorage.setItem('sunday-school.viewing', 'a')
    state.groups = [groups[1]].map(group => ({ ...group, overseerId: priest.id }))
    const { result } = renderHook(() => useViewingClassId(classes, { allowAll: true }))
    expect(result.current[2].map(c => c.id)).toEqual(['b'])
  })

  it('scopes the default, allows all classes, and honors explicit class links', () => {
    const { result, rerender } = renderHook(({ requested }) => useViewingClassId(classes, { allowAll: true, requested }), { initialProps: { requested: null as string | null } })
    expect(result.current[2].map(c => c.id)).toEqual(['a'])
    act(() => result.current[1](ALL_CLASSES))
    expect(result.current[2].map(c => c.id)).toEqual(['a', 'b'])
    rerender({ requested: 'b' })
    expect(result.current[0]).toBe('b')
  })

  it('shows everything when the priest has no age group', () => {
    state.user = { ...priest, id: 'unassigned' }
    const { result } = renderHook(() => useViewingClassId(classes, { allowAll: true }))
    expect(result.current[0]).toBe(ALL_CLASSES)
    expect(result.current[2]).toEqual(classes)
  })

  it('includes every band when a priest oversees several', () => {
    state.groups = groups.map(g => ({ ...g, overseerId: priest.id }))
    const { result } = renderHook(() => useViewingClassId(classes, { allowAll: true }))
    expect(result.current[0]).toBe(ALL_CLASSES)
    expect(result.current[2]).toEqual(classes)
  })

  it('does not save an arbitrary class while age groups are loading', () => {
    state.groups = undefined
    const { result, rerender } = renderHook(() => useViewingClassId(classes))
    expect(window.localStorage.getItem('sunday-school.viewing')).toBeNull()
    state.groups = [groups[1]].map(g => ({ ...g, overseerId: priest.id }))
    rerender()
    expect(result.current[0]).toBe('b')
    expect(window.localStorage.getItem('sunday-school.viewing')).toBeNull()
  })
})
