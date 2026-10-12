'use client'

import { useCallback, useEffect, useState } from 'react'
import { CONTACT_BOOK_ROLE_OPTIONS } from '@/lib/contact-book-roles'
import type { ContactBookFilters } from '@/lib/contact-book-filters'
import { LEVEL_ORDER } from '@/lib/sunday-school-class'

const FILTER_STORAGE_PREFIX = 'contact-book-filters:'

export const DEFAULT_CONTACT_BOOK_FILTERS: ContactBookFilters = { search: '', role: '', grade: '', sort: 'name' }

function restoreFilters(saved: string | null): ContactBookFilters {
  const value: unknown = saved ? JSON.parse(saved) : null
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_CONTACT_BOOK_FILTERS
  const filters = value as Record<string, unknown>
  return {
    search: typeof filters.search === 'string' ? filters.search : '',
    role: CONTACT_BOOK_ROLE_OPTIONS.find(option => option.value === filters.role)?.value ?? '',
    grade: filters.grade === 'UNASSIGNED' ? 'UNASSIGNED' : LEVEL_ORDER.find(level => level === filters.grade) ?? '',
    sort: filters.sort === 'grade' ? 'grade' : 'name',
  }
}

/** Preserve selections across refreshes within the current visit and browser tab. */
export function useContactBookFilters(userId: string | undefined) {
  const [preferences, setPreferences] = useState<{ userId?: string; filters: ContactBookFilters }>({ filters: DEFAULT_CONTACT_BOOK_FILTERS })
  const filters = preferences.userId === userId ? preferences.filters : DEFAULT_CONTACT_BOOK_FILTERS

  useEffect(() => {
    let restored = DEFAULT_CONTACT_BOOK_FILTERS
    if (userId) {
      try {
        restored = restoreFilters(window.sessionStorage.getItem(`${FILTER_STORAGE_PREFIX}${userId}`))
      } catch {
        // Invalid saved data or unavailable storage should not prevent filtering.
      }
    }
    setPreferences({ userId, filters: restored })
  }, [userId])

  const updateFilters = useCallback((updates: Partial<ContactBookFilters>) => {
    const next = { ...filters, ...updates }
    setPreferences({ userId, filters: next })
    if (userId) {
      try {
        window.sessionStorage.setItem(`${FILTER_STORAGE_PREFIX}${userId}`, JSON.stringify(next))
      } catch {
        // The controls still work when preferences cannot be persisted.
      }
    }
  }, [filters, userId])

  return { filters, updateFilters, isReady: !userId || preferences.userId === userId }
}

/** Called by the persistent app shell when the user leaves the contact book. */
export function clearContactBookFilters() {
  try {
    const keys = Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index))
    for (const key of keys) {
      if (key?.startsWith(FILTER_STORAGE_PREFIX)) window.sessionStorage.removeItem(key)
    }
  } catch {
    // Unavailable preference storage must not interrupt navigation.
  }
}
