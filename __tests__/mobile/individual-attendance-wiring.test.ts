import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authenticatedRoutes } from "../../apps/mobile/src/data/route-access";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Attendance → Individual history on iOS", () => {
  it("opens from Take attendance and from the class screen", () => {
    expect(src("app/attendance/[classId].tsx")).toContain("individualAttendanceRoute(classId)");
    expect(src("app/class/[id].tsx")).toContain("individualAttendanceRoute(id)");
  });

  it("registers both screens behind sign-in", () => {
    expect(authenticatedRoutes).toContain("attendance-history/[classId]");
    expect(authenticatedRoutes).toContain("attendance-child/[childId]");
    expect(src("app/_layout.tsx")).toContain('name="attendance-history/[classId]"');
    expect(src("app/_layout.tsx")).toContain('name="attendance-child/[childId]"');
  });

  it("is read-only and never touches the pending attendance marks", () => {
    for (const file of ["app/attendance-history/[classId].tsx", "app/attendance-child/[childId].tsx", "data/use-individual-attendance.ts"]) {
      const source = code(file);
      expect(source).not.toMatch(/setDraft|saveAttendance|drafts|loadAttendance|SecureStore|request\(/);
      expect(source).not.toMatch(/"(POST|PUT|PATCH|DELETE)"/);
    }
  });

  it("uses the server's counts and rate, never its own", () => {
    for (const file of ["app/attendance-history/[classId].tsx", "app/attendance-child/[childId].tsx", "data/individual-attendance.ts"]) {
      expect(code(file)).not.toMatch(/calculateAttendance|\* 100|\/ total/);
    }
  });

  it("shows no contacts, attendance notes or pastoral notes", () => {
    for (const file of ["app/attendance-history/[classId].tsx", "app/attendance-child/[childId].tsx"]) {
      expect(code(file)).not.toMatch(/phone|email|guardian|\.notes|pastoral|\bfamily/i);
    }
  });

  it("omits the redundant Excused total column on the class list but keeps excused marks", () => {
    const list = code("app/attendance-history/[classId].tsx");
    expect(list).not.toContain("counts.excused");
    expect(code("data/individual-attendance.ts")).toContain("EXCUSED");
  });

  it("the class picker changes only this screen's class", () => {
    const list = code("app/attendance-history/[classId].tsx");
    expect(list).toContain("setClassId(id)");
    expect(list).not.toContain("router.setParams");
  });
});
