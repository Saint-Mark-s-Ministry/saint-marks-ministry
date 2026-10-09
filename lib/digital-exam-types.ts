export interface ExamActivity { id: string; kind: string; createdAt: string; clientAt: string | null; actorId: string }
export interface ExamAttemptView {
  id: string; state: 'ACTIVE' | 'PAUSED' | 'SUBMITTED'; answers: string[]; revision: number
  startedAt: string; lastSeenAt: string; pausedAt: string | null; submittedAt: string | null
  correctCount?: number | null; percentage?: number
}
export interface DigitalExamView {
  exam: { id: string; examDate: string; yearLevel: string; totalPoints: number; examSection: { displayName: string }; academicYear: { name: string } }
  sheet: { state: 'DRAFT' | 'OPEN' | 'CLOSED'; choiceCounts: number[]; openedAt: string | null; closedAt: string | null; releasedAt: string | null } | null
  attempt?: ExamAttemptView | null
  answerKey?: string[]; canManage?: boolean; realtimeConfigured?: boolean
  roster?: { student: { id: string; name: string }; eligible: boolean; attempt: (ExamAttemptView & { stale: boolean; answeredCount: number; events: ExamActivity[] }) | null }[]
}
export interface DigitalExamList { exams: (DigitalExamView['exam'] & { digitalSheet: { state: string; releasedAt: string | null; attempts: { state: string }[] } | null })[] }
export interface AttemptResponse { attempt: ExamAttemptView; examState: string; blocked?: boolean }
