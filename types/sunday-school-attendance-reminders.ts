export interface SundaySchoolAttendanceReminder {
  classId: string
  className: string
  sessionDate: string
  url: string
}

export const SUNDAY_SCHOOL_ATTENDANCE_REMINDERS_URL = '/api/sunday-school/attendance/reminders'
