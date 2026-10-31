import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { elapsedRotationWeeks as serverElapsedWeeks } from "../../lib/sunday-school-utils";
import {
  ASYNC_BASIS_NOTE,
  ASYNC_BASIS_NOTE_STAFF,
  ROTATION_COMPLETION_NOTE,
  ROTATION_WORKFLOW,
  activeRotation,
  approvedRotationCount,
  asyncAttendanceGuidance,
  attendanceCaption,
  attendanceShort,
  attendanceTerms,
  elapsedRotationWeeks,
  isAsyncRow,
  rotationRequirement,
  rotationState,
  rotationWeekRows,
  type PrepAnalyticsRotation,
  type PrepAnalyticsSundaySchool,
} from "../../apps/mobile/src/data/rotation-attendance";
import { attendanceGuidance, progressAttendanceGuidance, ATTENDANCE_GOAL } from "../../apps/mobile/src/data/prep-progress";
import {
  dropAsyncMarks,
  offRollCallNote,
  rollCallChangeNotice,
  splitRollCall,
} from "../../apps/mobile/src/data/prep-attendance";
import { studentRowSubtitle } from "../../apps/mobile/src/data/prep-students";
import { attendanceLabel, lessonsAreAsync, type StudentLesson } from "../../apps/mobile/src/data/prep-lessons";
import { hasAsyncMentee, menteeAttendanceLabel } from "../../apps/mobile/src/data/prep-mentor";
import { formatPercent } from "../../apps/mobile/src/data/format-percent";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// Tuesday, Oct 27 2026. A rotation that began Sunday Oct 18 has two weeks elapsed.
const NOW = new Date("2026-10-27T12:00:00Z");
const START = "2026-10-18T00:00:00.000Z";

function rotation(over: Partial<PrepAnalyticsRotation> = {}): PrepAnalyticsRotation {
  return {
    id: "a1",
    class: { level: "GRADE_2" },
    rotationForm: null,
    grade: "GRADE_2",
    yearLevel: null,
    academicYear: { id: "y", name: "2026–2027" },
    totalWeeks: 4,
    startDate: START,
    isActive: true,
    attendance: null,
    weeks: [1, 2, 3, 4].map((weekNumber) => ({
      weekNumber,
      weekOf: new Date(Date.parse(START) + (weekNumber - 1) * 7 * 24 * 3600 * 1000).toISOString(),
      status: null,
    })),
    ...over,
  };
}

const school = (over: Partial<PrepAnalyticsSundaySchool> = {}): PrepAnalyticsSundaySchool => ({
  assignments: [rotation()],
  needsRotation: false,
  allMet: false,
  ...over,
});

const asyncAttendance = (over: Partial<Parameters<typeof attendanceCaption>[0]> = {}) => ({
  effectivePresent: 2,
  totalLessons: 2,
  percentage: 100 as number | null,
  ...over,
});

describe("elapsed rotation weeks", () => {
  it("matches the server's arithmetic on both sides of each week boundary", () => {
    const starts = ["2026-10-18T00:00:00.000Z", "2026-09-06T00:00:00.000Z"];
    const nows = ["2026-10-17T23:59:59Z", "2026-10-18T00:00:00Z", "2026-10-24T23:59:59Z", "2026-10-25T00:00:00Z", "2026-11-30T00:00:00Z"];
    for (const start of starts) {
      for (const total of [4, 6]) {
        for (const now of nows) {
          expect(elapsedRotationWeeks(start, total, new Date(now))).toBe(serverElapsedWeeks(start, total, new Date(now)));
        }
      }
    }
  });

  it("is zero before the rotation starts and never passes its length", () => {
    expect(elapsedRotationWeeks(START, 4, new Date("2026-10-10T00:00:00Z"))).toBe(0);
    expect(elapsedRotationWeeks(START, 4, new Date("2027-03-01T00:00:00Z"))).toBe(4);
  });
});

