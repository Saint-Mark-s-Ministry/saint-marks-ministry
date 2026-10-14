import { describe, expect, it } from "vitest";
import {
  attendanceLabel,
  canViewOwnLessons,
  formatLessonWhen,
  isNewMaterial,
  lessonsForTab,
  resourceKind,
  safeHttpUrl,
  savedLabel,
  searchLessons,
  summary,
  type StudentLesson,
} from "../../apps/mobile/src/data/prep-lessons";

// Local-time construction so the tests don't depend on the machine's time zone.
const at = (month: number, day: number, hour = 19, minute = 30) => new Date(2026, month, day, hour, minute).toISOString();
const now = new Date(2026, 9, 6, 12, 0); // Oct 6, 2026, noon

const lesson = (over: Partial<StudentLesson> & { id: string }): StudentLesson => ({
  title: `Topic ${over.id}`,
  speaker: "Fr. Mark",
  lessonNumber: 1,
  scheduledDate: at(8, 25),
  status: "SCHEDULED",
  resources: [],
  attendance: null,
  ...over,
});

const past = lesson({ id: "L1", lessonNumber: 1, scheduledDate: at(8, 25), status: "COMPLETED", attendance: { status: "PRESENT" } });
const pastNoRecord = lesson({ id: "L2", lessonNumber: 2, scheduledDate: at(9, 2), status: "SCHEDULED" });
const cancelled = lesson({ id: "L3", lessonNumber: 3, scheduledDate: at(9, 9), status: "CANCELLED", cancellationReason: "Retreat weekend" });
const soon = lesson({ id: "L4", lessonNumber: 4, scheduledDate: at(9, 16), status: "SCHEDULED" });
const later = lesson({ id: "L5", lessonNumber: 5, scheduledDate: at(9, 23), status: "SCHEDULED", speaker: "Dn. Peter" });
const noClass = lesson({ id: "L6", lessonNumber: 6, scheduledDate: at(9, 30), status: "NO_CLASS" });
const all = [later, noClass, past, cancelled, soon, pastNoRecord];

describe("tabs", () => {
  it("puts unheld lessons under Upcoming, soonest first, including a future cancellation so it's visible", () => {
    expect(lessonsForTab(all, "upcoming", now).map((l) => l.id)).toEqual(["L3", "L4", "L5"]);
  });

  it("puts lessons already held or marked completed under Completed, most recent first", () => {
    expect(lessonsForTab(all, "completed", now).map((l) => l.id)).toEqual(["L2", "L1"]);
  });

  it("never lists no-class days", () => {
    expect(lessonsForTab(all, "all", now).some((l) => l.status === "NO_CLASS")).toBe(false);
  });
});

describe("attendance wording", () => {
  it("names the state in words", () => {
    expect(attendanceLabel(cancelled, now)).toBe("Cancelled");
    expect(attendanceLabel(past, now)).toBe("Present");
    expect(attendanceLabel(pastNoRecord, now)).toBe("Not recorded");
    expect(attendanceLabel(soon, now)).toBe("Upcoming");
  });

  it("counts attended over lessons with a record, leaving out excused", () => {
    const excused = lesson({ id: "X", scheduledDate: at(7, 1), status: "COMPLETED", attendance: { status: "EXCUSED" } });
    const late = lesson({ id: "Y", scheduledDate: at(7, 8), status: "COMPLETED", attendance: { status: "LATE" } });
    expect(summary([past, late, excused, cancelled])).toEqual({ total: 3, completed: 3, attended: 2, counted: 2 });
  });
});

describe("search", () => {
  it("matches title, speaker, and lesson number", () => {
    expect(searchLessons(all, "dn. peter").map((l) => l.id)).toEqual(["L5"]);
    expect(searchLessons(all, "lesson 4").map((l) => l.id)).toEqual(["L4"]);
    expect(searchLessons(all, "   ")).toHaveLength(all.length);
  });
});

describe("materials and links", () => {
  it("marks materials added within the last week as new", () => {
    expect(isNewMaterial({ createdAt: new Date(2026, 9, 4).toISOString() }, now)).toBe(true);
    expect(isNewMaterial({ createdAt: new Date(2026, 8, 20).toISOString() }, now)).toBe(false);
  });

  it("labels the kind of material from its link or type", () => {
    expect(resourceKind({ url: "https://files.example/notes.pdf", type: null })).toBe("PDF");
    expect(resourceKind({ url: "https://files.example/handout.docx", type: null })).toBe("Document");
    expect(resourceKind({ url: "https://files.example/deck.pptx", type: null })).toBe("Slides");
    expect(resourceKind({ url: "https://video.example/watch?v=1", type: null })).toBe("Link");
  });

  it("opens only http and https links", () => {
    expect(safeHttpUrl("https://files.example/notes.pdf")).toBe("https://files.example/notes.pdf");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });
});

describe("time and freshness", () => {
  it("formats the lesson time in the reader's locale", () => {
    expect(formatLessonWhen(at(9, 2, 19, 30), "en-US")).toMatch(/Fri, Oct 2, 7:30\D*PM/);
  });

  it("says how old cached data is", () => {
    expect(savedLabel(now.getTime() - 5 * 60_000, now, "en-US")).toBe("Saved 5 minutes ago");
    expect(savedLabel(now.getTime() - 10_000, now, "en-US")).toBe("Saved just now");
  });
});

describe("permission", () => {
  it("only a STUDENT lists lessons from this screen", () => {
    expect(canViewOwnLessons("STUDENT")).toBe(true);
    for (const role of ["MENTOR", "SERVANT_PREP", "PRIEST", "SUPER_ADMIN", null, undefined]) {
      expect(canViewOwnLessons(role)).toBe(false);
    }
  });
});
