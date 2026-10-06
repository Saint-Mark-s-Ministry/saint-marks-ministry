import { describe, expect, it } from "vitest";
import {
  attendanceGuidance,
  canViewOwnProgress,
  currentConfessionPeriod,
  examGuidance,
  nextLesson,
  periodLastDay,
  periodTitle,
  recentMarks,
  standingLabel,
  type LessonItem,
} from "../../apps/mobile/src/data/prep-progress";

const attendance = (over: Partial<Parameters<typeof attendanceGuidance>[0]> = {}) => ({
  percentage: 93.6,
  effectivePresent: 36.5,
  totalLessons: 39,
  allLessons: 39,
  excusedCount: 0,
  met: true,
  required: 75,
  ...over,
});

const exams = (over: Partial<Parameters<typeof examGuidance>[0]> = {}) => ({
  overallAverage: 81.3,
  overallAverageMet: true,
  allSectionsPassing: true,
  sectionAverages: [],
  missingExams: [],
  examsTaken: 3,
  totalApplicableExams: 3,
  requiredAverage: 75,
  ...over,
});

describe("standing and guidance", () => {
  it("names the server's graduation result in plain words", () => {
    expect(standingLabel(true)).toBe("On track");
    expect(standingLabel(false)).toBe("Needs attention");
  });

  it("counts how many absences of buffer remain when met", () => {
    // 36.5 / 0.75 - 39 = 9.67 → 9 absences of buffer
    expect(attendanceGuidance(attendance())).toEqual({
      status: "on-track",
      message: "9 absences of buffer remaining",
      detail: "You can miss up to 9 more lessons before dropping below 75%",
    });
  });

  it("says how many lessons in a row recover attendance when below goal", () => {
    // (6 + n) / (10 + n) >= 0.75 → n = 6
    const guidance = attendanceGuidance(attendance({ percentage: 60, effectivePresent: 6, totalLessons: 10, allLessons: 10, met: false }));
    expect(guidance.status).toBe("failing");
    expect(guidance.message).toBe("Attend the next 6 lessons in a row to recover");
  });

  it("has no attendance guidance before any lesson is recorded", () => {
    expect(attendanceGuidance(attendance({ percentage: null, allLessons: 0, effectivePresent: 0, totalLessons: 0 })).status).toBe("no-data");
  });

  it("states the score needed on the remaining exams when at risk", () => {
    // 2 taken averaging 70, 1 missing: need (3 * 75 - 140) / 1 = 85
    const guidance = examGuidance(exams({ overallAverage: 70, overallAverageMet: false, examsTaken: 2, totalApplicableExams: 3, missingExams: [{ id: "e3", sectionDisplayName: "Liturgy" }] }));
    expect(guidance).toMatchObject({ status: "at-risk", message: "Average 85% or higher on the remaining 1 exam" });
  });

  it("states the score needed to stay on track when the average is met", () => {
    // 2 taken averaging 80, 1 missing: need (225 - 160) / 1 = 65
    const guidance = examGuidance(exams({ overallAverage: 80, examsTaken: 2, totalApplicableExams: 3, missingExams: [{ id: "e3", sectionDisplayName: "Liturgy" }] }));
    expect(guidance).toMatchObject({ status: "on-track", message: "Score 65% or higher on the remaining 1 exam to stay on track" });
  });
});

describe("lessons", () => {
  const lesson = (id: string, scheduledDate: string, status: LessonItem["status"], attendanceStatus?: "PRESENT" | "ABSENT" | "LATE"): LessonItem => ({
    id,
    title: id,
    lessonNumber: Number(id.replace(/\D/g, "")) || 0,
    scheduledDate,
    status,
    attendance: attendanceStatus ? { status: attendanceStatus } : null,
  });

  it("picks the earliest upcoming scheduled lesson, skipping completed ones", () => {
    const lessons = [
      lesson("L3", "2026-10-09T00:00:00.000Z", "SCHEDULED"),
      lesson("L1", "2026-09-25T00:00:00.000Z", "COMPLETED", "PRESENT"),
      lesson("L2", "2026-10-02T00:00:00.000Z", "SCHEDULED"),
    ];
    expect(nextLesson(lessons, "2026-10-02")?.id).toBe("L2");
    expect(nextLesson([lessons[1]], "2026-10-02")).toBeNull();
  });

  it("lists recorded marks oldest first, each with a letter and a word", () => {
    const lessons = [
      lesson("L3", "2026-10-09T00:00:00.000Z", "COMPLETED", "ABSENT"),
      lesson("L1", "2026-09-25T00:00:00.000Z", "COMPLETED", "PRESENT"),
      lesson("L2", "2026-10-02T00:00:00.000Z", "COMPLETED", "LATE"),
      lesson("L4", "2026-10-16T00:00:00.000Z", "SCHEDULED"),
    ];
    expect(recentMarks(lessons).map((m) => `${m.mark}:${m.word}`)).toEqual(["P:Present", "L:Late", "A:Absent"]);
  });
});

describe("confession period", () => {
  const periods = [
    { start: "2026-09-01T00:00:00.000Z", end: "2026-11-01T00:00:00.000Z", status: "due" as const, uploadedAt: null },
    { start: "2026-11-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z", status: "upcoming" as const, uploadedAt: null },
  ];

  it("finds the period containing now", () => {
    expect(currentConfessionPeriod(periods, new Date("2026-10-15T00:00:00.000Z"))?.status).toBe("due");
    expect(currentConfessionPeriod(periods, new Date("2025-01-01T00:00:00.000Z"))).toBeNull();
  });

  it("reads the period as the student does: span and last day", () => {
    expect(periodTitle(periods[0])).toBe("Sep–Oct 2026");
    expect(periodLastDay(periods[0])).toBe("Oct 31");
  });
});

describe("permission", () => {
  it("only a STUDENT sees the progress screen, and only for their own record", () => {
    expect(canViewOwnProgress("STUDENT")).toBe(true);
    for (const role of ["MENTOR", "SERVANT_PREP", "PRIEST", "SUPER_ADMIN", "SERVANT", null, undefined]) {
      expect(canViewOwnProgress(role)).toBe(false);
    }
  });
});
