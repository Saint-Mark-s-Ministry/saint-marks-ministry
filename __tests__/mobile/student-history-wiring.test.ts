import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authenticatedRoutes } from "../../apps/mobile/src/data/route-access";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");

// Student history opens from a saved child's name on many screens; these keep
// the wiring from quietly falling out, and keep the sheet read-only and free of
// contacts and confidential notes.
describe("student history on iOS: where a saved child's name opens it", () => {
  it.each([
    ["roster", "app/roster.tsx", "<StudentHistoryButton"],
    ["visitations list", "app/visitations.tsx", "<StudentHistoryButton"],
    ["search results", "app/(tabs)/search/index.tsx", "<StudentHistoryButton"],
    ["a visitation record", "app/visitation/[childId].tsx", "<StudentHistoryLink"],
    ["homework", "app/homework.tsx", "<StudentNameButton"],
    ["birthdays", "app/sunday-birthdays.tsx", "<StudentNameButton"],
    ["Home birthdays", "app/(tabs)/home/index.tsx", "<StudentNameButton"],
    ["take attendance", "app/attendance/[classId].tsx", "openHistory(historyTarget(childId, name))"],
  ])("%s", (_name, file, marker) => {
    const source = src(file);
    expect(source).toContain('from "@/components/student-history-parts"');
    expect(source).toContain(marker);
  });

  it("identifies the child by ID wherever the control is placed, never by the displayed name", () => {
    for (const file of ["app/roster.tsx", "app/visitations.tsx", "app/homework.tsx", "app/sunday-birthdays.tsx"]) {
      expect(src(file)).toMatch(/childId=\{(child|row\.child|birthday)\.id\}/);
    }
    expect(src("components/student-history-parts.tsx")).toContain("historyTarget(childId, name)");
  });

  it("keeps the name control apart from the row-selection controls", () => {
    // Roster and visitations rows open a profile or record; history is a sibling control, not nested in that Pressable.
    for (const file of ["app/roster.tsx", "app/visitations.tsx"]) {
      const source = src(file);
      const closeRow = source.indexOf("</Pressable>", source.indexOf("accessibilityRole=\"button\""));
      expect(source.indexOf("<StudentHistoryButton")).toBeGreaterThan(closeRow);
    }
    // Take attendance: the name and the note line are their own controls, not the Present/Late/Absent radios.
    const attendance = src("app/attendance/[classId].tsx");
    expect(attendance).toContain("view attendance, notes and visitations");
    expect(attendance).toContain("Add note for");
  });

  it("is a native formSheet over the screen, which stays mounted underneath", () => {
    const layout = src("app/_layout.tsx");
    expect(layout).toContain('name="student-history/[id]"');
    const block = layout.slice(layout.indexOf('name="student-history/[id]"'));
    expect(block.slice(0, 700)).toContain('"formSheet"');
    expect(authenticatedRoutes).toContain("student-history/[id]");
    expect(src("components/student-history-parts.tsx")).toContain("router.push(studentHistoryRoute(target))");
    // A sheet is pushed, never a replace of the screen that holds filters and drafts.
    expect(src("components/student-history-parts.tsx")).not.toContain("router.replace");
  });

  it("only offers the control to an account with Sunday School access, and ignores a double tap", () => {
    const parts = src("components/student-history-parts.tsx");
    expect(parts).toContain("user?.sundaySchool?.hasAccess");
    expect(parts).toContain("if (now - lastOpened.current < 800) return;");
  });
});

describe("student history on iOS: what the sheet shows", () => {
  const sheet = src("app/student-history/[id].tsx");
  // Code only: the doc comment above the component says what is left out.
  const code = sheet.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("is read-only: Attendance, Notes and Visitations, and no writes", () => {
    expect(sheet).not.toMatch(/request\(|method:|"POST"|"PATCH"|"DELETE"/);
    expect(sheet).toContain("HISTORY_TABS");
  });

  it("leaves guardian and family contacts, and confidential notes, out", () => {
    expect(code).not.toMatch(/\.profile\b|guardian|motherPhone|fatherPhone|homeAddress|tel:|sms:/i);
    expect(sheet).toContain("CONFIDENTIAL_NOTES_NOTE");
    expect(sheet).not.toContain("canReadPrivateNotes");
    expect(sheet).not.toContain("priest-notes");
  });

  it("explains the Sunday School boundary", () => {
    expect(sheet).toContain("PROGRAM_BOUNDARY_NOTE");
  });

  it("reads through the viewer-scoped history hook, not a shared cache key", () => {
    expect(sheet).toContain("useStudentHistory(target)");
    expect(src("data/use-student-history.ts")).toContain("studentHistoryScope(");
    expect(src("data/use-student-history.ts")).toContain("useResource<StudentHistory>(path, scope)");
  });
});
