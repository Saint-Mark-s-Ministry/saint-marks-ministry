import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { Prisma, SundaySchoolRosterImportRowOutcome } from '@prisma/client'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { canServeClass, getSundaySchoolAccess } from '@/lib/sunday-school-access'
import {
  normalizeRosterBirthDate,
  normalizeRosterGender,
  type SundaySchoolRosterCsvRow,
  validateSundaySchoolRosterRow,
} from '@/lib/sunday-school-roster-csv'

const MAX_IMPORT_ROWS = 250
const RECENT_IMPORT_LIMIT = 10

type ImportResultRow = {
  rowNumber: number
  outcome: SundaySchoolRosterImportRowOutcome
  message: string | null
}

function importResponse(rosterImport: {
  id: string
  status: string
  totalRows: number
  createdRows: number
  matchedRows: number
  skippedRows: number
  failedRows: number
  rows: ImportResultRow[]
}) {
  return {
    importId: rosterImport.id,
    status: rosterImport.status,
    totalRows: rosterImport.totalRows,
    createdRows: rosterImport.createdRows,
    matchedRows: rosterImport.matchedRows,
    skippedRows: rosterImport.skippedRows,
    failedRows: rosterImport.failedRows,
    rows: rosterImport.rows.map(row => ({
      rowNumber: row.rowNumber,
      outcome: row.outcome,
      message: row.message,
    })),
  }
}

function normalizeRequestRows(value: unknown): SundaySchoolRosterCsvRow[] | null {
  if (!Array.isArray(value)) return null
  return value.map((row, index) => {
    const input = row && typeof row === 'object' && !Array.isArray(row)
      ? row as Record<string, unknown>
      : {}
    const stringOrNull = (field: string) =>
      typeof input[field] === 'string' ? input[field].trim() || null : null

    return {
      rowNumber: Number.isInteger(input.rowNumber) && Number(input.rowNumber) > 1
        ? Number(input.rowNumber)
        : index + 2,
      firstName: typeof input.firstName === 'string' ? input.firstName.trim() : '',
      lastName: typeof input.lastName === 'string' ? input.lastName.trim() : '',
      gender: stringOrNull('gender') as SundaySchoolRosterCsvRow['gender'],
      birthDate: stringOrNull('birthDate'),
      guardianName: stringOrNull('guardianName'),
      guardianPhone: stringOrNull('guardianPhone'),
      guardianEmail: stringOrNull('guardianEmail')?.toLowerCase() ?? null,
      notes: stringOrNull('notes'),
    }
  })
}

function identityKey(row: Pick<SundaySchoolRosterCsvRow, 'firstName' | 'lastName' | 'birthDate'>) {
  return `${row.firstName.toLocaleLowerCase()}\u0000${row.lastName.toLocaleLowerCase()}\u0000${row.birthDate ?? ''}`
}

function rollbackSummary(summary: Prisma.JsonValue | null) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return { rolledBackAt: null, removedRows: 0, protectedRows: 0 }
  }

  const rollback = summary.rollback
  if (!rollback || typeof rollback !== 'object' || Array.isArray(rollback)) {
    return { rolledBackAt: null, removedRows: 0, protectedRows: 0 }
  }

  return {
    rolledBackAt: typeof rollback.rolledBackAt === 'string' ? rollback.rolledBackAt : null,
    removedRows: typeof rollback.removedRows === 'number' ? rollback.removedRows : 0,
    protectedRows: typeof rollback.protectedRows === 'number' ? rollback.protectedRows : 0,
  }
}

