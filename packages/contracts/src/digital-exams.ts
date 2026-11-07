export interface ExamActivity { id: string; kind: string; createdAt: string; clientAt: string | null; actorId: string; questionNumber?: number | null; answerChoice?: string | null; destinationPath?: string | null; attemptNumber?: number }
export interface ExamAttemptView {
  id: string; state: 'ACTIVE' | 'PAUSED' | 'SUBMITTED'; answers: string[]; revision: number
  startedAt: string; lastSeenAt: string; pausedAt: string | null; submittedAt: string | null
  attemptNumber?: number; retakeReady?: boolean; correctCount?: number | null; percentage?: number
}
export interface DigitalExamView {
  exam: { id: string; examDate: string; yearLevel: string; totalPoints: number; examSection: { displayName: string }; academicYear: { name: string } }
  sheet: { studentReturnSoundEnabled?: boolean; state: 'DRAFT' | 'OPEN' | 'CLOSED'; choiceCounts: number[]; openedAt: string | null; closedAt: string | null; releasedAt: string | null } | null
  attempt?: ExamAttemptView | null
  answerKey?: string[]; canManage?: boolean; realtimeConfigured?: boolean
  hasAttempts?: boolean
  pendingResults?: number
  retakeCandidates?: { id: string; name: string }[]
  completedHistory?: { student: { id: string; name: string }; attemptNumber?: number; snapshot?: { answers?: string[]; correctCount?: number | null; percentage?: number; submittedAt?: string | null }; events: ExamActivity[] }[]
  roster?: { student: { id: string; name: string }; eligible: boolean; attempt: (ExamAttemptView & { stale: boolean; pageVisible?: boolean; answeredCount: number; events: ExamActivity[] }) | null }[]
}
export interface DigitalExamList { exams: (DigitalExamView['exam'] & { digitalSheet: { state: string; releasedAt: string | null; attempts: { state: string }[] } | null })[] }
export interface AttemptResponse { attempt: ExamAttemptView; examState: string; blocked?: boolean }

/** The staff-only `POST /api/digital-exams/:id` actions (lib/digital-exam-service.ts). The server decides who may send each one. */
export type DigitalExamStaffRequest =
  | { action: 'configure'; choiceCounts: number[]; answerKey: string[] }
  | { action: 'open' | 'close' | 'release' | 'reset' | 'ready' }
  | { action: 'unlock'; attemptId: string }
  | { action: 'retake'; studentId: string }
export type DigitalExamStaffAction = DigitalExamStaffRequest['action']
/** The private staff channel that carries `changed` pings (never answers or grades) for one exam. */
export type DigitalExamRealtimeEvent = { examId: string }
