'use client'

import { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SundaySchoolLevel } from '@prisma/client'
import { useSundaySchoolAgeGroups, useSundaySchoolClasses } from '@/lib/swr'
import { compareAgeGroupsByLevel, compareClassesByLevelAndName } from '@/lib/sunday-school-class'
import { ALL_CLASSES, useViewing, resolveViewingClassId } from '@/lib/sunday-school-viewing'
import { cn } from '@/lib/utils'

interface PickerClass {
  id: string
  name: string
  level: SundaySchoolLevel
  isActive: boolean
  classroom?: string | null
}

interface PickerAgeGroup {
  id: string
  name: string
  levels: SundaySchoolLevel[]
}

/** Classes grouped by the age group that owns their grade, in band order (as on Home). */
function groupClassesForViewing(classes: PickerClass[], ageGroups: PickerAgeGroup[]) {
  const active = classes.filter(cls => cls.isActive).sort(compareClassesByLevelAndName)
  const bands = [...ageGroups].sort(compareAgeGroupsByLevel)
  const groups = bands
    .map(band => ({ label: band.name, classes: active.filter(cls => band.levels.includes(cls.level)) }))
    .filter(group => group.classes.length > 0)
  const banded = new Set(groups.flatMap(group => group.classes.map(cls => cls.id)))
  const other = active.filter(cls => !banded.has(cls.id))
  if (other.length > 0) groups.push({ label: 'Other classes', classes: other })
  return groups
}

/**
 * The class context in the shell. Every Sunday School page follows it, so
 * pages no longer ask "which class?" on their own. A servant with one class
 * sees its name; nothing to choose.
 */
export function SundaySchoolViewingPicker({ variant }: { variant: 'sidebar' | 'appbar' }) {
  const { data: classesData, error: classesError } = useSundaySchoolClasses()
  const { data: ageGroupsData } = useSundaySchoolAgeGroups()
  const [stored, setStored] = useViewing()

  const classes = useMemo(() => (Array.isArray(classesData) ? (classesData as PickerClass[]) : []), [classesData])
  const ageGroups = useMemo(() => (Array.isArray(ageGroupsData) ? (ageGroupsData as PickerAgeGroup[]) : []), [ageGroupsData])
  const groups = useMemo(() => groupClassesForViewing(classes, ageGroups), [classes, ageGroups])
  const activeIds = groups.flatMap(group => group.classes.map(cls => cls.id))
  const loading = classesData === undefined && !classesError
  if (activeIds.length === 0 && !loading && !classesError) return null

  const value = resolveViewingClassId(activeIds, stored, null, true)
  const selected = classes.find(cls => cls.id === value)
  const title = loading ? 'Loading classes…' : classesError && activeIds.length === 0 ? 'Classes unavailable' : selected ? selected.name : 'All classes'
  const detail = selected
    ? selected.classroom || groups.find(group => group.classes.some(cls => cls.id === selected.id))?.label || ''
    : activeIds.length > 0 ? `${activeIds.length} classes` : ''
  const single = activeIds.length === 1
  const label = single ? 'Your class' : activeIds.length > 1 ? 'Viewing class' : 'Class'
  const canChoose = activeIds.length > 1

  const select = canChoose && (
    <select
      aria-label="Viewing class"
      value={value}
      onChange={event => setStored(event.target.value)}
      className="absolute inset-0 cursor-pointer appearance-none opacity-0"
    >
      <option value={ALL_CLASSES}>All classes</option>
      {groups.map(group => (
        <optgroup key={group.label} label={group.label}>
          {group.classes.map(cls => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )

  if (variant === 'appbar') {
    return (
      <div role="group" aria-label={label} aria-busy={loading} className="relative flex h-11 min-w-0 items-center gap-1.5 rounded-md px-1.5">
        <span className="flex min-w-0 flex-col leading-[1.15]">
          <span className="truncate text-[15px] font-semibold text-ink">{title}</span>
          <span className="truncate text-[11.5px] text-ink-3">{label}{detail && ` · ${detail}`}</span>
        </span>
        {canChoose && <ChevronDown className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden />}
        {select}
      </div>
    )
  }

  return (
    <div role="group" aria-label={label} aria-busy={loading} className="sidebar-label flex shrink-0 flex-col gap-1">
      <span className="px-2.5 text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">{label}</span>
      <div
        className={cn(
          'relative flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-2.5',
          canChoose && 'hover:bg-hover focus-within:outline-2 focus-within:outline-accent-ink',
        )}
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent-ink" />
        <span className="flex min-w-0 flex-1 flex-col leading-[1.2]">
          <span className="truncate text-[13px] font-semibold text-ink">{title}</span>
          {detail && <span className="truncate text-[11px] text-ink-3">{detail}</span>}
        </span>
        {canChoose && <ChevronDown className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden />}
        {select}
      </div>
    </div>
  )
}
