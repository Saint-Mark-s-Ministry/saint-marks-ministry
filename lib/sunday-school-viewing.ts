'use client'

import { useSession } from 'next-auth/react'
import { useSundaySchoolAgeGroups } from '@/lib/swr'
import { defaultPriestViewing, viewingAgeGroups, type ViewingAgeGroup } from '@/lib/sunday-school-viewing-scope'
import type { SundaySchoolLevel } from '@prisma/client'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

/**
 * "Viewing": the class or age-group choice every Sunday School page follows.
 *
 * It is a display preference kept on this device, never an authority — the
 * server still re-derives what the person may see and change on every
 * request. A value is a class id, or ALL_CLASSES for pages that can list more
 * than one class at once, an age-group scope, or the priest’s overseen bands.
 */
export const ALL_CLASSES = 'all'

const STORAGE_KEY = 'sunday-school.viewing'
const CHANGE_EVENT = 'sunday-school-viewing-change'

/** The stored choice, or undefined when this browser blocks storage. */
function read(priestId?: string): string | null | undefined {
  try {
    return priestId
      ? window.sessionStorage.getItem(`${STORAGE_KEY}:${priestId}`)
      : window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return undefined
  }
}

// Only used when storage is blocked (some private windows).
let memoryValue: string | null = null
const priestMemory = new Map<string, string>()

function current(priestId?: string): string | null {
  const stored = read(priestId)
  return stored === undefined ? (priestId ? priestMemory.get(priestId) ?? null : memoryValue) : stored
}

function setViewing(value: string, priestId?: string) {
  try {
    if (priestId) window.sessionStorage.setItem(`${STORAGE_KEY}:${priestId}`, value)
    else window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    if (priestId) priestMemory.set(priestId, value)
    else memoryValue = value
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** The explicit choice, falling back to the priest’s overseen age groups. */
export function useViewing(): [string | null, (value: string) => void] {
  const { data: session } = useSession()
  // A priest starts with their own bands, never another person's device choice.
  const priestId = session?.user?.role === 'PRIEST' ? session.user.id : undefined
  const value = useSyncExternalStore(subscribe, () => current(priestId), () => null)
  const store = useCallback((next: string) => setViewing(next, priestId), [priestId])
  const { data: groups } = useSundaySchoolAgeGroups()
  const ageGroups = (groups as ViewingAgeGroup[] | undefined) ?? []
  return [value ?? defaultPriestViewing(session?.user, ageGroups), store]
}

/**
 * Picks the class a page shows: an explicit `requested` id (a link with
 * ?classId=) wins, then the stored choice, then all classes (when the page can
 * show them), then `preferred` (e.g. the class you serve), then the first class.
 */
export function resolveViewingClassId(
  classIds: string[],
  stored: string | null,
  requested: string | null | undefined,
  allowAll: boolean,
  preferred?: string | null,
): string {
  if (requested && classIds.includes(requested)) return requested
  if (stored && classIds.includes(stored)) return stored
  if (allowAll && classIds.length !== 1) return ALL_CLASSES
  if (preferred && classIds.includes(preferred)) return preferred
  return classIds[0] ?? (allowAll ? ALL_CLASSES : '')
}

export function useViewingClassId<T extends { id: string; level?: SundaySchoolLevel }>(
  classes: T[] | undefined,
  { requested, allowAll = false, preferred }: { requested?: string | null; allowAll?: boolean; preferred?: string | null } = {},
): [string, (value: string) => void, T[], boolean] {
  const [stored, store] = useViewing()
  const { data: groups } = useSundaySchoolAgeGroups()
  const { data: session } = useSession()
  const { scopedClasses, hasAgeGroupScope } = useMemo(() => {
    const bands = viewingAgeGroups(stored, (groups as ViewingAgeGroup[] | undefined) ?? [], session?.user?.id)
    return {
      scopedClasses: bands ? (classes ?? []).filter(cls => bands.some(band => cls.level && band.levels.includes(cls.level))) : (classes ?? []),
      hasAgeGroupScope: bands !== null,
    }
  }, [classes, groups, session?.user?.id, stored])
  const waitingForDefault = session?.user?.role === 'PRIEST' && groups === undefined
  const classIds = scopedClasses.map(cls => cls.id)
  // Explicit links may leave the age-group scope.
  const allIds = (classes ?? []).map(cls => cls.id)
  // A link to a class applies once; after that the Viewing picker is in charge again.
  const [appliedRequest, setAppliedRequest] = useState<string | null>(null)
  const pending = requested && requested !== appliedRequest && allIds.includes(requested) ? requested : null
  const value = resolveViewingClassId(pending ? allIds : classIds, stored, pending, allowAll, preferred)

  useEffect(() => {
    if (pending) {
      setAppliedRequest(pending)
      if (stored !== pending) store(pending)
      return
    }
    // A one-class page showing "All classes" picks a class; save it so the
    // picker says what the page shows. A specific class chosen elsewhere is
    // left alone, so pages that list only some classes never fight over it.
    if (!waitingForDefault && !allowAll && value && (stored === null || stored === ALL_CLASSES)) store(value)
  }, [allowAll, pending, store, stored, value, waitingForDefault])

  return [value, store, pending ? (classes ?? []) : scopedClasses, !pending && hasAgeGroupScope]
}
