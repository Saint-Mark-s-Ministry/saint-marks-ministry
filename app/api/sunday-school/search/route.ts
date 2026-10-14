import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import {
  getSundaySchoolAccess,
  visibleClassFilter,
} from "@/lib/sunday-school-access"
import { getLevelDisplayName, LEVEL_ORDER } from "@stmark/domain"
import type {
  SundaySchoolLevel,
  SundaySchoolSearchResponse,
} from "@stmark/contracts"

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const

function matchingLevels(query: string): SundaySchoolLevel[] {
  const normalized = query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  if (!normalized) return []
  return LEVEL_ORDER.filter((level) => {
    const label = getLevelDisplayName(level)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
    return label.includes(normalized) || normalized.includes(label)
  })
}

function matchingDate(query: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(query)
  if (iso) {
    const value = new Date(`${query}T00:00:00.000Z`)
    return Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== query
      ? null
      : value
  }

  const named = /^(?:([a-z]+)\s+(\d{1,2})|(\d{1,2})\s+([a-z]+))(?:,?\s+(\d{4}))?$/i.exec(
    query,
  )
  if (!named) return null
  const monthName = (named[1] ?? named[4]).toLowerCase()
  const month = MONTHS.findIndex((candidate) => candidate.startsWith(monthName))
  const day = Number(named[2] ?? named[3])
  const year = Number(named[5] ?? new Date().getUTCFullYear())
  if (month < 0 || day < 1 || day > 31) return null
  const value = new Date(Date.UTC(year, month, day))
  return value.getUTCFullYear() === year &&
    value.getUTCMonth() === month &&
    value.getUTCDate() === day
    ? value
    : null
}

// Summary-only universal search for Sunday School. Guardian and family contact
// data must remain in the protected child detail routes and is never selected.
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const access = await getSundaySchoolAccess(user)
    if (!access.canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const query = (searchParams.get("q") ?? "").trim().slice(0, 80)
    if (query.length < 2) {
      return NextResponse.json(
        { error: "Enter at least two characters" },
        { status: 400 },
      )
    }
    const requestedLimit = Number(searchParams.get("limit") ?? 5)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(10, Math.max(1, Math.trunc(requestedLimit)))
      : 5
    const terms = query.split(/\s+/).filter(Boolean)
    const allowedClassIds = visibleClassFilter(access)
    const classScope = allowedClassIds
      ? { classId: { in: allowedClassIds } }
      : {}
    const levels = matchingLevels(query)
    const date = matchingDate(query)

    const [children, classes, lessons] = await Promise.all([
      prisma.sundaySchoolChild.findMany({
        where: {
          isActive: true,
          ...classScope,
          AND: terms.map((term) => ({
            OR: [
              { firstName: { contains: term, mode: "insensitive" as const } },
              { lastName: { contains: term, mode: "insensitive" as const } },
            ],
          })),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          classId: true,
          level: true,
          class: { select: { name: true } },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: limit,
      }),
      prisma.sundaySchoolClass.findMany({
        where: {
          isActive: true,
          academicYear: { isActive: true },
          ...(allowedClassIds ? { id: { in: allowedClassIds } } : {}),
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            ...(levels.length ? [{ level: { in: levels } }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          level: true,
          _count: { select: { children: { where: { isActive: true } } } },
        },
        orderBy: { name: "asc" },
        take: limit,
      }),
      prisma.sundaySchoolWeeklyLesson.findMany({
        where: {
          ...classScope,
          class: { isActive: true, academicYear: { isActive: true } },
          OR: [
            {
              AND: terms.map((term) => ({
                OR: [
                  { title: { contains: term, mode: "insensitive" as const } },
                  { class: { name: { contains: term, mode: "insensitive" as const } } },
                  { resources: { some: { title: { contains: term, mode: "insensitive" as const } } } },
                ],
              })),
            },
            ...(date ? [{ sundayDate: date }] : []),
          ],
        },
        select: {
          id: true,
          classId: true,
          sundayDate: true,
          title: true,
          class: { select: { name: true, level: true } },
        },
        orderBy: { sundayDate: "desc" },
        take: limit,
      }),
    ])

    const response: SundaySchoolSearchResponse = {
      query,
      children: children.map((child) => ({
        kind: "child",
        id: child.id,
        title: `${child.firstName} ${child.lastName}`,
        subtitle: `${child.class?.name ?? "Unassigned"} · ${getLevelDisplayName(child.level)}`,
        classId: child.classId,
      })),
      classes: classes.map((schoolClass) => ({
        kind: "class",
        id: schoolClass.id,
        title: schoolClass.name,
        subtitle: `${getLevelDisplayName(schoolClass.level)} · ${schoolClass._count.children} ${schoolClass._count.children === 1 ? "child" : "children"}`,
      })),
      lessons: lessons.map((lesson) => ({
        kind: "lesson",
        id: lesson.id,
        title: lesson.title || "Weekly lesson",
        subtitle: `${lesson.class.name} · ${getLevelDisplayName(lesson.class.level)}`,
        classId: lesson.classId,
        sundayDate: lesson.sundayDate.toISOString(),
      })),
    }
    return NextResponse.json(response)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
