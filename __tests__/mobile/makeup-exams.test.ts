import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EligibleMakeupExam, MakeupExamBooking } from "@stmark/contracts";
import { makeupToday, upcomingMakeupFridays } from "../../lib/makeup-exams";
import { churchToday } from "../../apps/mobile/src/data/liturgical";
import {
  bookingFailure,
  bookingForExam,
  canCancel,
  canViewMakeupBookings,
  checkBooking,
  dayLabel,
  examDetail,
  groupEligible,
  isMakeupStudent,
  reconcileSelection,
  resultLabel,
  splitBookings,
  staffBookings,
} from "../../apps/mobile/src/data/makeup-exams";
import { authenticatedRoutes } from "../../apps/mobile/src/data/route-access";
import { WEB_TO_NATIVE } from "../../apps/mobile/src/data/notification-routes";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const exam = (id: string, over: Partial<EligibleMakeupExam> = {}): EligibleMakeupExam => ({
  id,
  examDate: "2026-10-04T00:00:00.000Z",
  yearLevel: "YEAR_1",
  examSection: { displayName: `Section ${id}`, passingScore: 80 },
  academicYear: { name: "2026-2027" },
  reason: "FAILED",
  currentPercentage: 72.5,
  ...over,
});
const booking = (id: string, day: string, over: Partial<MakeupExamBooking> = {}): MakeupExamBooking => ({
  id,
  scheduledDate: `${day}T00:00:00.000Z`,
  exam: exam("e1"),
  ...over,
});