// GET /api/sunday-school/roster-imports?classId=...
// Returns a small audit history so a recently uploaded roster can be undone.
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const classId = new URL(request.url).searchParams.get('classId')?.trim() ?? ''
    if (!classId) {
      return NextResponse.json({ error: 'Choose a class to view imports' }, { status: 400 })
    }

    const targetClass = await prisma.sundaySchoolClass.findUnique({
      where: { id: classId },
      select: { id: true, academicYearId: true, isActive: true },
    })
    if (!targetClass || !targetClass.isActive) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    const access = await getSundaySchoolAccess(user, targetClass.academicYearId)
    if (!canServeClass(access, classId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const imports = await prisma.sundaySchoolRosterImport.findMany({
      where: { classId, status: 'COMMITTED' },
      orderBy: { createdAt: 'desc' },
      take: RECENT_IMPORT_LIMIT,
      select: {
        id: true,
        fileName: true,
        totalRows: true,
        createdRows: true,
        matchedRows: true,
        skippedRows: true,
        failedRows: true,
        summary: true,
        createdAt: true,
        completedAt: true,
      },
    })

    return NextResponse.json(imports.map(rosterImport => ({
      id: rosterImport.id,
      fileName: rosterImport.fileName,
      totalRows: rosterImport.totalRows,
      createdRows: rosterImport.createdRows,
      matchedRows: rosterImport.matchedRows,
      skippedRows: rosterImport.skippedRows,
      failedRows: rosterImport.failedRows,
      createdAt: rosterImport.createdAt,
      completedAt: rosterImport.completedAt,
      ...rollbackSummary(rosterImport.summary),
    })))
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/sunday-school/roster-imports
// Parses are previewed in the browser; this endpoint revalidates and commits
// the normalized rows without retaining the uploaded source file.
export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const classId = typeof body.classId === 'string' ? body.classId.trim() : ''
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim().slice(0, 255) : null
    const idempotencyKey = typeof body.idempotencyKey === 'string'
      ? body.idempotencyKey.trim().slice(0, 200)
      : ''
    const rows = normalizeRequestRows(body.rows)

    if (!classId) {
      return NextResponse.json({ error: 'Choose a class before importing' }, { status: 400 })
    }
    if (!idempotencyKey) {
      return NextResponse.json({ error: 'Import key is required' }, { status: 400 })
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'The CSV must contain at least one student' }, { status: 400 })
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `Import up to ${MAX_IMPORT_ROWS} students at a time` },
        { status: 400 }
      )
    }
    if (new Set(rows.map(row => row.rowNumber)).size !== rows.length) {
      return NextResponse.json({ error: 'CSV row numbers must be unique' }, { status: 400 })
    }

    const targetClass = await prisma.sundaySchoolClass.findUnique({
      where: { id: classId },
      select: {
        id: true,
        name: true,
        level: true,
        academicYearId: true,
        sundaySchoolYearId: true,
        isActive: true,
      },
    })
    if (!targetClass || !targetClass.isActive) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    if (!targetClass.sundaySchoolYearId) {
      return NextResponse.json(
        { error: 'This class is not linked to the current Sunday School year' },
        { status: 409 }
      )
    }

    const access = await getSundaySchoolAccess(user, targetClass.academicYearId)
    if (!canServeClass(access, classId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const normalizedRows = rows.map(row => ({
      ...row,
      gender: normalizeRosterGender(row.gender) ?? row.gender,
      birthDate: normalizeRosterBirthDate(row.birthDate) ?? row.birthDate,
    }))
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ classId, rows: normalizedRows }))
      .digest('hex')

    const existingImport = await prisma.sundaySchoolRosterImport.findUnique({
      where: {
        createdById_idempotencyKey: { createdById: user.id, idempotencyKey },
      },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    })
    if (existingImport) {
      if (existingImport.requestHash !== requestHash) {
        return NextResponse.json(
          { error: 'This import key was already used for a different roster' },
          { status: 409 }
        )
      }
      return NextResponse.json(importResponse(existingImport))
    }

    const uniqueNames = Array.from(new Map(normalizedRows.map(row => [
      `${row.firstName.toLocaleLowerCase()}\u0000${row.lastName.toLocaleLowerCase()}`,
      { firstName: row.firstName, lastName: row.lastName },
    ])).values())

    const existingChildren = await prisma.sundaySchoolChild.findMany({
      where: {
        OR: uniqueNames.map(name => ({
          firstName: { equals: name.firstName, mode: 'insensitive' as const },
          lastName: { equals: name.lastName, mode: 'insensitive' as const },
        })),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        classId: true,
        class: { select: { name: true } },
        enrollments: {
          where: { sundaySchoolYearId: targetClass.sundaySchoolYearId },
          select: {
            id: true,
            level: true,
            status: true,
            placements: {
              where: { endedAt: null },
              select: { id: true, classId: true },
            },
          },
        },
      },
    })

    const completed = await prisma.$transaction(async tx => {
      const rosterImport = await tx.sundaySchoolRosterImport.create({
        data: {
          sundaySchoolYearId: targetClass.sundaySchoolYearId!,
          classId,
          idempotencyKey,
          requestHash,
          fileName,
          status: 'IN_PROGRESS',
          totalRows: normalizedRows.length,
          createdById: user.id,
        },
      })

      const resultRows: ImportResultRow[] = []
      const seen = new Set<string>()
      let createdRows = 0
      let matchedRows = 0
      let skippedRows = 0
      let failedRows = 0

      const record = async (
        row: SundaySchoolRosterCsvRow,
        outcome: SundaySchoolRosterImportRowOutcome,
        message: string | null,
        childId?: string,
        enrollmentId?: string
      ) => {
        await tx.sundaySchoolRosterImportRow.create({
          data: {
            importId: rosterImport.id,
            rowNumber: row.rowNumber,
            outcome,
            message,
            childId,
            enrollmentId,
            errorCode: outcome === 'FAILED' ? 'ROW_VALIDATION_OR_CONFLICT' : null,
          },
        })
        resultRows.push({ rowNumber: row.rowNumber, outcome, message })
      }

      for (const row of normalizedRows) {
        const validationErrors = validateSundaySchoolRosterRow(row)
        if (validationErrors.length > 0) {
          failedRows += 1
          await record(row, 'FAILED', validationErrors.map(error => error.message).join('; '))
          continue
        }

        const key = identityKey(row)
        if (seen.has(key)) {
          skippedRows += 1
          await record(row, 'SKIPPED', 'Duplicate row in this CSV file')
          continue
        }
        seen.add(key)

        const nameMatches = existingChildren.filter(child =>
          child.firstName.localeCompare(row.firstName, undefined, { sensitivity: 'accent' }) === 0 &&
          child.lastName.localeCompare(row.lastName, undefined, { sensitivity: 'accent' }) === 0
        )
        const exactBirthDateMatches = row.birthDate
          ? nameMatches.filter(child => child.birthDate?.toISOString().slice(0, 10) === row.birthDate)
          : []
        const missingBirthDateMatches = row.birthDate && exactBirthDateMatches.length === 0
          ? nameMatches.filter(child => !child.birthDate)
          : []
        const identityMatches = row.birthDate
          ? exactBirthDateMatches.length > 0
            ? exactBirthDateMatches
            : missingBirthDateMatches
          : nameMatches

        if (identityMatches.length > 1) {
          failedRows += 1
          await record(row, 'FAILED', 'More than one existing child matches this row; add a birth date or resolve manually')
          continue
        }

        const existingChild = identityMatches[0]
        if (existingChild?.classId && existingChild.classId !== classId) {
          failedRows += 1
          await record(
            row,
            'FAILED',
            `${row.firstName} ${row.lastName} is already assigned to ${existingChild.class?.name ?? 'another class'}`
          )
          continue
        }

        if (existingChild) {
          const enrollment = existingChild.enrollments[0]
          if (enrollment && enrollment.level !== targetClass.level) {
            failedRows += 1
            await record(row, 'FAILED', 'Existing enrollment is assigned to a different grade')
            continue
          }
          const activePlacement = enrollment?.placements[0]
          if (activePlacement && activePlacement.classId !== classId) {
            failedRows += 1
            await record(row, 'FAILED', 'Existing enrollment is placed in another class')
            continue
          }

          await tx.sundaySchoolChild.update({
            where: { id: existingChild.id },
            data: {
              classId,
              level: targetClass.level,
              status: 'ACTIVE',
              isActive: true,
              ...(row.gender ? { gender: row.gender } : {}),
              ...(row.birthDate ? { birthDate: new Date(`${row.birthDate}T00:00:00.000Z`) } : {}),
              ...(row.guardianName ? { guardianName: row.guardianName } : {}),
              ...(row.guardianPhone ? { guardianPhone: row.guardianPhone } : {}),
              ...(row.guardianEmail ? { guardianEmail: row.guardianEmail } : {}),
              ...(row.notes ? { notes: row.notes } : {}),
            },
          })

          const resolvedEnrollment = enrollment
            ? await tx.sundaySchoolEnrollment.update({
                where: { id: enrollment.id },
                data: { status: 'ACTIVE', endedAt: null },
              })
            : await tx.sundaySchoolEnrollment.create({
                data: {
                  childId: existingChild.id,
                  sundaySchoolYearId: targetClass.sundaySchoolYearId!,
                  level: targetClass.level,
                },
              })
          if (!activePlacement) {
            await tx.sundaySchoolClassPlacement.create({
              data: {
                enrollmentId: resolvedEnrollment.id,
                classId,
                sundaySchoolYearId: targetClass.sundaySchoolYearId!,
                level: targetClass.level,
                movedById: user.id,
                moveReason: 'Roster CSV import',
              },
            })
          }

          matchedRows += 1
          await record(row, 'MATCHED', 'Matched an existing child', existingChild.id, resolvedEnrollment.id)
          continue
        }

        const child = await tx.sundaySchoolChild.create({
          data: {
            firstName: row.firstName,
            lastName: row.lastName,
            level: targetClass.level,
            classId,
            birthDate: row.birthDate ? new Date(`${row.birthDate}T00:00:00.000Z`) : null,
            gender: row.gender,
            guardianName: row.guardianName,
            guardianPhone: row.guardianPhone,
            guardianEmail: row.guardianEmail,
            notes: row.notes,
            status: 'ACTIVE',
            isActive: true,
          },
        })
        const enrollment = await tx.sundaySchoolEnrollment.create({
          data: {
            childId: child.id,
            sundaySchoolYearId: targetClass.sundaySchoolYearId!,
            level: targetClass.level,
          },
        })
        await tx.sundaySchoolClassPlacement.create({
          data: {
            enrollmentId: enrollment.id,
            classId,
            sundaySchoolYearId: targetClass.sundaySchoolYearId!,
            level: targetClass.level,
            movedById: user.id,
            moveReason: 'Roster CSV import',
          },
        })

        createdRows += 1
        await record(row, 'CREATED', null, child.id, enrollment.id)
      }

      const summary: Prisma.InputJsonObject = {
        className: targetClass.name,
        createdRows,
        matchedRows,
        skippedRows,
        failedRows,
      }
      const updated = await tx.sundaySchoolRosterImport.update({
        where: { id: rosterImport.id },
        data: {
          status: 'COMMITTED',
          createdRows,
          matchedRows,
          skippedRows,
          failedRows,
          summary,
          completedAt: new Date(),
        },
      })

      return { ...updated, rows: resultRows }
    })

    return NextResponse.json(importResponse(completed), { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
