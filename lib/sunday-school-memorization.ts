export const MEMORIZATION_MIN_SCORE = 0
export const MEMORIZATION_MAX_SCORE = 100
export const MEMORIZATION_TITLE_MAX = 120
export const MEMORIZATION_INSTRUCTIONS_MAX = 2000
export const MEMORIZATION_NOTES_MAX = 500

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface MemorizationInput {
  title: string
  instructions: string | null
  dueDate: Date | null
}

/** Parse a YYYY-MM-DD calendar day to midnight UTC (see AGENTS.md "Dates"). */
export function parseMemorizationDueDate(value: unknown): Result<Date | null> {
  if (value === null || value === undefined || value === '') return { ok: true, value: null }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: 'Due date must be a valid date' }
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: 'Due date must be a valid date' }
  }
  return { ok: true, value: date }
}

export function validateMemorizationInput(body: Record<string, unknown>): Result<MemorizationInput> {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return { ok: false, error: 'A title is required' }
  if (title.length > MEMORIZATION_TITLE_MAX) {
    return { ok: false, error: `Title must be ${MEMORIZATION_TITLE_MAX} characters or fewer` }
  }
  let instructions: string | null = null
  if (body.instructions !== undefined && body.instructions !== null) {
    if (typeof body.instructions !== 'string') return { ok: false, error: 'Instructions must be text' }
    instructions = body.instructions.trim() || null
    if (instructions && instructions.length > MEMORIZATION_INSTRUCTIONS_MAX) {
      return { ok: false, error: `Instructions must be ${MEMORIZATION_INSTRUCTIONS_MAX} characters or fewer` }
    }
  }
  const due = parseMemorizationDueDate(body.dueDate)
  if (!due.ok) return due
  return { ok: true, value: { title, instructions, dueDate: due.value } }
}

export function isValidMemorizationScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MEMORIZATION_MIN_SCORE &&
    value <= MEMORIZATION_MAX_SCORE
  )
}

export interface MemorizationScoreRecord {
  childId: string
  /** null clears the child's recorded score */
  score: number | null
  notes: string | null
}

export function validateScoreRecords(records: unknown): Result<MemorizationScoreRecord[]> {
  if (!Array.isArray(records)) return { ok: false, error: 'Records must be an array' }
  const seen = new Set<string>()
  const out: MemorizationScoreRecord[] = []
  for (const raw of records as Array<Record<string, unknown> | null>) {
    if (!raw || typeof raw !== 'object' || typeof raw.childId !== 'string' || !raw.childId) {
      return { ok: false, error: 'Each record needs a child' }
    }
    if (seen.has(raw.childId)) return { ok: false, error: 'Each child may appear only once' }
    seen.add(raw.childId)
    if (raw.score !== null && !isValidMemorizationScore(raw.score)) {
      return {
        ok: false,
        error: `Scores must be whole numbers from ${MEMORIZATION_MIN_SCORE} to ${MEMORIZATION_MAX_SCORE}`,
      }
    }
    let notes: string | null = null
    if (raw.notes !== undefined && raw.notes !== null) {
      if (typeof raw.notes !== 'string') return { ok: false, error: 'Notes must be text' }
      notes = raw.notes.trim() || null
      if (notes && notes.length > MEMORIZATION_NOTES_MAX) {
        return { ok: false, error: `Notes must be ${MEMORIZATION_NOTES_MAX} characters or fewer` }
      }
    }
    out.push({ childId: raw.childId, score: raw.score as number | null, notes })
  }
  return { ok: true, value: out }
}

export function summarizeMemorizationScores(scores: Array<number | null | undefined>, rosterSize: number) {
  const recorded = scores.filter((score): score is number => typeof score === 'number')
  const total = recorded.reduce((sum, score) => sum + score, 0)
  return {
    recorded: recorded.length,
    notRecorded: Math.max(rosterSize - recorded.length, 0),
    average: recorded.length > 0 ? Math.round(total / recorded.length) : null,
  }
}
