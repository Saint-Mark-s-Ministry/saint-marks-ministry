import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  attendanceNotices,
  saveStatusText,
} from "../../apps/mobile/src/data/attendance-draft";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Take attendance screen (SMM-111)", () => {
  const screen = code("app/attendance/[classId].tsx");

  it("goes through the editor, never writing attendance or drafts itself", () => {
    expect(screen).toContain("useAttendanceEditor(");
    expect(screen).not.toMatch(/SecureStore|attendance\/batch|"POST"|saveAttendance/);
  });

  it("turns editing off during a View As preview", () => {
    expect(screen).toMatch(/const canEdit = !!cls\.canServe && !viewingAs;/);
  });

  it("asks before recording unmarked children as absent", () => {
    expect(screen).toMatch(/Mark \$\{unmarked\} \$\{unmarked === 1 \? "child" : "children"\} absent\?/);
  });

  it("never lists the portal's setDraft as an effect dependency (it changes every render and looped the screen)", () => {
    expect(screen).toContain("setDraftRef.current(classId, date, state.pending)");
    expect(screen).not.toMatch(/\[[^\]]*\bsetDraft\b[^\]]*\]\);/);
  });

  it("keeps the save bar and its notices in their own component", () => {
    const area = src("components/attendance-save-area.tsx");
    for (const text of ["Save attendance", "Mark rest present", "Resume saving marks", "Retry pending marks", "Reload roster and recover marks"])
      expect(area).toContain(text);
  });

  it("the editor's writes always name the signed-in account", () => {
    const editor = code("data/attendance-editor.ts");
    expect(editor.match(/expectedUserId: this\.options\.userId/g)).toHaveLength(2);
  });
});

describe("what the person is told", () => {
  const base = { canEdit: true, recovered: false, pendingCount: 0, storageError: false, removedCount: 0, saveError: null, retryable: false, refreshError: null, saving: false };

  it("says where the marks are", () => {
    expect(saveStatusText("local", 3).title).toBe("On this device only · 3 marks waiting");
    expect(saveStatusText("local", 1).title).toBe("On this device only · 1 mark waiting");
    expect(saveStatusText("saving", 3).title).toBe("Saving to the church…");
    expect(saveStatusText("saved", 0)).toEqual({ title: "Saved to the church", tone: "success" });
    expect(saveStatusText("failed", 3).tone).toBe("danger");
    expect(saveStatusText("recovered", 2).title).toBe("Recovered 2 marks · not saved yet");
  });

  it("offers Resume only for a recovered draft with marks to send", () => {
    expect(attendanceNotices({ ...base, recovered: true, pendingCount: 2 }).map((n) => [n.id, n.actions])).toEqual([["recovered", ["resume"]]]);
    expect(attendanceNotices({ ...base, recovered: true, pendingCount: 0 })).toEqual([]);
    expect(attendanceNotices({ ...base, canEdit: false, recovered: true, pendingCount: 2 })).toEqual([]);
  });

  it("keeps a refusal for explicit recovery and says a transient failure retries by itself", () => {
    const refused = attendanceNotices({ ...base, pendingCount: 2, saveError: "Forbidden." });
    expect(refused[0]).toMatchObject({ id: "failed", tone: "danger", actions: ["retry", "reload"] });
    expect(refused[0].text).not.toMatch(/automatically/);
    expect(attendanceNotices({ ...base, pendingCount: 2, saveError: "Offline.", retryable: true })[0].text).toMatch(/Trying again automatically/);
    // A message with no full stop is given one before the next sentence.
    expect(attendanceNotices({ ...base, pendingCount: 2, saveError: "Not on this roster" })[0].text).toMatch(/^Not on this roster\. Attendance has not been confirmed saved\./);
  });

  it("explains removed children and a device that cannot keep marks", () => {
    expect(attendanceNotices({ ...base, removedCount: 1 })[0].text).toMatch(/1 recovered mark belongs to children no longer in this class and will not be sent/);
    expect(attendanceNotices({ ...base, removedCount: 2 })[0].text).toMatch(/2 recovered marks belong/);
    expect(attendanceNotices({ ...base, pendingCount: 1, storageError: true })[0].id).toBe("storage");
    expect(attendanceNotices({ ...base, storageError: true })).toEqual([]);
  });

  it("a failed refresh says the marks are still there", () => {
    expect(attendanceNotices({ ...base, refreshError: "Offline." })[0]).toMatchObject({ id: "refresh", actions: ["reload"] });
    expect(attendanceNotices({ ...base, refreshError: "Offline.", saving: true })[0].actions).toEqual([]);
  });
});
