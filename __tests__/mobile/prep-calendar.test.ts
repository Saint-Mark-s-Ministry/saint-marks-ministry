import { describe, expect, it } from "vitest";
import {
  PREP_ADMIN_ROLES,
  buildCalendarEvents,
  canManageCalendar,
  dotTypesForDay,
  eventsByDate,
  eventsForMonth,
  type CalendarEvent,
  formatEventTime,
  localDateKey,
  monthGrid,
  weekStrip,
  hasEventOfType,
  liturgicalEvents,
  withoutFasts,
} from "../../apps/mobile/src/data/prep-calendar";

describe("Prep Calendar (SMM-33)", () => {
  describe("happy path", () => {
    it("shows the whole displayed month, including past dates but excluding adjacent months and years", () => {
      const dates = ["2025-10-10", "2026-09-30", "2026-10-01", "2026-10-16", "2026-10-31", "2026-11-01"];
      const events: CalendarEvent[] = dates.map((date) => ({ id: date, date, type: "lesson", time: null, title: "Lesson", subtitle: "" }));
      expect(eventsForMonth(events, new Date(2026, 9, 14)).map((event) => event.date)).toEqual(dates.slice(2, 5));
      expect(eventsForMonth(events, new Date(2026, 11, 1))).toEqual([]);
    });
    it("reads a local calendar date, not a UTC-shifted one", () => {
      // 11:30 PM local — toISOString().slice(0,10) would roll this to the next
      // UTC day in any timezone behind UTC. localDateKey must not.
      const late = new Date(2026, 9, 2, 23, 30);
      expect(localDateKey(late)).toBe("2026-10-02");
    });

    it("builds a 42-cell, Sunday-first grid covering the whole month", () => {
      const grid = monthGrid(new Date(2026, 9, 1)); // October 2026
      expect(grid).toHaveLength(42);
      expect(grid[0].getDay()).toBe(0);
      const octDays = grid.filter((d) => d.getMonth() === 9);
      expect(octDays).toHaveLength(31);
    });

    it("builds a 7-cell, Sunday-first week around any anchor day", () => {
      const week = weekStrip(new Date(2026, 9, 14)); // a Wednesday
      expect(week).toHaveLength(7);
      expect(week[0].getDay()).toBe(0);
      expect(week[6].getDay()).toBe(6);
    });

    it("turns lessons and exams into a unified, date-sorted event list", () => {
      const events = buildCalendarEvents(
        [
          { id: "l1", scheduledDate: "2026-10-09T23:30:00.000Z", status: "SCHEDULED", lessonNumber: 2, examSection: { displayName: "Year 2" } },
          { id: "l2", scheduledDate: "2026-10-02T23:30:00.000Z", status: "SCHEDULED", lessonNumber: 1, isExamDay: true },
        ],
        [{ id: "e1", examDate: "2026-10-09T18:00:00.000Z", totalPoints: 100, examSection: { displayName: "Year 1" } }],
      );
      expect(events.map((e) => e.date)).toEqual(["2026-10-02", "2026-10-09", "2026-10-09"]);
      expect(events[0].title).toBe("Exam day");
      expect(events[2].title).toBe("Exam");
    });

    it("excludes cancelled and no-class lessons from the calendar", () => {
      const events = buildCalendarEvents(
        [
          { id: "l1", scheduledDate: "2026-10-09T18:00:00.000Z", status: "CANCELLED", lessonNumber: 1 },
          { id: "l2", scheduledDate: "2026-10-16T18:00:00.000Z", status: "NO_CLASS", lessonNumber: 2 },
        ],
        [],
      );
      expect(events).toHaveLength(0);
    });

    it("groups events by date and caps grid dots at 2, lesson before exam", () => {
      const events = buildCalendarEvents(
        [{ id: "l1", scheduledDate: "2026-10-09T18:00:00.000Z", status: "SCHEDULED", lessonNumber: 1 }],
        [{ id: "e1", examDate: "2026-10-09T18:00:00.000Z", totalPoints: 100 }],
      );
      const byDate = eventsByDate(events);
      expect(dotTypesForDay(byDate.get("2026-10-09") ?? [])).toEqual(["lesson", "exam"]);
      expect(dotTypesForDay(byDate.get("2026-10-10") ?? [])).toEqual([]);
    });

    it("renders a time for a timed event and null for a midnight (all-day) stamp", () => {
      expect(formatEventTime("2026-10-09T23:30:00.000Z")).toMatch(/\d/);
      expect(formatEventTime("2026-10-09T00:00:00.000Z")).toBeNull();
    });
  });

  describe("highest-risk path: only admin-like roles manage the operational calendar", () => {
    it.each(PREP_ADMIN_ROLES)("lets %s manage it", (role) => {
      expect(canManageCalendar(role)).toBe(true);
    });

    it.each(["STUDENT", "MENTOR", "SERVANT", "PARENT"])(
      "hides Today/New-event and the lesson+exam data from %s",
      (role) => {
        expect(canManageCalendar(role)).toBe(false);
      },
    );

    it("hides it when there is no signed-in role at all", () => {
      expect(canManageCalendar(undefined)).toBe(false);
      expect(canManageCalendar(null)).toBe(false);
    });
  });

  describe("church calendar overlay (feasts and fasts)", () => {
    const days = {
      "2026-12-29": {
        date: "2026-12-29",
        copticDate: { day: 20, month: 4, year: 1743, monthName: "Koiahk", label: "20 Koiahk 1743 A.M." },
        fast: { name: "Nativity Fast", type: null },
        feasts: [
          { name: "Nativity Eve", category: "majorFeast" as const },
          { name: "St. Mark", category: "commemoration" as const },
        ],
      },
      "2026-12-30": { date: "2026-12-30", copticDate: null, fast: null, feasts: [] },
    };

    it("turns feasts and fasts into agenda rows, leaving out commemorations (happy path)", () => {
      const events = liturgicalEvents(days, ["2026-12-29", "2026-12-30"]);
      expect(events.map((e) => [e.type, e.title, e.date])).toEqual([
        ["feast", "Nativity Eve", "2026-12-29"],
        ["fast", "Nativity Fast", "2026-12-29"],
      ]);
      expect(events[0].subtitle).toBe("Major feast · 20 Koiahk 1743 A.M.");
      expect(events.every((e) => e.time === null)).toBe(true);
    });

    it("adds nothing for days the church calendar did not answer for", () => {
      expect(liturgicalEvents(days, ["2027-01-01"])).toEqual([]);
      expect(liturgicalEvents({}, ["2026-12-29"])).toEqual([]);
    });

    it("lists a day once even if it is asked for twice", () => {
      expect(liturgicalEvents(days, ["2026-12-29", "2026-12-29"])).toHaveLength(2);
    });

    it("keeps month and upcoming lists free of the many fast days (highest-risk path)", () => {
      const events = liturgicalEvents(days, ["2026-12-29"]);
      expect(withoutFasts(events).map((e) => e.type)).toEqual(["feast"]);
      expect(hasEventOfType(events, "fast")).toBe(true);
      expect(hasEventOfType(withoutFasts(events), "fast")).toBe(false);
    });

    it("does not change the lesson and exam dots", () => {
      const lesson = { id: "l1", scheduledDate: "2026-12-29T19:00:00.000Z", status: "SCHEDULED" as const, lessonNumber: 1 };
      const events = [...buildCalendarEvents([lesson], []), ...liturgicalEvents(days, ["2026-12-29"])];
      expect(dotTypesForDay(eventsByDate(events).get("2026-12-29") ?? [])).toEqual(["lesson"]);
    });
  });
});
