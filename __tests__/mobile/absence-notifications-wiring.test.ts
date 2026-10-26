import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("absence notifications on iOS", () => {
  it("shows the server's follow-up or escalation and week count in the feed", () => {
    const feed = src("app/notifications.tsx");
    expect(feed).toContain("<AbsenceTags");
    expect(feed).toContain("absenceDisplay(");
  });

  it("works nothing out on the device: no streaks, recipients or alerts of its own", () => {
    for (const file of ["data/absence-notifications.ts", "app/notifications.tsx"]) {
      expect(code(file)).not.toMatch(/absentStreak|consecutive\(|scheduleNotificationAsync|presentNotificationAsync|new Notification/);
    }
  });

  it("looks for the child only among what the server will show this person", () => {
    const detail = code("app/visitation/[childId].tsx");
    expect(detail).toContain("setAnyClass(true)");
    // The only request is the scoped visitations list; there is no lookup of a child by id.
    expect(detail).not.toMatch(/children\/\$\{|\/api\/sunday-school\/children/);
  });
});
