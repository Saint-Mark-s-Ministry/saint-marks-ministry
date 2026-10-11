import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import {
  canCoordinateClass,
  canServeClass,
  canViewServantAttendanceReport,
  getSundaySchoolAccess,
  visibleClassFilter,
} from "@/lib/sunday-school-access"
import { calculateAttendanceStats } from "@/lib/attendance"
import {
  findAgeGroupForLevel,
  getClassMeetingDay,
  getClassMeetingDayName,
  getMostRecentClassMeetingDate,
  getMostRecentSunday,
  sortClassesByAgeGroup,
} from "@/lib/sunday-school-class"
import {
  buildSundaySchoolAttendanceTrend,
  getSundaySchoolReportingRange,
} from "@/lib/sunday-school-dashboard"

// Sunday School mode: summary for the mode's landing page.
// Deliberately returns no guardian contact — that stays on the child routes.

// GET /api/sunday-school/dashboard
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    const { searchParams } = new URL(request.url)
    const requestedAcademicYearId = searchParams.get("academicYearId")
    const requestedClassId = searchParams.get("classId")
    const requestedAudience = searchParams.get("audience") ?? "children"
    if (requestedAudience !== "children" && requestedAudience !== "servants") {
      return NextResponse.json({ error: "Invalid attendance audience" }, { status: 400 })
    }

    const access = await getSundaySchoolAccess(user)
    if (!access.canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const allowedClassIds = visibleClassFilter(access)

    const [activeYear, academicYears] = await Promise.all([
      prisma.academicYear.findFirst({
        where: { isActive: true },
        select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
      }),
      prisma.academicYear.findMany({
        where: {
          sundaySchoolClasses: { some: {} },
          ...(access.visibleClassIds === "all"
            ? {}
            : { sundaySchoolServantAssignments: { some: { userId: user.id } } }),
        },
        select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
        orderBy: { startDate: "desc" },
      }),
    ])

    const selectedAcademicYear =
      academicYears.find(year => year.id === requestedAcademicYearId) ??
      academicYears.find(year => year.id === activeYear?.id) ??
      academicYears[0] ??
      null

    const [classes, ageGroups] = await Promise.all([
      prisma.sundaySchoolClass.findMany({
        where: {
          isActive: true,
          academicYearId: activeYear?.id ?? "__no_active_academic_year__",
          ...(allowedClassIds ? { id: { in: allowedClassIds } } : {}),
        },
        include: {
          assignments: {
            where: { endedAt: null },
            include: { user: { select: { id: true, name: true, profileImageUrl: true } } },
          },
          _count: { select: { children: true } },
          sessions: {
            where: { attendance: { some: {} } },
            orderBy: { date: "desc" },
            take: 1,
            select: { id: true, date: true, topic: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.sundaySchoolAgeGroup.findMany({
        where: { isActive: true },
        select: { id: true, name: true, levels: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ])

    const classIds = classes.map(c => c.id)

    const attendance = classIds.length
      ? await prisma.sundaySchoolChildAttendance.findMany({
          where: { session: { classId: { in: classIds } } },
          select: { status: true, session: { select: { classId: true } } },
        })
      : []

    const sessionCounts = classIds.length
      ? await prisma.sundaySchoolSession.groupBy({
          by: ["classId"],
          where: { classId: { in: classIds } },
          _count: { _all: true },
        })
      : []
    const sessionCountByClass = new Map(sessionCounts.map(s => [s.classId, s._count._all]))

    const thisSunday = getMostRecentSunday()

    let attendanceTrendPoints: ReturnType<typeof buildSundaySchoolAttendanceTrend> = []
    let attendanceTrendStart: Date | null = null
    let attendanceTrendEnd: Date | null = null
    let attendanceTrendClasses: Array<{ id: string; name: string }> = []
    let selectedTrendClassId: string | null = null
    let attendanceTrendMeetingDayLabel = "week"
    let canSelectTrendClass = false
    let canViewServantAttendance = false

    if (selectedAcademicYear) {
      const trendAccess =
        selectedAcademicYear.id === activeYear?.id
          ? access
          : await getSundaySchoolAccess(user, selectedAcademicYear.id)
      canViewServantAttendance = canViewServantAttendanceReport(trendAccess)

      if (requestedAudience === "servants" && !canViewServantAttendance) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }

      const allowedTrendClassIds = visibleClassFilter(trendAccess)
      const trendClasses = trendAccess.canRead
        ? await prisma.sundaySchoolClass.findMany({
            where: {
              academicYearId: selectedAcademicYear.id,
              ...(allowedTrendClassIds ? { id: { in: allowedTrendClassIds } } : {}),
            },
            select: { id: true, name: true, level: true },
            orderBy: { name: "asc" },
          })
        : []
      canSelectTrendClass =
        requestedAudience === "servants"
          ? canViewServantAttendance
          : trendAccess.isAdmin ||
            trendAccess.readOnly ||
            trendAccess.coordinatorClassIds.size > 0
      attendanceTrendClasses = canSelectTrendClass
        ? sortClassesByAgeGroup(trendClasses, ageGroups).map(({ id, name }) => ({ id, name }))
        : []
      selectedTrendClassId =
        trendClasses.some(cls => cls.id === requestedClassId)
          ? requestedClassId
          : null
      const selectedTrendClass = selectedTrendClassId
        ? trendClasses.find(cls => cls.id === selectedTrendClassId) ?? null
        : null
      const trendMeetingDay = selectedTrendClass
        ? getClassMeetingDay(selectedTrendClass.level)
        : 0
      attendanceTrendMeetingDayLabel = selectedTrendClass
        ? getClassMeetingDayName(selectedTrendClass.level)
        : "week"
      const trendClassIds = selectedTrendClassId
        ? [selectedTrendClassId]
        : trendClasses.map(cls => cls.id)
      const range = getSundaySchoolReportingRange(
        selectedAcademicYear.startDate,
        selectedAcademicYear.isActive,
        new Date(),
        trendMeetingDay
      )
      attendanceTrendStart = range.start
      attendanceTrendEnd = range.end
      const queryStart = selectedTrendClass
        ? range.start
        : new Date(range.start.getTime() - 24 * 60 * 60 * 1000)

      const trendSessions = trendClassIds.length
        ? requestedAudience === "servants"
          ? (await prisma.sundaySchoolSession.findMany({
              where: {
                classId: { in: trendClassIds },
                date: { gte: queryStart, lte: range.end },
              },
              select: {
                date: true,
                servantAttendance: { select: { status: true } },
              },
              orderBy: { date: "asc" },
            })).map(session => ({
              date: session.date,
              attendance: session.servantAttendance,
            }))
          : await prisma.sundaySchoolSession.findMany({
              where: {
                classId: { in: trendClassIds },
                date: { gte: queryStart, lte: range.end },
              },
              select: {
                date: true,
                attendance: { select: { status: true } },
              },
              orderBy: { date: "asc" },
            })
        : []

      attendanceTrendPoints = buildSundaySchoolAttendanceTrend(
        trendSessions,
        range.start,
        range.end,
        trendMeetingDay
      )
    }

    const summaries = classes.map(cls => {
      const classAttendance = attendance.filter(a => a.session.classId === cls.id)

      // Attendance rate across the marks actually recorded. Basing the
      // denominator on recorded marks rather than sessions × children keeps a
      // child added mid-year from dragging the class rate down for the weeks
      // before they joined. Reuses the app-wide formula (late = half, excused
      // excluded); shown as a plain rate, with none of the graduation framing.
      const stats = calculateAttendanceStats(
        classAttendance.map(a => ({ status: a.status })),
        classAttendance.length
      )

      const latestSession = cls.sessions[0] ?? null
      const band = findAgeGroupForLevel(cls.level, ageGroups)
      const currentClassWeek = getMostRecentClassMeetingDate(cls.level)

      return {
        id: cls.id,
        name: cls.name,
        level: cls.level,
        ageGroup: band ? { id: band.id, name: band.name } : null,
        childCount: cls._count.children,
        sessionCount: sessionCountByClass.get(cls.id) ?? 0,
        attendancePercentage: stats.percentage,
        latestSession,
        attendanceTakenThisWeek: latestSession
          ? new Date(latestSession.date).getTime() >= currentClassWeek.getTime()
          : false,
        canServe: canServeClass(access, cls.id),
        canCoordinate: canCoordinateClass(access, cls.id),
        servants: cls.assignments
          .filter(a => a.classId === cls.id)
          .map(a => ({
            id: a.user.id,
            name: a.user.name,
            profileImageUrl: a.user.profileImageUrl,
            isCoordinator: a.authority === "COORDINATOR",
          })),
      }
    })

    return NextResponse.json({
      classes: summaries,
      ageGroups: ageGroups.map(group => ({
        id: group.id,
        name: group.name,
        levels: group.levels,
        canCoordinate: access.isAdmin || access.coordinatorAgeGroupIds.has(group.id),
      })),
      totals: {
        classes: summaries.length,
        children: summaries.reduce((sum, c) => sum + c.childCount, 0),
        classesNeedingAttendance: summaries.filter(c => !c.attendanceTakenThisWeek).length,
        attendancePercentage: calculateAttendanceStats(
          attendance.map(a => ({ status: a.status })),
          attendance.length
        ).percentage,
      },
      standing: {
        isAdmin: access.isAdmin,
        readOnly: access.readOnly,
        coordinatesAnyAgeGroup: access.coordinatorAgeGroupIds.size > 0,
      },
      attendanceTrend: {
        audience: requestedAudience,
        points: attendanceTrendPoints,
        academicYears: academicYears.map(year => ({ id: year.id, name: year.name })),
        classes: attendanceTrendClasses,
        selectedAcademicYearId: selectedAcademicYear?.id ?? null,
        selectedClassId: selectedTrendClassId,
        canSelectClass: canSelectTrendClass,
        canViewServantAttendance,
        meetingDayLabel: attendanceTrendMeetingDayLabel,
        startDate: attendanceTrendStart?.toISOString() ?? null,
        endDate: attendanceTrendEnd?.toISOString() ?? null,
      },
      weekOf: thisSunday,
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
