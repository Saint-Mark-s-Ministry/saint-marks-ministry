import type { StudentGrade, SundaySchoolLevel } from '@prisma/client'

export interface PrepRosterStudent {
  id: string
  name: string
  registration: { grade: StudentGrade; birthDate: string } | null
}

export interface PrepRosterChild {
  id: string
  firstName: string
  lastName: string
  level: SundaySchoolLevel
  birthDate: string | null
  userId: string | null
}

export interface PrepRosterMatch {
  studentId: string
  studentName: string
  registrationGrade: StudentGrade | null
  status: 'ready' | 'linked' | 'review' | 'unmatched'
  reason: string
  candidates: PrepRosterChild[]
}

function normalizedName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function isHighSchoolGrade(grade: string | undefined) {
  return grade === 'GRADE_11' || grade === 'GRADE_12'
}

/** Name-only matches are candidates, never automatic identity decisions. */
export function matchPrepStudentsToRoster(
  students: PrepRosterStudent[],
  children: PrepRosterChild[]
): PrepRosterMatch[] {
  return students.flatMap<PrepRosterMatch>(student => {
    const name = normalizedName(student.name)
    const linked = children.filter(child => child.userId === student.id)
    const candidates = linked.length ? linked : children.filter(child =>
      normalizedName(`${child.firstName} ${child.lastName}`) === name
    )
    if (!isHighSchoolGrade(student.registration?.grade) &&
      !candidates.some(child => isHighSchoolGrade(child.level))) return []

    const base = {
      studentId: student.id,
      studentName: student.name,
      registrationGrade: student.registration?.grade ?? null,
      candidates,
    }
    if (linked.length) return [{ ...base, status: 'linked' as const, reason: 'Account is already linked' }]
    if (!candidates.length) return [{ ...base, status: 'unmatched' as const, reason: 'No exact full-name match' }]
    if (candidates.length !== 1 || students.filter(other => normalizedName(other.name) === name).length !== 1) {
      return [{ ...base, status: 'review' as const, reason: 'Name is not unique' }]
    }

    const child = candidates[0]
    let reason: string | null = null
    if (child.userId) reason = 'Roster record already belongs to another account'
    else if (!student.registration || !child.birthDate) reason = 'Birth date is missing'
    else if (student.registration.birthDate !== child.birthDate) reason = 'Birth dates differ'
    else if (!isHighSchoolGrade(child.level) || child.level !== student.registration.grade) {
      reason = 'Current roster grade and registration grade need review'
    }
    return [{
      ...base,
      status: reason ? 'review' as const : 'ready' as const,
      reason: reason ?? 'Unique full name, birth date, and grade match',
    }]
  })
}
