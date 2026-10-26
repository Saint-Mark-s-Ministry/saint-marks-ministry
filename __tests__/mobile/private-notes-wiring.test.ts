import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const all = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(join(__dirname, "../../apps/mobile/src", dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(__dirname, "../../apps/mobile/src", rel)).isDirectory()) all(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
};

describe("confidential notes on iOS", () => {
  it("the only code that reads private notes is the private-note hook, through the private-note route", () => {
    const readers = [...all("app"), ...all("components"), ...all("data")].filter((file) => /priest-notes|privateNotesPath/.test(code(file)));
    expect(readers.sort()).toEqual(["data/private-notes.ts", "data/use-private-notes.ts"]);
  });

  it("hides the section and suppresses the request from the response's own signal", () => {
    const detail = code("app/visitation/[childId].tsx");
    expect(detail).toContain("privateNotesAccess(resource.data?.standing)");
    expect(detail).toContain('notesAccess !== "none" && (');
    expect(code("data/use-private-notes.ts")).toContain('options.access !== "none"');
    expect(code("data/use-private-notes.ts")).toContain("!viewingAs");
  });

  it("keeps private content out of shared history, logs, summaries and previews", () => {
    for (const file of ["data/use-private-notes.ts", "data/private-notes.ts", "app/visitation/[childId].tsx", "app/student-history/[id].tsx"]) {
      expect(code(file)).not.toMatch(/console\.(log|warn|error|info|debug)/);
    }
    // The shared history sheet never asks for or renders a confidential note.
    expect(code("app/student-history/[id].tsx")).not.toMatch(/priest-notes|PriestNote|privateNote\b/);
    // Notification rows show the server's own content-free title and body, never a note.
    expect(code("app/notifications.tsx")).not.toMatch(/priest-notes|\.content\b|privateNote/i);
  });

  it("forgets private content when the viewer, permission or screen changes", () => {
    const hook = code("data/use-private-notes.ts");
    expect(hook).toContain("dropResources(PRIVATE_NOTES_PREFIX)");
    expect(hook).toContain("privateNotesScope(");
  });

  it("the history sheet mentions confidential notes only to sessions the server lets read them", () => {
    expect(code("app/student-history/[id].tsx")).toContain("history.canReadPrivateNotes === true");
  });

  it("ordinary ministry editing grants no note access: the policy never reads the role or the editing flags", () => {
    const policy = code("data/private-notes.ts");
    expect(policy).not.toMatch(/role|canEdit|canServe|isAdmin|SUPER_ADMIN|PRIEST/);
  });
});
