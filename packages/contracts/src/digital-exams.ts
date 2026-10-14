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
  completedHistory?: { student: { id: string; name: string }; attemptNumber?: number; snapshot?: { answers?: string[]; correctCount?: number | null; submittedAt?: string | null }; events: ExamActivity[] }[]
  roster?: { student: { id: string; name: string }; eligible: boolean; attempt: (ExamAttemptView & { stale: boolean; pageVisible?: boolean; answeredCount: number; events: ExamActivity[] }) | null }[]
}
export interface DigitalExamList { exams: (DigitalExamView['exam'] & { digitalSheet: { state: string; releasedAt: string | null; attempts: { state: string }[] } | null })[] }
export interface AttemptResponse { attempt: ExamAttemptView; examState: string; blocked?: boolean }