describe("rotation week rows", () => {
  it("shows weeks that have not started as upcoming, never as missed", () => {
    const rows = rotationWeekRows(rotation(), NOW);
    expect(rows.map((row) => row.state)).toEqual(["missed", "missed", "upcoming", "upcoming"]);
    expect(rows[2].label).toBe("Upcoming");
    expect(rows.every((row) => row.date.length > 0)).toBe(true);
  });

  it("labels credited and excused weeks, and counts only an unlogged started week as not credited", () => {
    const rows = rotationWeekRows(
      rotation({
        weeks: [
          { weekNumber: 1, weekOf: "2026-10-18T00:00:00.000Z", status: "MANUAL" },
          { weekNumber: 2, weekOf: "2026-10-25T00:00:00.000Z", status: "EXCUSED" },
          { weekNumber: 3, weekOf: "2026-11-01T00:00:00.000Z", status: null },
          { weekNumber: 4, weekOf: "2026-11-08T00:00:00.000Z", status: null },
        ],
      }),
      NOW,
    );
    expect(rows.map((row) => row.label)).toEqual(["Present", "Excused", "Upcoming", "Upcoming"]);
  });

  it("treats a rotation that has not begun as all upcoming", () => {
    const rows = rotationWeekRows(rotation({ startDate: "2026-11-15T00:00:00.000Z" }), NOW);
    expect(rows.every((row) => row.state === "upcoming")).toBe(true);
  });

  it("uses UTC calendar days so the date never shifts with the device zone", () => {
    expect(rotationWeekRows(rotation(), NOW)[0].date).toBe("Oct 18");
  });
});

describe("async from the start (no lesson history)", () => {
  it("reads rotation weeks, in the metric's own words", () => {
    expect(attendanceTerms(true)).toMatchObject({ title: "Rotation attendance", unit: "rotation weeks", requirement: "Rotation attendance ≥ 75%" });
    expect(attendanceCaption(asyncAttendance({ effectivePresent: 1, totalLessons: 2, percentage: 50 }), true, ATTENDANCE_GOAL)).toBe(
      "1 of 2 rotation weeks counted · Goal 75%",
    );
  });

  it("renders no data as no data, not 0%", () => {
    const caption = attendanceCaption(asyncAttendance({ effectivePresent: 0, totalLessons: 0, percentage: null }), true, ATTENDANCE_GOAL);
    expect(caption).toBe("No rotation weeks counted yet · Goal 75%");
    expect(caption).not.toMatch(/0 of 0/);
    expect(attendanceShort({ isAsyncStudent: true, attendancePercentage: null }, formatPercent)).toBe("Rotation —");
  });

  it("gives no-data guidance without a percentage, and names no lesson rules", () => {
    const guidance = asyncAttendanceGuidance({ percentage: null, met: true }, school(), NOW);
    expect(guidance.status).toBe("no-data");
  });
});

describe("switched to async with earlier lessons on record", () => {
  it("never speaks of absence buffers or recovering in a row, met or not", () => {
    for (const met of [true, false]) {
      const guidance = asyncAttendanceGuidance({ percentage: met ? 100 : 40, met }, school(), NOW);
      const text = `${guidance.message} ${guidance.detail}`;
      expect(text).not.toMatch(/buffer|absence|in a row|recover|more lesson/i);
      expect(guidance.status).toBe(met ? "on-track" : "failing");
      expect(guidance.detail).toBe(ASYNC_BASIS_NOTE);
    }
  });

  it("dispatches on the server's async flag, so lesson-absence guidance cannot reach an async student", () => {
    const attendance = { percentage: 93, effectivePresent: 36.5, totalLessons: 39, allLessons: 39, excusedCount: 0, met: true, required: 75 };
    const asyncProgress = { enrollment: { isAsyncStudent: true }, attendance, sundaySchool: school() };
    const inPerson = { enrollment: { isAsyncStudent: false }, attendance, sundaySchool: undefined };
    expect(progressAttendanceGuidance(asyncProgress as never, NOW).message).not.toMatch(/buffer/);
    expect(progressAttendanceGuidance(asyncProgress as never, NOW).detail).toBe(ASYNC_BASIS_NOTE);
    expect(progressAttendanceGuidance(inPerson as never, NOW)).toEqual(attendanceGuidance(attendance));
  });
});

