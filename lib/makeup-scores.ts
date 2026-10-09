import { makeupToday } from '@/lib/makeup-exams'

export function effectiveExamResult(originalPercentage: number | null, makeupPercentages: number[], examTotalPoints: number, digitalRetakePercentage?: number | null) {
  const percentage = Math.max(originalPercentage ?? 0, digitalRetakePercentage ?? 0, ...makeupPercentages)
  return { percentage, score: percentage * examTotalPoints / 100 }
}

export type MakeupScoreInput = { studentId: string; version: number; score: number; totalPoints: number; takenDate: string; notes: string | null; attemptId?: string }
export function parseMakeupScoreInput(body: unknown, now = new Date()): MakeupScoreInput | string {
  if (!body || typeof body !== 'object') return 'Makeup exam details are required.'
  const data = body as Record<string, unknown>
  if (typeof data.studentId !== 'string' || !data.studentId.trim()) return 'Choose a student.'
  if (data.version !== 1 && data.version !== 2) return 'Choose makeup exam version 1 or 2.'
  if (typeof data.totalPoints !== 'number' || !Number.isSafeInteger(data.totalPoints) || data.totalPoints <= 0 || data.totalPoints > 2147483647) return 'Total points must be a positive whole number.'
  if (typeof data.score !== 'number' || !Number.isFinite(data.score) || data.score < 0 || data.score > data.totalPoints) return 'Enter a score between zero and the total points.'
  if (typeof data.takenDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.takenDate)) return 'Choose the date the makeup exam was taken.'
  const date = new Date(`${data.takenDate}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data.takenDate || data.takenDate > makeupToday(now)) return 'The makeup exam date must be a valid date on or before today.'
  if (data.notes !== undefined && data.notes !== null && typeof data.notes !== 'string') return 'Notes must be text.'
  if (data.attemptId !== undefined && (typeof data.attemptId !== 'string' || !data.attemptId.trim())) return 'Choose a makeup score to edit.'
  return { studentId: data.studentId, version: data.version, score: data.score, totalPoints: data.totalPoints, takenDate: data.takenDate, notes: typeof data.notes === 'string' ? data.notes.trim() || null : null, ...(typeof data.attemptId === 'string' ? { attemptId: data.attemptId } : {}) }
}
