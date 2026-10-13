import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  buildCalendarEvents,
  dayDots,
  formatWeekRange,
  isDateKey,
  liturgicalDatesParam,
  monthGrid,
  sameMonth,
  weekOf,
  weekday,
} from "../../apps/mobile/src/data/calendar";

describe("calendar date math (UTC days)", () => {
  it("lays a month out as whole Sunday-first weeks (happy path)", () => {
    const grid = monthGrid("2026-10-12");
    expect(grid[0]).toBe("2026-09-27"); // Oct 1, 2026 is a Thursday
    expect(grid[grid.length - 1]).toBe("2026-10-31"); // Oct 31 is a Saturday
    expect(grid).toHaveLength(35);
    expect(weekday(grid[0])).toBe(0);
  });

  it("uses only as many weeks as the month needs", () => {
    expect(monthGrid("2026-02-10")).toHaveLength(28); // Feb 2026 starts on a Sunday
    expect(monthGrid("2026-08-10")).toHaveLength(42); // Aug 2026 spans six weeks
  });

  it("moves across month and year boundaries and clamps to the first (highest-risk path)", () => {
    expect(addMonths("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
  });

  it("is not moved by a daylight-saving change", () => {
    // US clocks changed on 2026-11-01; the next day is still the 2nd.
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("finds the week and compares months", () => {
    expect(weekOf("2026-10-14")).toEqual([
      "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17",
    ]);
    expect(sameMonth("2026-10-01", "2026-10-31")).toBe(true);
    expect(sameMonth("2026-10-31", "2026-11-01")).toBe(false);
    expect(formatWeekRange(weekOf("2026-10-14"))).toBe("Oct 11 – 17");
    expect(formatWeekRange(weekOf("2026-10-28"))).toBe("Oct 25 – 31");
    expect(formatWeekRange(weekOf("2026-10-01"))).toBe("Sep 27 – Oct 3"); // crosses a month
    expect(formatWeekRange(weekOf("2026-11-02"))).toBe("Nov 1 – 7");
  });

  it("validates day keys", () => {
    expect(isDateKey("2026-10-12")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("10/12/2026")).toBe(false);
  });

  it("asks the church calendar about at most 60 days", () => {
    const days = Array.from({ length: 70 }, (_, i) => addDays("2026-10-01", i));
    expect(liturgicalDatesParam(days).split(",")).toHaveLength(60);
  });
});

describe("calendar events", () => {
  const lesson = {
    id: "l1",
    classId: "c1",
    sundayDate: "2026-10-18T00:00:00.000Z",
    title: null,
    class: { name: "Grade 2 Girls" },
  };

  it("collects lessons, attendance and feasts on their days (happy path)", () => {
    const events = buildCalendarEvents({
      lessons: [lesson],
      attendanceDue: [{ classId: "c1", className: "Grade 2 Girls", date: "2026-10-11" }],
      attendanceTaken: [{ classId: "c2", className: "Grade 3 Boys", date: "2026-10-04" }],
      liturgical: {
        "2026-10-18": { fast: null, feasts: [{ name: "Sunday of the Cross", category: "minorFeast" }] },
        "2026-10-14": { fast: { name: "Wednesday Fast" }, feasts: [] },
      },
    });
    expect(events["2026-10-18"].map((e) => e.kind)).toEqual(["lesson", "feast"]);
    expect(events["2026-10-18"][0]).toMatchObject({ title: "Weekly lesson", subtitle: "Grade 2 Girls" });
    expect(events["2026-10-11"][0].route).toEqual({ pathname: "/attendance/[classId]", params: { classId: "c1" } });
    expect(events["2026-10-04"][0].kind).toBe("attendance-taken");
    expect(events["2026-10-14"][0]).toMatchObject({ kind: "fast", title: "Wednesday Fast" });
  });

  it("puts what needs action first within a day", () => {
    const events = buildCalendarEvents({
      lessons: [{ ...lesson, sundayDate: "2026-10-11" }],
      attendanceDue: [{ classId: "c1", className: "Grade 2 Girls", date: "2026-10-11" }],
      attendanceTaken: [{ classId: "c9", className: "Other", date: "2026-10-11" }],
      liturgical: { "2026-10-11": { fast: null, feasts: [{ name: "A feast", category: "minorFeast" }] } },
    });
    expect(events["2026-10-11"].map((e) => e.kind)).toEqual([
      "attendance-due", "lesson", "attendance-taken", "feast",
    ]);
  });

  it("shows at most three marks per day, and only for feasts worth one (highest-risk path)", () => {
    const all = buildCalendarEvents({
      lessons: [{ ...lesson, sundayDate: "2026-10-11" }],
      attendanceDue: [{ classId: "c1", className: "x", date: "2026-10-11" }],
      attendanceTaken: [{ classId: "c2", className: "y", date: "2026-10-11" }],
      liturgical: { "2026-10-11": { fast: null, feasts: [{ name: "Big", category: "majorFeast" }] } },
    });
    const liturgical = { fast: null, feasts: [{ name: "Big", category: "majorFeast" }] };
    expect(dayDots(all["2026-10-11"], liturgical)).toEqual(["attendance-due", "lesson", "attendance-taken"]);
    // A saint's commemoration and an ordinary fast never add a mark.
    expect(
      dayDots(undefined, { fast: { name: "Wednesday Fast" }, feasts: [{ name: "St X", category: "commemoration" }] }),
    ).toEqual([]);
    expect(dayDots(undefined, undefined)).toEqual([]);
  });
});
