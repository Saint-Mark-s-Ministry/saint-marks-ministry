import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { canServeClass, getSundaySchoolAccess } from '@/lib/sunday-school-access'

type ImportSummary = Record<string, Prisma.JsonValue>

function asSummary(value: Prisma.JsonValue | null): ImportSummary {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as ImportSummary
    : {}
}

// DELETE /api/sunday-school/roster-imports/[id]
// Removes only children created by this import. Existing children that the CSV
// merely matched are never deleted. Rows with subsequent activity are protected.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const rosterImport = await prisma.sundaySchoolRosterImport.findUnique({
      where: { id },
      select: {
        id: true,
        classId: true,
        status: true,
        summary: true,
        completedAt: true,
        class: {
          select: { academicYearId: true },
        },
        rows: {
          where: { outcome: 'CREATED' },
          select: {
            id: true,
            rowNumber: true,
            childId: true,
            enrollmentId: true,
            child: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                familyId: true,
                userId: true,
                classId: true,
                updatedAt: true,
                registrationRequest: { select: { id: true } },
                enrollments: { select: { id: true } },
                _count: {
                  select: {
                    attendance: true,
                    visitations: true,
                    phoneCalls: true,
                    guardians: true,
                    rosterImportRows: true,
                  },
                },
              },
            },
          },
          orderBy: { rowNumber: 'asc' },
        },
      },
    })

    if (!rosterImport) {
      return NextResponse.json({ error: 'Roster import not found' }, { status: 404 })
    }
    if (rosterImport.status !== 'COMMITTED') {
      return NextResponse.json({ error: 'Only completed imports can be undone' }, { status: 409 })
    }

    const access = await getSundaySchoolAccess(user, rosterImport.class.academicYearId)
    if (!canServeClass(access, rosterImport.classId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const removable = rosterImport.rows.filter(row => {
      const child = row.child
      if (!child || !row.enrollmentId) return false
      return !child.familyId &&
        !child.userId &&
        child.classId === rosterImport.classId &&
        (!rosterImport.completedAt || child.updatedAt <= rosterImport.completedAt) &&
        !child.registrationRequest &&
        child.enrollments.length === 1 &&
        child.enrollments[0]?.id === row.enrollmentId &&
        child._count.attendance === 0 &&
        child._count.visitations === 0 &&
        child._count.phoneCalls === 0 &&
        child._count.guardians === 0 &&
        child._count.rosterImportRows === 1
    })
    const protectedRows = rosterImport.rows.filter(row => row.child && !removable.includes(row))

    const result = await prisma.$transaction(async tx => {
      for (const row of removable) {
        await tx.sundaySchoolClassPlacement.deleteMany({
          where: { enrollmentId: row.enrollmentId! },
        })
        await tx.sundaySchoolEnrollment.delete({
          where: { id: row.enrollmentId! },
        })
        await tx.sundaySchoolChild.delete({
          where: { id: row.childId! },
        })
      }

      const priorSummary = asSummary(rosterImport.summary)
      const previousRollback = asSummary(priorSummary.rollback ?? null)
      const previousRemovedRows = typeof previousRollback.removedRows === 'number'
        ? previousRollback.removedRows
        : 0
      const removedRows = previousRemovedRows + removable.length
      const remainingRows = await tx.sundaySchoolRosterImportRow.count({
        where: {
          importId: rosterImport.id,
          outcome: 'CREATED',
          childId: { not: null },
        },
      })
      const rolledBackAt = remainingRows === 0 ? new Date().toISOString() : null

      const summary: Prisma.InputJsonObject = {
        ...priorSummary,
        rollback: {
          removedRows,
          protectedRows: remainingRows,
          lastAttemptedAt: new Date().toISOString(),
          lastAttemptedById: user.id,
          ...(rolledBackAt ? { rolledBackAt } : {}),
        },
      }
      await tx.sundaySchoolRosterImport.update({
        where: { id: rosterImport.id },
        data: { summary },
      })

      return { removedRows: removable.length, protectedRows: remainingRows, rolledBackAt }
    })

    return NextResponse.json({
      ...result,
      protectedStudents: protectedRows.map(row => ({
        rowNumber: row.rowNumber,
        name: `${row.child!.firstName} ${row.child!.lastName}`,
      })),
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