describe("future rotation weeks", () => {
  it("says a not-yet-started rotation starts later and that nothing counts against the student", () => {
    const upcoming = school({ assignments: [rotation({ startDate: "2026-11-15T00:00:00.000Z" })] });
    const state = rotationState(upcoming, NOW);
    expect(state.kind).toBe("upcoming");
    expect(state.title).toBe("2nd Grade rotation starts November 15");
    expect(state.detail).toMatch(/can't be missed/);
    expect(asyncAttendanceGuidance({ percentage: null, met: true }, upcoming, NOW).message).toBe(state.title);
  });

  it("is in progress once a week has started, naming which one", () => {
    expect(rotationState(school(), NOW)).toMatchObject({ kind: "in-progress", title: "2nd Grade · week 2 of 4" });
  });
});

describe("no rotation assignment", () => {
  const unassigned = school({ assignments: [], needsRotation: true });

  it("explains that a servant assigns the first class and that nothing counts until then", () => {
    const state = rotationState(unassigned, NOW);
    expect(state.kind).toBe("unassigned");
    expect(state.title).toBe("No rotation assigned yet");
    expect(state.detail).toMatch(/servant assigns your first Sunday School class/);
  });

  it("asks the student to have a servant assign it", () => {
    expect(asyncAttendanceGuidance({ percentage: null, met: false }, unassigned, NOW).message).toBe("Ask a servant to assign your rotation");
  });

  it("labels the completion requirement as not assigned rather than as an attendance failure", () => {
    expect(rotationRequirement(unassigned, false)).toMatchObject({
      title: "Sunday School rotation · not assigned yet",
      unmetLabel: "Not assigned",
      met: false,
    });
  });

  it("speaks about the student, not to them, for a servant or mentor", () => {
    const state = rotationState(unassigned, NOW, "staff");
    expect(state.detail).toMatch(/until a servant assigns a Sunday School class and start date/);
    expect(state.detail).not.toMatch(/\byou(r)?\b/i);
    expect(rotationRequirement(unassigned, false, "staff").caption).toBe("Assign a rotation in Async students");
    expect(rotationState(school(), NOW, "staff").detail).not.toMatch(/\byour\b/);
    const upcoming = school({ assignments: [rotation({ startDate: "2026-11-15T00:00:00.000Z" })] });
    expect(rotationState(upcoming, NOW, "staff").detail).toMatch(/against the student/);
    expect(ASYNC_BASIS_NOTE_STAFF).not.toMatch(/\byour\b/);
  });

  it("treats a missing sundaySchool block like no assignment", () => {
    expect(rotationState(undefined, NOW).kind).toBe("unassigned");
  });
});

describe("completion is separate from the 75% attendance metric", () => {
  it("counts approved grades once each, whatever the attendance", () => {
    const approved = (level: string) =>
      rotation({ isActive: false, class: { level }, grade: level, rotationForm: { status: "APPROVED", level } });
    const history = school({ assignments: [approved("PRE_K"), approved("PRE_K"), approved("GRADE_1"), rotation()] });
    expect(approvedRotationCount(history)).toBe(2);
    expect(rotationRequirement(history, false)).toMatchObject({
      title: "All ten four-week rotations approved",
      caption: "2 of 10 rotations approved",
      unmetLabel: "In progress",
    });
    expect(rotationRequirement(history, true).metLabel).toBe("Complete");
  });

  it("does not count a pending or returned form as approved", () => {
    const pending = rotation({ isActive: false, rotationForm: { status: "PENDING", level: "GRADE_2" } });
    expect(approvedRotationCount(school({ assignments: [pending] }))).toBe(0);
  });

  it("says a full 100% rotation attendance still needs all ten rotations", () => {
    expect(ROTATION_COMPLETION_NOTE).toMatch(/separate from the 75% rotation attendance goal/);
  });

  it("has an active rotation only while one is open", () => {
    expect(activeRotation(school())?.id).toBe("a1");
    expect(activeRotation(school({ assignments: [rotation({ isActive: false })] }))).toBeNull();
    expect(rotationState(school({ assignments: [rotation({ isActive: false })], allMet: true }), NOW).kind).toBe("complete");
  });
});

describe("the signed four-week workflow", () => {
  it("covers attend, sign, upload after week four, and servant approval", () => {
    expect(ROTATION_WORKFLOW).toHaveLength(4);
    expect(ROTATION_WORKFLOW.join(" ")).toMatch(/four weeks/);
    expect(ROTATION_WORKFLOW.join(" ")).toMatch(/signed/);
    expect(ROTATION_WORKFLOW.join(" ")).toMatch(/photo or PDF/);
    expect(ROTATION_WORKFLOW.join(" ")).toMatch(/servant checks the signatures and approves/);
  });
});

describe("in-person students are unchanged", () => {
  it("keeps the lesson wording and the buffer guidance", () => {
    expect(attendanceTerms(false)).toEqual({ title: "Attendance", short: "Att", unit: "lessons", requirement: "Attendance ≥ 75%" });
    expect(attendanceCaption({ effectivePresent: 36.5, totalLessons: 39, percentage: 93.6 }, false, 75)).toBe("36.5 of 39 lessons counted · Goal 75%");
    expect(attendanceShort({ isAsyncStudent: false, attendancePercentage: 80 }, formatPercent)).toBe("Att 80%");
    expect(attendanceShort({ attendancePercentage: 80 }, formatPercent)).toBe("Att 80%");
  });

  it("keeps the row subtitles", () => {
    expect(studentRowSubtitle({ yearLevel: "YEAR_1", attendancePercentage: 80, examAverage: 70 }, "Year 1", formatPercent)).toBe("Att 80% · Exam 70%");
    expect(studentRowSubtitle({ yearLevel: "YEAR_1", attendancePercentage: null, examAverage: null }, "Year 1", formatPercent)).toBe("Year 1 · no scores yet");
    expect(studentRowSubtitle({ isAsyncStudent: true, yearLevel: null, attendancePercentage: 75, examAverage: null }, "No cohort year", formatPercent)).toBe(
      "Rotation 75% · Exam —",
    );
    expect(studentRowSubtitle({ isAsyncStudent: true, yearLevel: null, attendancePercentage: null, examAverage: null }, "No cohort year", formatPercent)).toBe(
      "Async student · no scores yet",
    );
  });

  it("treats only an exactly-true flag as async", () => {
    expect(isAsyncRow({ isAsyncStudent: true })).toBe(true);
    expect(isAsyncRow({ isAsyncStudent: false })).toBe(false);
    expect(isAsyncRow({})).toBe(false);
    expect(isAsyncRow(undefined)).toBe(false);
    expect(isAsyncRow({ isAsyncStudent: "true" as never })).toBe(false);
  });

  it("keeps the mentee label for in-person students", () => {
    expect(menteeAttendanceLabel({})).toBe("Attend");
    expect(menteeAttendanceLabel({ isAsyncStudent: true })).toBe("Rotation");
    expect(hasAsyncMentee([{}, { isAsyncStudent: true }])).toBe(true);
    expect(hasAsyncMentee([{}, { isAsyncStudent: false }])).toBe(false);
  });
});

describe("student lessons for an async student", () => {
  const lesson = (over: Partial<StudentLesson> = {}): StudentLesson => ({
    id: "l1",
    title: "L",
    lessonNumber: 1,
    scheduledDate: "2026-10-02T18:00:00.000Z",
    status: "COMPLETED",
    resources: [],
    attendance: null,
    ...over,
  });

  it("says a past lesson is not counted, never not recorded or absent", () => {
    expect(attendanceLabel(lesson({ asyncPeriod: true }), NOW)).toBe("Not counted");
    expect(attendanceLabel(lesson({ asyncPeriod: true, status: "SCHEDULED" }), NOW)).toBe("Not counted");
    expect(attendanceLabel(lesson({ asyncPeriod: true, scheduledDate: "2026-11-20T18:00:00.000Z", status: "SCHEDULED" }), NOW)).toBe("Upcoming");
    expect(attendanceLabel(lesson({ asyncPeriod: true, status: "CANCELLED" }), NOW)).toBe("Cancelled");
  });

  it("ignores a stale lesson record on an async lesson", () => {
    expect(attendanceLabel(lesson({ asyncPeriod: true, attendance: { status: "ABSENT" } }), NOW)).toBe("Not counted");
  });

  it("keeps in-person labels", () => {
    expect(attendanceLabel(lesson(), NOW)).toBe("Not recorded");
    expect(attendanceLabel(lesson({ attendance: { status: "PRESENT" } }), NOW)).toBe("Present");
    expect(attendanceLabel(lesson({ asyncPeriod: false, attendance: { status: "ABSENT" } }), NOW)).toBe("Absent");
  });

  it("detects async from the server's mark on the lessons", () => {
    expect(lessonsAreAsync([{ asyncPeriod: true }])).toBe(true);
    expect(lessonsAreAsync([{ asyncPeriod: false }, {}])).toBe(false);
    expect(lessonsAreAsync([])).toBe(false);
  });
});

describe("the roll call", () => {
  const enrollment = (id: string, name: string, isAsyncStudent?: boolean) => ({ studentId: id, isAsyncStudent, student: { name } });

  it("keeps async students off the roster and lists them separately", () => {
    const { roster, offRoll } = splitRollCall([enrollment("a", "Ann"), enrollment("b", "Ben", true), enrollment("c", "Cy", false)]);
    expect(roster.map((e) => e.studentId)).toEqual(["a", "c"]);
    expect(offRoll.map((e) => e.studentId)).toEqual(["b"]);
  });

  it("drops draft marks for a student who became async and leaves the rest", () => {
    const draft = { a: { status: "PRESENT" as const }, b: { status: "ABSENT" as const, notes: "x" } };
    const { draft: next, dropped } = dropAsyncMarks(draft, ["b", "z"]);
    expect(dropped).toEqual(["b"]);
    expect(next).toEqual({ a: { status: "PRESENT" } });
    expect(draft.b).toBeDefined(); // the input is not mutated
  });

  it("returns the same draft when no async student had a mark", () => {
    const draft = { a: { status: "PRESENT" as const } };
    const result = dropAsyncMarks(draft, ["b"]);
    expect(result.draft).toBe(draft);
    expect(result.dropped).toEqual([]);
  });

  it("explains who is off the roll call and why", () => {
    expect(offRollCallNote(["Ben", "Dee"])).toBe(
      "Not on this roll call (async): Ben, Dee. Their attendance comes from their Sunday School rotation. Normal lessons do not count.",
    );
  });

  it("describes a change under an open roll call, with and without discarded marks", () => {
    expect(rollCallChangeNotice({ becameAsync: ["Ben"], markedDropped: ["Ben"], leftAsync: [] })).toBe(
      "Ben is now async and is off this roll call. Their marks on this roll call were discarded and won't be saved.",
    );
    expect(rollCallChangeNotice({ becameAsync: ["Ben", "Dee"], markedDropped: [], leftAsync: [] })).toBe(
      "Ben, Dee are now async and are off this roll call.",
    );
    expect(rollCallChangeNotice({ becameAsync: [], markedDropped: [], leftAsync: ["Cy"] })).toBe(
      "Cy is no longer async and is back on this roll call. Check their mark before saving.",
    );
    expect(rollCallChangeNotice({ becameAsync: [], markedDropped: [], leftAsync: [] })).toBeNull();
  });
});

describe("wiring", () => {
  it("the student progress screen reads rotation attendance and skips lessons for an async student", () => {
    const source = read("apps/mobile/src/app/prep-progress.tsx");
    expect(source).toContain("attendanceTerms(isAsync)");
    expect(source).toContain("attendanceCaption(progress.attendance, isAsync, ATTENDANCE_GOAL)");
    expect(source).toContain("progressAttendanceGuidance(progress, now)");
    expect(source).toContain("base && !isAsync");
    expect(source).toContain("<RotationStatus");
    expect(source).toContain("<RotationWorkflow");
    expect(source).toContain("rotationRequirement(progress.sundaySchool");
    expect(source).not.toContain("attendanceGuidance(progress.attendance)");
  });

  it("the roll call filters async students, re-checks them before saving, and reconciles the draft", () => {
    const source = read("apps/mobile/src/app/prep-attendance.tsx");
    expect(source).toContain("splitRollCall(enrollments.data ?? [])");
    expect(source).toContain("dropAsyncMarks(");
    expect(source).toContain("rollCallChangeNotice(");
    const save = source.slice(source.indexOf("function save()"), source.indexOf("function resetAttendance"));
    expect(save.indexOf('"/api/enrollments?isActive=true"')).toBeGreaterThan(-1);
    expect(save.indexOf('"/api/enrollments?isActive=true"')).toBeLessThan(save.indexOf('"/api/attendance/batch"'));
    expect(source).toContain("AppState.addEventListener");
  });

  it("the staff and mentor screens label attendance by what it measures", () => {
    expect(read("apps/mobile/src/app/prep-student/[id].tsx")).toContain("terms.title");
    expect(read("apps/mobile/src/app/prep-mentee/[id].tsx")).toContain("terms.requirement");
    expect(read("apps/mobile/src/app/prep-mentees.tsx")).toContain("menteeAttendanceLabel(r)");
    expect(read("apps/mobile/src/app/(prep)/students/index.tsx")).toContain("studentRowSubtitle(");
    expect(read("apps/mobile/src/app/(prep)/search/index.tsx")).toContain("attendanceShort(");
    expect(read("apps/mobile/src/app/(prep)/home/index.tsx")).toContain("atRiskAttendanceLabel(");
  });

  it("the new analytics shapes are shared type-only contracts", () => {
    const contract = read("packages/contracts/src/prep-analytics.ts");
    expect(contract).not.toMatch(/^import(?! type)/m);
    expect(read("packages/contracts/src/index.ts")).toContain('export type * from "./prep-analytics"');
  });

  it("never computes an attendance percentage on the device", () => {
    const source = read("apps/mobile/src/data/rotation-attendance.ts");
    expect(source).not.toMatch(/\*\s*100\b/);
    expect(source).not.toMatch(/percentage\s*[:=][^;\n]*\//);
  });
});
