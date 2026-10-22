'use client'

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'

/**
 * "Viewing": the one class choice every Sunday School page follows.
 *
 * It is a display preference kept on this device, never an authority — the
 * server still re-derives what the person may see and change on every
 * request. A value is a class id, or ALL_CLASSES for pages that can list more
 * than one class at once.
 */
export const ALL_CLASSES = 'all'

const STORAGE_KEY = 'sunday-school.viewing'
const CHANGE_EVENT = 'sunday-school-viewing-change'

/** The stored choice, or undefined when this browser blocks storage. */
function read(): string | null | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return undefined
  }
}

// Only used when storage is blocked (some private windows).
let memoryValue: string | null = null

function current(): string | null {
  const stored = read()
  return stored === undefined ? memoryValue : stored
}

export function setViewing(value: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    memoryValue = value
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

/** The stored choice (null until someone picks), shared by every component. */
export function useViewing(): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(subscribe, current, () => null)
  return [value, setViewing]
}

/**
 * Picks the class a page shows: an explicit `requested` id (a link with
 * ?classId=) wins and becomes the new choice, then the stored choice, then
 * all classes (when the page can show them) or the first class.
 */
export function resolveViewingClassId(
  classIds: string[],
  stored: string | null,
  requested: string | null | undefined,
  allowAll: boolean,
): string {
  if (requested && classIds.includes(requested)) return requested
  if (stored && classIds.includes(stored)) return stored
  if (allowAll && classIds.length !== 1) return ALL_CLASSES
  return classIds[0] ?? (allowAll ? ALL_CLASSES : '')
}

export function useViewingClassId(
  classes: Array<{ id: string }> | undefined,
  { requested, allowAll = false }: { requested?: string | null; allowAll?: boolean } = {},
): [string, (value: string) => void] {
  const [stored, store] = useViewing()
  const classIds = useMemo(() => (classes ?? []).map(cls => cls.id), [classes])
  const value = resolveViewingClassId(classIds, stored, requested, allowAll)

  // Following a link to a specific class makes that class the choice everywhere.
  useEffect(() => {
    if (requested && classIds.includes(requested) && stored !== requested) store(requested)
  }, [requested, classIds, stored, store])

  const update = useCallback((next: string) => store(next), [store])
  return [value, update]
}
