import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SundaySchoolLevel } from '@prisma/client'
import type { ViewingAgeGroup } from '@/lib/sunday-school-viewing-scope'
const state = vi.hoisted(() => ({ groups: undefined as ViewingAgeGroup[] | undefined }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'isaac', role: 'PRIEST' } } }) }))
vi.mock('@/lib/swr', () => ({ useSundaySchoolAgeGroups: () => ({ data: state.groups }) }))
import { ALL_CLASSES, useViewing, useViewingClassId } from '@/lib/sunday-school-viewing'
const classes = [{ id: 'nine', level: SundaySchoolLevel.GRADE_9 }, { id: 'ten', level: SundaySchoolLevel.GRADE_10 }, { id: 'one', level: SundaySchoolLevel.GRADE_1 }]
const groups = [{ id: 'high', name: 'High School', overseerId: 'isaac', levels: [SundaySchoolLevel.GRADE_9, SundaySchoolLevel.GRADE_10] }]
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); state.groups = groups })
describe('priest Back navigation defaults', () => {
  it('keeps a linked class local and returns Home to High School', () => {
    const detail = renderHook(() => ({ page: useViewingClassId(classes, { requested: 'ten' }), global: useViewing() }))
    expect(detail.result.current.page[0]).toBe('ten')
    expect(detail.result.current.global[0]).toBe('age-group:high')
    detail.rerender()
    expect(detail.result.current.page[0]).toBe('ten')
    detail.unmount()
    const home = renderHook(() => useViewingClassId(classes, { allowAll: true }))
    expect(home.result.current[2].map(c => c.id)).toEqual(['nine', 'ten'])
  })
  it('honors an intentional picker change after opening a link', () => {
    const { result } = renderHook(() => ({ page: useViewingClassId(classes, { requested: 'ten' }), global: useViewing() }))
    act(() => result.current.global[1]('nine'))
    expect(result.current.page[0]).toBe('nine')
    act(() => result.current.global[1]('age-group:high'))
    expect(result.current.page[0]).toBe('nine')
  })
  it('does not promote a fallback class over an explicit All choice', () => {
    const { result } = renderHook(() => ({ page: useViewingClassId(classes), global: useViewing() }))
    act(() => result.current.global[1](ALL_CLASSES))
    expect(result.current.page[0]).toBe('nine')
    expect(result.current.global[0]).toBe(ALL_CLASSES)
  })
  it('ignores the legacy incidental class preference', () => {
    window.sessionStorage.setItem('sunday-school.viewing:isaac', 'ten')
    const { result } = renderHook(() => useViewing())
    expect(result.current[0]).toBe('age-group:high')
  })
  it('keeps a requested class while the overseer default finishes loading', () => {
    state.groups = undefined
    const { result, rerender } = renderHook(() => ({ page: useViewingClassId(classes, { requested: 'ten' }), global: useViewing() }))
    expect(result.current.page[0]).toBe('ten')
    state.groups = groups; rerender()
    expect(result.current.page[0]).toBe('ten')
    expect(result.current.global[0]).toBe('age-group:high')
  })
  it('reapplies a class URL after navigating away from that URL', () => {
    const { result, rerender } = renderHook(({ requested }) => useViewingClassId(classes, { requested }), { initialProps: { requested: 'ten' as string | null } })
    expect(result.current[0]).toBe('ten')
    rerender({ requested: null })
    expect(result.current[0]).toBe('nine')
    rerender({ requested: 'ten' })
    expect(result.current[0]).toBe('ten')
  })
})
