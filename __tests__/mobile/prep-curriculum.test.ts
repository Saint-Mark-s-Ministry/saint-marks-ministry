import { describe, expect, it } from "vitest";
import {
  canManageCurriculum,
  filterLessonsBySection,
  formIsDirty,
  isSafeResourceUrl,
  lessonBadge,
  nextLessonId,
  searchLessons,
  sectionsInUse,
  speakerSuggestions,
  validateLessonForm,
  type LessonFormValues,
  type LessonListItem,
} from "../../apps/mobile/src/data/prep-curriculum";

const lesson = (overrides: Partial<LessonListItem>): LessonListItem => ({
  id: "l1",
  title: "Topic",
  scheduledDate: "2026-10-02",
  status: "SCHEDULED",
  lessonNumber: 1,
  speaker: null,
  examSection: { id: "s1", displayName: "Bible Studies" },
  ...overrides,
});

const baseForm: LessonFormValues = {
  title: "Topic",
  subtitle: "",
  examSectionId: "s1",
  scheduledDate: new Date(2026, 9, 2),
  speaker: "",
  isExamDay: false,
  description: "",
};

describe("Curriculum + lesson editor (SMM-38)", () => {
  describe("happy path", () => {
    it("picks the next upcoming, non-exam-day scheduled lesson", () => {
      const lessons = [
        lesson({ id: "a", status: "COMPLETED", scheduledDate: "2026-09-25" }),
        lesson({ id: "b", status: "SCHEDULED", scheduledDate: "2026-10-02" }),
        lesson({ id: "c", status: "SCHEDULED", scheduledDate: "2026-10-09", isExamDay: true }),
      ];
      expect(nextLessonId(lessons, "2026-10-01")).toBe("b");
    });

    it("labels lesson badges: Exam takes priority, then Done, then Next, then Cancelled/No class", () => {
      expect(lessonBadge(lesson({ isExamDay: true }), null)).toBe("Exam");
      expect(lessonBadge(lesson({ status: "COMPLETED" }), null)).toBe("Done");
      expect(lessonBadge(lesson({ id: "x" }), "x")).toBe("Next");
      expect(lessonBadge(lesson({ status: "CANCELLED" }), null)).toBe("Cancelled");
      expect(lessonBadge(lesson({ status: "NO_CLASS" }), null)).toBe("No class");
      expect(lessonBadge(lesson({ status: "SCHEDULED" }), "other-id")).toBeNull();
    });

    it("derives the section filter from sections actually in use, not a fixed list", () => {
      const lessons = [
        lesson({ examSection: { id: "s1", displayName: "Bible Studies" } }),
        lesson({ examSection: { id: "s2", displayName: "Dogma" } }),
        lesson({ examSection: { id: "s1", displayName: "Bible Studies" } }),
      ];
      expect(sectionsInUse(lessons)).toEqual([
        { id: "s1", displayName: "Bible Studies" },
        { id: "s2", displayName: "Dogma" },
      ]);
    });

    it("filters by section and searches by title or speaker", () => {
      const lessons = [
        lesson({ id: "a", title: "Prayer", speaker: "Fr. Mark", examSection: { id: "s1", displayName: "Bible Studies" } }),
        lesson({ id: "b", title: "Fasting", speaker: "Fr. John", examSection: { id: "s2", displayName: "Dogma" } }),
      ];
      expect(filterLessonsBySection(lessons, "s2").map((l) => l.id)).toEqual(["b"]);
      expect(filterLessonsBySection(lessons, null)).toHaveLength(2);
      expect(searchLessons(lessons, "prayer").map((l) => l.id)).toEqual(["a"]);
      expect(searchLessons(lessons, "fr. john").map((l) => l.id)).toEqual(["b"]);
    });

    it("suggests distinct real speakers, most recent first", () => {
      const lessons = [
        lesson({ speaker: "Fr. Mark", scheduledDate: "2026-09-01" }),
        lesson({ speaker: "Fr. John", scheduledDate: "2026-10-01" }),
        lesson({ speaker: "Fr. Mark", scheduledDate: "2026-11-01" }),
        lesson({ speaker: null, scheduledDate: "2026-12-01" }),
      ];
      expect(speakerSuggestions(lessons)).toEqual(["Fr. Mark", "Fr. John"]);
    });

    it("validates the lesson form exactly like the server's required fields", () => {
      expect(validateLessonForm({ title: "", examSectionId: "s1" })).toMatch(/topic/i);
      expect(validateLessonForm({ title: "Topic", examSectionId: "" })).toMatch(/section/i);
      expect(validateLessonForm({ title: "Topic", examSectionId: "s1" })).toBeNull();
    });

    it("detects a dirty form against its initial snapshot", () => {
      expect(formIsDirty(baseForm, { ...baseForm })).toBe(false);
      expect(formIsDirty(baseForm, { ...baseForm, title: "Changed" })).toBe(true);
      expect(formIsDirty(baseForm, { ...baseForm, scheduledDate: new Date(2026, 9, 3) })).toBe(true);
    });

    it("accepts only http(s) resource URLs", () => {
      expect(isSafeResourceUrl("https://example.com/slides.pdf")).toBe(true);
      expect(isSafeResourceUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeResourceUrl("ftp://example.com")).toBe(false);
    });
  });

  describe("highest-risk path: only admins can manage curriculum, PRIEST is read-only", () => {
    it.each(["SUPER_ADMIN", "SERVANT_PREP"])("lets %s create/edit/delete lessons", (role) => {
      expect(canManageCurriculum(role)).toBe(true);
    });
    it.each(["PRIEST", "MENTOR", "STUDENT", "SERVANT", "PARENT"])("denies %s write access", (role) => {
      expect(canManageCurriculum(role)).toBe(false);
    });
    it("denies write access with no role at all", () => {
      expect(canManageCurriculum(undefined)).toBe(false);
    });
  });
});
