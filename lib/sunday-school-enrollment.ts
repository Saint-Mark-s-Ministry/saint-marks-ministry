import { SundaySchoolLevel } from '@prisma/client'
import { prisma } from './prisma'

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Put a child on a class's roster in the durable, year-first shape:
 *
 *   SundaySchoolEnrollment (child + year + level)
 *     └─ SundaySchoolClassPlacement (dated class history)
 *
 * Every path that adds a child to a class needs both rows, or that child is
 * invisible to annual rollover and leaves no placement history. The CSV import
 * and the parent-registration review each grew their own copy of this; this is
 * the shared version for the paths added since.
 *
 * Idempotent: an existing enrollment for the year is reactivated rather than
 * duplicated (`@@unique([childId, sundaySchoolYearId])`), and a placement is
 * only opened when the child is not already actively placed in this class.
 *
 * Returns null when the level does not match the enrollment already on file —
 * the caller decides whether that is an error or a skipped row, since the
 * composite placement foreign key would otherwise fail opaquely.
 */
export async function enrollChildInClass(
  tx: PrismaTx,
  input: {
    childId: string
    classId: string
    sundaySchoolYearId: string
    level: SundaySchoolLevel
    movedById: string | null
    moveReason: string
  }
): Promise<{ enrollmentId: string } | null> {
  const { childId, classId, sundaySchoolYearId, level, movedById, moveReason } = input

  const existing = await tx.sundaySchoolEnrollment.findUnique({
    where: { childId_sundaySchoolYearId: { childId, sundaySchoolYearId } },
    select: {
      id: true,
      level: true,
      placements: { where: { endedAt: null }, select: { id: true, classId: true } },
    },
  })

  if (existing && existing.level !== level) return null

  const enrollment = existing
    ? await tx.sundaySchoolEnrollment.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', endedAt: null },
        select: { id: true },
      })
    : await tx.sundaySchoolEnrollment.create({
        data: { childId, sundaySchoolYearId, level },
        select: { id: true },
      })

  const activePlacement = existing?.placements[0]
  if (activePlacement?.classId === classId) {
    return { enrollmentId: enrollment.id }
  }

  const movedAt = new Date()
  if (activePlacement) {
    await tx.sundaySchoolClassPlacement.updateMany({
      where: { enrollmentId: enrollment.id, endedAt: null },
      data: { endedAt: movedAt, movedById, moveReason },
    })
  }

  await tx.sundaySchoolClassPlacement.create({
    data: {
      enrollmentId: enrollment.id,
      classId,
      sundaySchoolYearId,
      level,
      startedAt: movedAt,
      movedById,
      moveReason,
    },
  })

  return { enrollmentId: enrollment.id }
}
