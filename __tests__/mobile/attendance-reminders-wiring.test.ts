import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("class-attendance reminders on iOS", () => {
  it("shows throughout Sunday School, not Servants Prep, from the root layout", () => {
    const layout = src("app/_layout.tsx");
    expect(layout).toContain('ministry === "sundaySchool" && <AttendanceReminderBanner');
  });

  it("has no dismiss control: only the server's answer clears a reminder", () => {
    const banner = code("components/attendance-reminder-banner.tsx");
    expect(banner).not.toMatch(/dismiss|onClose|setHidden|AsyncStorage|SecureStore/i);
  });

  it("never reads drafts, sessions or servant attendance to decide completion", () => {
    for (const file of ["components/attendance-reminder-banner.tsx", "data/use-attendance-reminders.ts", "data/attendance-reminders.ts"]) {
      expect(code(file)).not.toMatch(/drafts|usePortal|attendance\[|servant-attendance|rosterProgress/);
    }
  });

  it("asks the server again after a confirmed save and on foreground", () => {
    expect(code("data/portal-provider.tsx")).toContain("requestAttendanceReminderRefresh()");
    expect(code("data/use-attendance-reminders.ts")).toContain('next === "active"');
  });

  it("opens the class on the exact date from the banner", () => {
    expect(src("components/attendance-reminder-banner.tsx")).toContain("router.push(reminderRoute(reminder))");
  });

  it("is separate from the Tuesday lesson reminder", () => {
    expect(code("data/attendance-reminders.ts")).not.toMatch(/lesson-reminder|LESSON_REMINDER/);
  });
});
