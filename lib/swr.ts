import useSWR, { SWRConfiguration } from 'swr'

// Default fetcher for SWR
export const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.')
    const data = await res.json().catch(() => ({}))
    ;(error as Error & { info: unknown; status: number }).info = data
    ;(error as Error & { info: unknown; status: number }).status = res.status
    throw error
  }
  return res.json()
}

// Default SWR options for the app
export const defaultSWRConfig: SWRConfiguration = {
  fetcher,
  revalidateOnFocus: false, // Don't refetch when window regains focus
  revalidateOnReconnect: true, // Refetch when network reconnects
  dedupingInterval: 5000, // Dedupe requests within 5 seconds
  errorRetryCount: 3, // Retry failed requests 3 times
}

// Aggressive caching for static/rarely-changing data
export const staticDataConfig: SWRConfiguration = {
  fetcher,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  dedupingInterval: 60000, // 1 minute deduplication
  errorRetryCount: 3,
}

// Custom hooks for common data fetching patterns
export function useEnrollments(mentorId?: string, options?: SWRConfiguration) {
  const url = mentorId
    ? `/api/enrollments?mentorId=${mentorId}`
    : '/api/enrollments'
  return useSWR(url, fetcher, { ...defaultSWRConfig, ...options })
}

export function useDashboardStats(options?: SWRConfiguration) {
  return useSWR('/api/dashboard/stats', fetcher, {
    ...defaultSWRConfig,
    refreshInterval: 30000, // Refresh every 30 seconds
    ...options
  })
}

// Registration system hooks
export function useInviteCodes(statusFilter?: string, options?: SWRConfiguration) {
  const url = statusFilter
    ? `/api/registration/invite-codes?status=${statusFilter}`
    : '/api/registration/invite-codes'
  return useSWR(url, fetcher, { ...defaultSWRConfig, ...options })
}

export function useRegistrationSubmissions(
  filters?: { status?: string; page?: number; limit?: number },
  options?: SWRConfiguration
) {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.limit) params.set('limit', String(filters.limit))
  const query = params.toString()
  const url = `/api/registration/submissions${query ? `?${query}` : ''}`
  return useSWR(url, fetcher, { ...defaultSWRConfig, ...options })
}

export function useRegistrationSettings(options?: SWRConfiguration) {
  return useSWR('/api/registration/settings', fetcher, {
    ...staticDataConfig,
    ...options,
  })
}

export interface StudentApplicationState {
  annualMentorRequired: boolean
  academicYear: { id: string; name: string } | null
  missingDetails: string[]
  complete: boolean
}

export function useStudentApplicationState(enabled = true, options?: SWRConfiguration) {
  return useSWR<StudentApplicationState>(
    enabled ? '/api/registration/application' : null,
    fetcher,
    {
      ...defaultSWRConfig,
      shouldRetryOnError: false,
      ...options,
    }
  )
}

// Servant application hooks
export function useServantApplications(statusFilter?: string, options?: SWRConfiguration) {
  const url = statusFilter
    ? `/api/servant-applications?status=${statusFilter}`
    : '/api/servant-applications'
  return useSWR(url, fetcher, { ...defaultSWRConfig, ...options })
}

// Parent portal hooks
export function useParentChildren(options?: SWRConfiguration) {
  return useSWR('/api/parent/children', fetcher, { ...defaultSWRConfig, ...options })
}

export function useChildRegistrationRequests(statusFilter?: string, options?: SWRConfiguration) {
  const url = statusFilter
    ? `/api/sunday-school/child-registrations?status=${statusFilter}`
    : '/api/sunday-school/child-registrations'
  return useSWR(url, fetcher, { ...defaultSWRConfig, ...options })
}

export function useClassAverages(options?: SWRConfiguration) {
  return useSWR('/api/dashboard/class-averages', fetcher, { ...defaultSWRConfig, ...options })
}

// Sunday School mode hooks (the Sunday School class itself)
export function useSundaySchoolDashboard(
  academicYearId?: string,
  classId?: string,
  audience: 'children' | 'servants' = 'children',
  options?: SWRConfiguration
) {
  const params = new URLSearchParams()
  if (academicYearId) params.set('academicYearId', academicYearId)
  if (classId) params.set('classId', classId)
  if (audience !== 'children') params.set('audience', audience)
  const query = params.toString()
  const url = `/api/sunday-school/dashboard${query ? `?${query}` : ''}`
  return useSWR(url, fetcher, { ...defaultSWRConfig, ...options })
}

export function useSundaySchoolServantAttendance(
  classId?: string,
  date?: string,
  options?: SWRConfiguration
) {
  const params = new URLSearchParams()
  if (classId) params.set('classId', classId)
  if (date) params.set('date', date)
  return useSWR(
    classId && date ? `/api/sunday-school/servant-attendance?${params.toString()}` : null,
    fetcher,
    { ...defaultSWRConfig, ...options }
  )
}

