import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Priority visits on iOS", () => {
  it("the list shows the label, the star, and a Priority visits filter", () => {
    const list = src("app/visitations.tsx");
    expect(list).toContain("<PriorityPill");
    expect(list).toContain("<PriorityStar");
    expect(list).toContain("PRIORITY_FILTER_LABEL");
    expect(list).toContain("filterByPriority(rows, priorityOnly)");
  });

  it("the star is shown only to people the response lets edit, and is a control apart from the row", () => {
    const list = src("app/visitations.tsx");
    expect(list).toContain("canEditPriority({ classCanEdit: row.canEdit");
    expect(list.indexOf("{canStar && (")).toBeGreaterThan(list.indexOf("</Pressable>", list.indexOf('pathname: "/visitation/[childId]"')));
  });

  it("keeps the list where it was after opening a child (no scroll reset on focus)", () => {
    expect(code("app/visitations.tsx")).not.toContain("resetOnFocus");
  });

  it("recording a visit or call never sends or changes the priority", () => {
    for (const file of ["components/visitation-entry-sheet.tsx", "components/phone-call-entry-sheet.tsx"]) {
      expect(code(file)).not.toMatch(/priority/i);
    }
  });

  it("priority is saved only through the PATCH hook, as { childId, priority }", () => {
    expect(code("data/use-visitation-priority.ts")).toContain('"PATCH"');
    expect(code("data/visitation-priority.ts")).toContain("return { childId, priority }");
  });

  it("the detail screen keeps priority apart from the visit and call histories", () => {
    const detail = src("app/visitation/[childId].tsx");
    expect(detail.indexOf("PRIORITY_LABEL")).toBeLessThan(detail.indexOf('<SectionTitle title="History"'));
    expect(detail).toContain("canEditPriority(");
  });
});
