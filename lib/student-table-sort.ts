export type StudentTableSortKey =
  | 'name'
  | 'year'
  | 'year1Attendance'
  | 'year2Attendance'
  | 'examAverage'
  | 'eligibility'
  | 'status'

export type SortDirection = 'asc' | 'desc'

interface SortableStudent {
  id: string
  name: string
  enrollments?: Array<{
    yearLevel: 'YEAR_1' | 'YEAR_2' | null
    isAsyncStudent?: boolean
    status: 'ACTIVE' | 'GRADUATED' | 'WITHDRAWN'
  }>
}

interface SortableStudentAnalytics {
  studentId: string
  year1AttendancePercentage: number | null
  year2AttendancePercentage: number | null
  avgExamScore: number | null
  graduationEligible: boolean
}

type SortValue = string | number | null

const textCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

function eligibilityValue(
  student: SortableStudent,
  studentAnalytics: SortableStudentAnalytics | undefined
): string | null {
  const enrollment = student.enrollments?.[0]
  if ((enrollment?.isAsyncStudent || enrollment?.yearLevel === 'YEAR_2') && enrollment.status === 'ACTIVE') {
    return studentAnalytics?.graduationEligible ? 'Eligible' : 'Review'
  }
  return enrollment?.status === 'GRADUATED' ? 'Graduated' : null
}

function sortValue(
  student: SortableStudent,
  studentAnalytics: SortableStudentAnalytics | undefined,
  key: StudentTableSortKey
): SortValue {
  switch (key) {
    case 'name':
      return student.name
    case 'year':
      return student.enrollments?.[0]?.yearLevel === 'YEAR_1'
        ? 1
        : student.enrollments?.[0]?.yearLevel === 'YEAR_2'
          ? 2
          : null
    case 'year1Attendance':
      return studentAnalytics?.year1AttendancePercentage ?? null
    case 'year2Attendance':
      return studentAnalytics?.year2AttendancePercentage ?? null
    case 'examAverage':
      return studentAnalytics?.avgExamScore ?? null
    case 'eligibility':
      return eligibilityValue(student, studentAnalytics)
    case 'status':
      return student.enrollments?.[0]?.status ?? null
  }
}

function comparePresentValues(left: Exclude<SortValue, null>, right: Exclude<SortValue, null>): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return textCollator.compare(String(left), String(right))
}

/**
 * Sort a filtered student list without mutating it. Missing values always stay
 * at the bottom so changing direction does not put blank analytics first.
 */
export function sortStudentTableRows<T extends SortableStudent>(
  students: readonly T[],
  analytics: readonly SortableStudentAnalytics[],
  key: StudentTableSortKey,
  direction: SortDirection
): T[] {
  const analyticsByStudent = new Map(analytics.map((row) => [row.studentId, row]))

  return [...students].sort((leftStudent, rightStudent) => {
    const left = sortValue(leftStudent, analyticsByStudent.get(leftStudent.id), key)
    const right = sortValue(rightStudent, analyticsByStudent.get(rightStudent.id), key)

    if (left === null && right === null) {
      return textCollator.compare(leftStudent.name, rightStudent.name)
    }
    if (left === null) return 1
    if (right === null) return -1

    const comparison = comparePresentValues(left, right)
    if (comparison !== 0) return direction === 'asc' ? comparison : -comparison

    return textCollator.compare(leftStudent.name, rightStudent.name)
  })
}
