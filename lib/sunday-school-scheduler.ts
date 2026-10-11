/**
 * Pure logic for the Lesson Scheduler: given a pool of eligible servants and
 * the class's still-unassigned weekly lessons, decide who teaches which date.
 *
 * Deliberately never touches a lesson that already has a teacher — the
 * scheduler only fills gaps, so a coordinator's earlier manual pick (or an
 * earlier scheduler run) is never silently overwritten. To reassign a week
 * that already has a teacher, use the existing single-lesson owner picker.
 */

export type SundaySchoolScheduleMode = "one-each" | "fill-year"

export interface ScheduleServant {
  id: string
  name: string
}

export interface ScheduleableLesson {
  id: string
  sundayDate: string
}

export interface ScheduleAssignment {
  lessonId: string
  sundayDate: string
  servantId: string
  servantName: string
}

export function isValidScheduleMode(value: unknown): value is SundaySchoolScheduleMode {
  return value === "one-each" || value === "fill-year"
}

/**
 * `lessons` must already be every currently-unassigned lesson for the class,
 * in ascending date order, and `servants` the pool to assign from (already
 * minus whoever the coordinator excluded).
 *
 * "one-each": assigns the earliest N dates to the N servants, one each, and
 * stops — enough for every servant to have a turn, nothing further out.
 * "fill-year": assigns every remaining date, cycling through the pool
 * repeatedly, so nothing through the end of the school year is left blank.
 */
export function buildScheduleAssignments(
  servants: ScheduleServant[],
  lessons: ScheduleableLesson[],
  mode: SundaySchoolScheduleMode
): ScheduleAssignment[] {
  if (servants.length === 0 || lessons.length === 0) return []

  const targetLessons = mode === "one-each" ? lessons.slice(0, servants.length) : lessons

  return targetLessons.map((lesson, index) => {
    const servant = servants[index % servants.length]
    return {
      lessonId: lesson.id,
      sundayDate: lesson.sundayDate,
      servantId: servant.id,
      servantName: servant.name,
    }
  })
}
