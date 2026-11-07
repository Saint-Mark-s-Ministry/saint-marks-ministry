import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const code = (file: string) =>
  readFileSync(join(__dirname, "../..", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const screen = code("apps/mobile/src/app/prep-application.tsx");

describe("the Application screen under View As", () => {
  it("scopes the read to the effective student and the viewer, and keeps drafts out of View As", () => {
    expect(screen).toContain("applicationScope(user?.id, viewingAs?.originalId)");
    expect(screen).toContain("draftStorageKey(user?.id, readOnly)");
  });
  it("is read-only: fields disabled, no Save, no upload, and the writers refuse", () => {
    expect(screen).toContain("const readOnly = !!viewingAs");
    expect(screen.match(/disabled=\{action\.busy \|\| readOnly\}/g)).toHaveLength(4);
    expect(screen).toContain("{!readOnly && (\n                    <Button");
    expect(screen).toContain("{!readOnly && <CompactRow");
    expect(screen).toContain("if (!data || readOnly) return;");
    expect(screen).toContain("if (uploadBusy || readOnly) return;");
  });
  it("offers a retry for every load failure and shows the review badge", () => {
    expect(screen).toContain('label="Try again"');
    expect(screen).toContain("reviewBadge(data)");
  });
});
