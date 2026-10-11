/**
 * Shared TypeScript types used across multiple pages and components.
 * Centralizes interfaces that were previously duplicated in individual page files.
 */

export interface AcademicYear {
  id: string
  name: string
  startDate: string
  endDate: string
  isActive: boolean
}

export interface ExamSection {
  id: string
  name: string
  displayName: string
  passingScore?: number
  averageRequirement?: number
}

export interface StudentEnrollment {
  id: string
  yearLevel: 'YEAR_1' | 'YEAR_2' | null
  isActive: boolean
  isAsyncStudent?: boolean
  status: 'ACTIVE' | 'GRADUATED' | 'WITHDRAWN'
  notes?: string
  mentor?: {
    id: string
    name: string
  }
  fatherOfConfession?: {
    id: string
    name: string
    phone?: string
    church?: string
  }
  academicYear?: AcademicYear | null
  graduatedAcademicYear?: AcademicYear | null
}

/**
 * Analytics sub-types shared between mentees pages, student dashboard, and admin dashboard.
 */

export interface SectionAverage {
  section: string
  average: number
  scores: number[]
  passingMet: boolean
}

export interface MissingExam {
  id: string
  examDate: string
  totalPoints: number
  yearLevel: string
  sectionName: string
  sectionDisplayName: string
}

export interface AttendanceAnalytics {
  totalLessons: number
  allLessons: number
  presentCount: number
  lateCount: number
  absentCount: number
  excusedCount: number
  notEnrolledYetCount?: number
  expectedAbsenceNACount?: number
  effectivePresent: number
  percentage: number | null
  met: boolean
  required: number
  conductDismissalCount: number
}

export interface ExamAnalytics {
  sectionAverages: SectionAverage[]
  overallAverage: number | null
  overallAverageMet: boolean
  allSectionsPassing: boolean
  requiredAverage: number
  requiredMinimum: number
  missingExams: MissingExam[]
  totalApplicableExams: number
  examsTaken: number
}

export interface GraduationStatus {
  eligible: boolean
  attendanceMet: boolean
  overallAverageMet: boolean
  allSectionsPassing: boolean
  sundaySchoolMet?: boolean
}

export interface MenteeAnalytics {
  enrollment: {
    yearLevel: string | null
    status: string
  }
  attendance: AttendanceAnalytics
  exams: ExamAnalytics
  graduation: GraduationStatus
}

export interface StudentAnalytics {
  studentId: string
  studentName: string
  yearLevel: 'YEAR_1' | 'YEAR_2' | null
  attendancePercentage: number | null
  year1AttendancePercentage: number | null
  year2AttendancePercentage: number | null
  avgExamScore: number | null
  examAverage: number | null
  totalLessons: number
  year1TotalLessons: number
  year2TotalLessons: number | null
  attendedLessons: number
  year1AttendedLessons: number
  year2AttendedLessons: number | null
  examCount: number
  graduationEligible: boolean
  attendanceMet: boolean
  examAverageMet: boolean
  allSectionsMet: boolean
}