describe("who sees what", () => {
  it("students book; administrators, priests and Servants Prep servants see the list; nobody else does", () => {
    expect(isMakeupStudent("STUDENT")).toBe(true);
    for (const role of ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP", "MENTOR", "SERVANT", "PARENT", undefined, null]) expect(isMakeupStudent(role)).toBe(false);
    for (const role of ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"]) expect(canViewMakeupBookings(role)).toBe(true);
    // A mentor and a Sunday School-only servant hold none of the tags the API requires.
    for (const role of ["MENTOR", "SERVANT", "STUDENT", "PARENT", undefined, null]) expect(canViewMakeupBookings(role)).toBe(false);
  });
});

describe("failed, missed and passing exams", () => {
  it("lists failed exams first, then missed ones, in the API's order", () => {
    const groups = groupEligible([exam("m1", { reason: "MISSED", currentPercentage: null }), exam("f1"), exam("f2"), exam("m2", { reason: "MISSED", currentPercentage: null })]);
    expect(groups.map((g) => [g.title, g.exams.map((e) => e.id)])).toEqual([
      ["Failed exams", ["f1", "f2"]],
      ["Missed exams", ["m1", "m2"]],
    ]);
    expect(groupEligible([])).toEqual([]);
    expect(groupEligible([exam("m1", { reason: "MISSED", currentPercentage: null })]).map((g) => g.title)).toEqual(["Missed exams"]);
  });

  it("shows the current and passing percentages for a failed exam, and 'Not taken' for a missed one", () => {
    expect(resultLabel(exam("f"))).toBe("72.5% · passing 80%");
    expect(resultLabel(exam("f", { currentPercentage: 79.999, examSection: { displayName: "S", passingScore: 60 } }))).toBe("80% · passing 60%");
    expect(resultLabel(exam("m", { reason: "MISSED", currentPercentage: null }))).toBe("Not taken");
  });

  it("describes where an exam sits without inventing a time or place", () => {
    expect(examDetail(exam("a"))).toBe("Year 1 · 2026-2027 · Exam Sun, Oct 4, 2026");
    expect(examDetail(exam("a", { yearLevel: "BOTH" }))).toMatch(/^Both years · /);
    expect(examDetail(exam("a", { yearLevel: "YEAR_2" }))).toMatch(/^Year 2 · /);
  });
});

describe("the Fridays on offer and the New York day", () => {
  it("reads a day in UTC so the phone's own time zone never moves it", () => {
    expect(dayLabel("2026-11-06T00:00:00.000Z")).toBe("Fri, Nov 6, 2026");
    expect(dayLabel("2026-11-06", "long")).toBe("Friday, Nov 6, 2026");
  });

  it("agrees with the server on 'today' across the New York midnight, so a boundary cannot disagree about a cancel", () => {
    // 04:59Z is 23:59 in New York (EST) on the 6th; 05:00Z is already the 7th.
    for (const iso of ["2026-11-07T04:59:59Z", "2026-11-07T05:00:00Z", "2026-11-07T03:30:00Z", "2026-03-08T04:59:00Z", "2026-03-08T05:00:00Z"]) {
      expect(churchToday(new Date(iso))).toBe(makeupToday(new Date(iso)));
    }
    expect(churchToday(new Date("2026-11-07T04:59:59Z"))).toBe("2026-11-06");
    expect(churchToday(new Date("2026-11-07T05:00:00Z"))).toBe("2026-11-07");
  });

  it("the next-12-Fridays window moves at New York midnight, and a Friday booked for 'today' is no longer cancellable", () => {
    const before = upcomingMakeupFridays(new Date("2026-11-07T04:59:59Z")); // still Friday Nov 6 in New York
    const after = upcomingMakeupFridays(new Date("2026-11-07T05:00:00Z")); // Saturday Nov 7
    expect(before[0]).toBe("2026-11-13"); // starts the day after today, so today's Friday is never offered
    expect(after[0]).toBe("2026-11-13");
    expect(before).toHaveLength(12);
    const friday = booking("b", "2026-11-13");
    expect(canCancel(friday, "2026-11-12")).toBe(true);
    expect(canCancel(friday, "2026-11-13")).toBe(false); // the day itself: too late, as on the server
    expect(canCancel(friday, "2026-11-14")).toBe(false);
  });
});

describe("bookings and history", () => {
  const today = "2026-11-06";
  it("keeps past bookings as history and splits upcoming from past, each ordered by Friday", () => {
    const split = splitBookings([booking("c", "2026-11-20"), booking("a", "2026-10-30"), booking("b", "2026-11-13"), booking("d", "2026-11-06")], today);
    expect(split.upcoming.map((b) => b.id)).toEqual(["b", "c"]);
    expect(split.past.map((b) => b.id)).toEqual(["a", "d"]);
  });

  it("finds the booking an exam already has, so a second save is a reschedule", () => {
    const bookings = [booking("b1", "2026-11-13", { exam: exam("e1") }), booking("b2", "2026-11-20", { exam: exam("e2") })];
    expect(bookingForExam("e2", bookings)?.id).toBe("b2");
    expect(bookingForExam("e3", bookings)).toBeUndefined();
  });

  it("orders the staff list by Friday, then by student, with past bookings after upcoming ones", () => {
    const row = (id: string, day: string, name: string) => booking(id, day, { student: { name, email: `${id}@x.test` } });
    const list = staffBookings([row("1", "2026-11-20", "Zed"), row("2", "2026-11-13", "Bea"), row("3", "2026-11-13", "Abe"), row("4", "2026-10-30", "Cy")], today);
    expect(list.upcoming.map((b) => b.id)).toEqual(["3", "2", "1"]);
    expect(list.past.map((b) => b.id)).toEqual(["4"]);
  });
});

describe("saving, and eligibility changing before save", () => {
  const data = { exams: [exam("e1"), exam("e2", { reason: "MISSED", currentPercentage: null })], fridays: ["2026-11-13", "2026-11-20"] };

  it("needs an exam and one of the offered Fridays", () => {
    expect(checkBooking({ examId: "", friday: "2026-11-13" }, data)).toEqual({ ok: false, error: "Choose an exam." });
    expect(checkBooking({ examId: "e1", friday: "" }, data)).toEqual({ ok: false, error: "Choose a Friday." });
    expect(checkBooking({ examId: "e1", friday: "2026-11-27" }, data)).toMatchObject({ ok: false });
    expect(checkBooking({ examId: "gone", friday: "2026-11-13" }, data)).toMatchObject({ ok: false });
    expect(checkBooking({ examId: "e2", friday: "2026-11-20" }, data)).toEqual({ ok: true, body: { examId: "e2", scheduledDate: "2026-11-20" } });
  });

  it("drops an exam that became passing and a Friday that left the window, and keeps the rest", () => {
    expect(reconcileSelection({ examId: "e1", friday: "2026-11-13" }, data)).toEqual({ examId: "e1", friday: "2026-11-13" });
    expect(reconcileSelection({ examId: "passed", friday: "2026-11-13" }, data)).toEqual({ examId: "", friday: "2026-11-13" });
    expect(reconcileSelection({ examId: "e1", friday: "2026-11-06" }, data)).toEqual({ examId: "e1", friday: "" });
  });

  const failed = (status: number | null, message: string) => (status === null ? new Error(message) : Object.assign(new Error(message), { status }));
  it("explains each refusal and reloads the list when it has gone stale", () => {
    expect(bookingFailure(failed(400, "This exam is not eligible for a makeup."))).toMatchObject({ kind: "ineligible", reload: true });
    expect(bookingFailure(failed(400, "Choose an exam and one of the available Fridays."))).toMatchObject({ kind: "friday", reload: true });
    expect(bookingFailure(failed(409, "This exam is already booked. Refresh and try again."))).toMatchObject({ kind: "already", reload: true });
    expect(bookingFailure(failed(403, "Forbidden"))).toMatchObject({ kind: "forbidden", reload: true });
    expect(bookingFailure(failed(404, "Not found"))).toMatchObject({ kind: "missing", reload: true });
    expect(bookingFailure(failed(null, "Could not reach the server."))).toMatchObject({ kind: "offline", reload: false });
    expect(bookingFailure(failed(403, "View as is read-only. Stop viewing as this user before making changes.")).kind).toBe("other");
  });
});

describe("wiring", () => {
  const screen = code("app/prep-makeup-exams.tsx");

  it("is a signed-in route reached from the student's home and More, and by the student notification link", () => {
    expect(authenticatedRoutes).toContain("prep-makeup-exams");
    expect(src("app/(prep)/home/index.tsx")).toContain('"/prep-makeup-exams"');
    expect(src("app/(prep)/ministry/index.tsx")).toContain('href: "/prep-makeup-exams"');
    expect(WEB_TO_NATIVE["student/makeup-exams"]).toBeTypeOf("function");
    expect(code("data/notification-routes.ts")).toContain('"student/makeup-exams": fixed("/prep-makeup-exams")');
  });

  it("only the Schedule and Cancel actions write, and a View As preview cannot", () => {
    expect(screen.match(/"POST"/g)).toHaveLength(1);
    expect(screen.match(/"DELETE"/g)).toHaveLength(1);
    expect(screen.indexOf('"POST"')).toBeGreaterThan(screen.indexOf("async function save()"));
    expect(screen.indexOf('"DELETE"')).toBeGreaterThan(screen.indexOf("async function cancel("));
    expect(screen).toContain("const readOnly = !!viewingAs;");
    expect(screen).toContain("useResource<MakeupExamsResponse>(student ? MAKEUP_EXAMS_PATH : null, scope)");
  });

  it("shows the staff list on the Exams screen only to the accounts allowed to read it", () => {
    expect(src("app/prep-exams.tsx")).toContain("<MakeupBookingsStaff />");
    const staff = code("components/makeup-bookings-staff.tsx");
    expect(staff).toContain("canViewMakeupBookings(user?.role)");
    expect(staff).toContain("allowed ? MAKEUP_EXAMS_PATH : null");
  });

  it("never invents a time, location, capacity or approval step", () => {
    for (const file of ["app/prep-makeup-exams.tsx", "components/makeup-bookings-staff.tsx", "data/makeup-exams.ts"])
      expect(code(file)).not.toMatch(/\b(capacity|seats?|spots? left|approv(al|ed)|pending approval|room \d|[0-9]{1,2}:[0-9]{2}\s?(am|pm))\b/i);
  });
});
