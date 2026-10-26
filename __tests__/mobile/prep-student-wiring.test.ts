import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("SP Student badge on iOS", () => {
  it.each([
    ["roster", "app/roster.tsx"],
    ["child profile", "app/child/[id].tsx"],
    ["student history", "app/student-history/[id].tsx"],
  ])("%s shows the shared badge from the server flag", (_name, file) => {
    expect(src(file)).toContain("<PrepStudentBadge");
    expect(src(file)).toContain("showsPrepStudentBadge(");
  });

  it("decides from the server flag alone: no grade, role, name or cross-program lookup", () => {
    for (const file of ["data/prep-student.ts", "components/prep-student-badge.tsx"]) {
      expect(code(file)).not.toMatch(/level|role|firstName|lastName|enrollments?|\/api\/(students|prep)|fetch|request\(/i);
    }
  });

  it("the badge is display only: no permission, assignment or matching code is tied to it", () => {
    for (const file of ["app/roster.tsx", "app/child/[id].tsx"]) {
      const source = code(file);
      expect(source).not.toMatch(/showsPrepStudentBadge\([^)]*\)\s*(&&|\?)\s*[^<(]*(canEdit|canServe|assign)/);
    }
    expect(code("components/prep-student-badge.tsx")).not.toMatch(/onPress|Pressable/);
  });
});