export function useSundaySchoolAgeGroups(options?: SWRConfiguration) {
  return useSWR('/api/sunday-school/age-groups', fetcher, { ...defaultSWRConfig, ...options })
}

export function useSundaySchoolClasses(options?: SWRConfiguration) {
  return useSWR('/api/sunday-school/classes', fetcher, { ...defaultSWRConfig, ...options })
}

export function useSundaySchoolFamilies(options?: SWRConfiguration) {
  return useSWR('/api/sunday-school/families', fetcher, { ...defaultSWRConfig, ...options })
}

export function useSundaySchoolClass(classId?: string, options?: SWRConfiguration) {
  return useSWR(
    classId ? `/api/sunday-school/classes/${classId}` : null,
    fetcher,
    { ...defaultSWRConfig, ...options }
  )
}

export function useSundaySchoolLessons(
  filters?: { from?: string; to?: string; classId?: string; scope?: 'year' },
  options?: SWRConfiguration
) {
  const params = new URLSearchParams()
  if (filters?.from) params.set('from', filters.from)
  if (filters?.to) params.set('to', filters.to)
  if (filters?.classId) params.set('classId', filters.classId)
  if (filters?.scope) params.set('scope', filters.scope)
  const query = params.toString()
  return useSWR(`/api/sunday-school/lessons${query ? `?${query}` : ''}`, fetcher, {
    ...defaultSWRConfig,
    ...options,
  })
}

export function useSundaySchoolChildren(classId?: string, options?: SWRConfiguration) {
  const url = classId
    ? `/api/sunday-school/children?classId=${classId}`
    : '/api/sunday-school/children'
  return useSWR(url, fetcher, { ...defaultSWRConfig, ...options })
}

export function useSundaySchoolBirthdays(options?: SWRConfiguration) {
  return useSWR('/api/sunday-school/birthdays', fetcher, { ...defaultSWRConfig, ...options })
}

export function useSundaySchoolVisitations(options?: SWRConfiguration) {
  return useSWR('/api/sunday-school/visitations', fetcher, {
    ...defaultSWRConfig,
    ...options,
  })
}

export function useSundaySchoolFeedback(
  status = 'ACTIVE',
  sort = 'TOP',
  options?: SWRConfiguration
) {
  const params = new URLSearchParams({ status, sort })
  return useSWR(`/api/sunday-school/feedback?${params.toString()}`, fetcher, {
    ...defaultSWRConfig,
    ...options,
  })
}

export function useSundaySchoolSessionAttendance(sessionId?: string, options?: SWRConfiguration) {
  return useSWR(
    sessionId ? `/api/sunday-school/sessions/${sessionId}/attendance` : null,
    fetcher,
    { ...defaultSWRConfig, ...options }
  )
}

export function useMenteeAnalytics(studentIds?: string[], options?: SWRConfiguration) {
  const url = studentIds && studentIds.length > 0
    ? `/api/students/analytics/batch?studentIds=${studentIds.join(',')}`
    : null
  return useSWR(url, fetcher, { ...defaultSWRConfig, ...options })
}


export function useSundaySchoolOrganization() {
  return useSWR<import('@/lib/sunday-school-organization').SundaySchoolOrganization>(
    '/api/sunday-school/organization', fetcher, defaultSWRConfig,
  )
}


export function usePriestOverseers(enabled: boolean) {
  return useSWR<Array<import('@/lib/sunday-school-organization').OrganizationPerson & { isDisabled: boolean }>>(
    enabled ? '/api/users?role=PRIEST' : null, fetcher, defaultSWRConfig,
  )
}

export interface AcademicYearSummary {
  id: string
  name: string
  startDate: string
  endDate: string
  isActive: boolean
  _count?: { lessons: number; exams: number }
}

export function useAcademicYears(enabled = true, options?: SWRConfiguration) {
  return useSWR<AcademicYearSummary[]>(enabled ? '/api/academic-years' : null, fetcher, {
    ...staticDataConfig,
    ...options,
  })
}

export interface LessonSummary {
  id: string
  title: string
  subtitle?: string | null
  speaker?: string | null
  scheduledDate: string
  status: 'SCHEDULED' | 'CANCELLED' | 'NO_CLASS' | 'COMPLETED'
  lessonNumber: number
  isExamDay: boolean
  examSection?: { id: string; displayName: string } | null
}

export function useLessons(academicYearId?: string | null, options?: SWRConfiguration) {
  return useSWR<LessonSummary[]>(
    academicYearId ? `/api/lessons?academicYearId=${academicYearId}` : null,
    fetcher,
    { ...defaultSWRConfig, ...options }
  )
}

export interface ExamSummary {
  id: string
  examDate: string
  yearLevel: string
  totalPoints: number
  examSection: { id: string; displayName: string }
}

export function useExams(academicYearId?: string | null, options?: SWRConfiguration) {
  return useSWR<ExamSummary[]>(
    academicYearId ? `/api/exams?academicYearId=${academicYearId}` : null,
    fetcher,
    { ...defaultSWRConfig, ...options }
  )
}
