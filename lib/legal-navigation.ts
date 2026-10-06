export const LEGAL_RETURN_PATH_KEY = 'legal-return-path'

const RETURN_PAGE_LABELS: Array<[path: string, label: string]> = [
  ['/dashboard/servants/servant-applications', 'Servant Applications'],
  ['/dashboard/servants/child-registrations', 'Child Registrations'],
  ['/dashboard/servants/servant-attendance', 'Servant Attendance'],
  ['/dashboard/servants/age-groups', 'Age Groups'],
  ['/dashboard/servants/activity', 'Activity'],
  ['/dashboard/servants/visitations', 'Visitations'],
  ['/dashboard/servants/attendance', 'Attendance'],
  ['/dashboard/servants/children', 'Children'],
  ['/dashboard/servants/classes', 'Classes'],
  ['/dashboard/servants/feedback', 'Feedback'],
  ['/dashboard/servants/lessons', 'Lessons'],
  ['/dashboard/servants/homework', 'Homework'],
  ['/dashboard/servants/account', 'My Account'],
  ['/dashboard/servants/roster', 'Roster'],
  ['/dashboard/servants/users', 'Users'],
  ['/dashboard/servants', 'Sunday School'],
  ['/dashboard/admin/servant-applications', 'Servant Applications'],
  ['/dashboard/admin/async-students', 'Async Students'],
  ['/dashboard/admin/registrations', 'Registrations'],
  ['/dashboard/admin/attendance', 'Attendance'],
  ['/dashboard/admin/curriculum', 'Curriculum'],
  ['/dashboard/admin/enrollments', 'Roster'],
  ['/dashboard/admin/students', 'Students'],
  ['/dashboard/admin/settings', 'Settings'],
  ['/dashboard/admin/mentees', 'Mentees'],
  ['/dashboard/admin/exams', 'Exams'],
  ['/dashboard/admin/users', 'Users'],
  ['/dashboard/admin/activity', 'Activity'],
  ['/dashboard/admin', 'Dashboard'],
  ['/dashboard/mentor/my-mentees', 'My Mentees'],
  ['/dashboard/mentor', 'Mentor Dashboard'],
  ['/dashboard/student/class-lessons', 'Class Lessons'],
  ['/dashboard/student/sunday-school', 'Sunday School'],
  ['/dashboard/student/async-notes', 'My Notes'],
  ['/dashboard/student/lessons', 'My Lessons'],
  ['/dashboard/student', 'My Progress'],
  ['/dashboard/files/preview', 'File Preview'],
  ['/dashboard/files', 'Files'],
  ['/dashboard/parent', 'Family Dashboard'],
  ['/settings', 'My Account'],
  ['/dashboard', 'Dashboard'],
]

export function isLegalPath(pathname: string) {
  return (
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/dashboard/servants/privacy' ||
    pathname === '/dashboard/servants/terms'
  )
}

export function getSafeLegalReturnPath(
  storedPath: string | null,
  inSundaySchoolMode: boolean
) {
  if (!storedPath || !storedPath.startsWith('/') || storedPath.startsWith('//')) return null

  const pathname = storedPath.split(/[?#]/, 1)[0]
  if (isLegalPath(pathname)) return null

  const returnsToSundaySchool = pathname.startsWith('/dashboard/servants')
  if (returnsToSundaySchool !== inSundaySchoolMode) return null

  return storedPath
}

export function getLegalReturnLabel(
  returnPath: string | null,
  inSundaySchoolMode: boolean
) {
  if (!returnPath) return inSundaySchoolMode ? 'Sunday School' : 'Dashboard'

  const pathname = returnPath.split(/[?#]/, 1)[0]
  const match = RETURN_PAGE_LABELS.find(
    ([route]) => pathname === route || pathname.startsWith(`${route}/`)
  )

  return match?.[1] ?? (inSundaySchoolMode ? 'Sunday School' : 'Dashboard')
}
