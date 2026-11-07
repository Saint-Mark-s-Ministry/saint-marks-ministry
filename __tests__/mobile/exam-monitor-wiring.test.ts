import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../..");
const read = (file: string) => readFileSync(join(root, file), "utf8");
const code = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sourceFiles = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

describe("the staff-only pieces stay out of every student path", () => {
  const staffOnly = ["exam-realtime", "use-exam-realtime", "use-proctor-alerts", "proctor-alerts", "exam-monitor", "use-exam-staff-actions", "exam-monitor-parts"];
  const importers = (name: string) =>
    sourceFiles("apps/mobile/src").filter((file) => new RegExp(`from ["'][^"']*/${name}["']`).test(code(file)));

  it("only the Exam Monitoring screen (and the staff modules themselves) import the channel, the alerts and the staff actions", () => {
    const allowed = new Set([
      "apps/mobile/src/app/prep-exam-monitor/[id].tsx",
      "apps/mobile/src/components/exam-monitor-parts.tsx",
      ...staffOnly.map((name) => `apps/mobile/src/data/${name}.ts`),
    ]);
    for (const name of staffOnly)
      for (const file of importers(name)) expect(allowed, `${file} imports ${name}`).toContain(file);
  });

  it("the student exam screen, controller and list use no audio, notification, or realtime module", () => {
    for (const file of ["apps/mobile/src/app/prep-live-exam/[id].tsx", "apps/mobile/src/data/exam-attempt.ts", "apps/mobile/src/components/live-exam-list.tsx"]) {
      const text = code(file);
      expect(text, file).not.toMatch(/expo-notifications|expo-audio|expo-av|WebSocket|pusher|private-digital-exam|live-auth|proctor-alerts|exam-realtime/i);
    }
  });

  it("the screen refuses non-staff before it holds anything, and subscribes only through shouldSubscribe", () => {
    const screen = code("apps/mobile/src/app/prep-exam-monitor/[id].tsx");
    expect(screen).toContain('liveExamAudience(user?.role) !== "staff"');
    expect(screen).toMatch(/useExamRealtime\(\s*id,\s*shouldSubscribe\(/);
    expect(screen).toContain("manage = view?.canManage === true && !viewingAs");
    expect(code("apps/mobile/src/data/use-exam-staff-actions.ts")).toContain("if (!enabled || lock.current) return false");
  });

  it("authorizes the channel only through the existing staff-only endpoint, as a form POST", () => {
    const hook = code("apps/mobile/src/data/use-exam-realtime.ts");
    expect(hook).toContain('"/api/digital-exams/live-auth"');
    expect(hook).toContain("application/x-www-form-urlencoded");
    expect(hook).toContain("socket_id");
    expect(hook).toContain("channel_name");
  });

  it("holds the channel only while the screen is focused and the app is active", () => {
    const hook = code("apps/mobile/src/data/use-exam-realtime.ts");
    expect(hook).toContain("enabled && focused && foreground");
    expect(hook).toContain("connection.close()");
  });
});

describe("the alert audio uses only the permitted bundled clips", () => {
  const app = JSON.parse(read("apps/mobile/app.json")) as { expo: { plugins: unknown[] } };
  const plugin = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-notifications") as [string, { sounds: string[] }];

  it("bundles the five voice clips, each of which exists, and not the clip without a redistribution license", () => {
    expect(plugin[1].sounds).toHaveLength(5);
    for (const path of plugin[1].sounds) {
      expect(path).toMatch(/public\/sounds\/egyptian-english-[a-z-]+\.wav$/);
      expect(() => readFileSync(join(root, "apps/mobile", path))).not.toThrow();
    }
    expect(JSON.stringify(plugin)).not.toContain("borat");
  });

  it("plays through one replaceable local notification that is dismissed on mute, on leaving, and on backgrounding", () => {
    const hook = code("apps/mobile/src/data/use-proctor-alerts.ts");
    expect(hook).toContain("identifier: ALERT_NOTIFICATION_ID");
    expect(hook).toContain("dismissNotificationAsync(ALERT_NOTIFICATION_ID)");
    expect(hook).toContain('value !== "active"');
    expect(hook).toMatch(/if \(sound\) \{ setSound\(false\); silence\(\); return; \}/);
  });
});

describe("the monitor never computes or publishes a grade", () => {
  it("has no answer-key comparison or score arithmetic in any staff module", () => {
    for (const file of ["exam-monitor.ts", "exam-monitor-parts.tsx", "use-exam-staff-actions.ts"].map((name) => (name.endsWith(".tsx") ? `apps/mobile/src/components/${name}` : `apps/mobile/src/data/${name}`))) {
      const text = code(file);
      expect(text, file).not.toMatch(/answerKey\[|\* 2\b|\/ 50|correctCount \*|percentage\s*=(?!=)/);
    }
  });
  it("offers View As no way to send a staff action", () => {
    expect(code("apps/mobile/src/data/api-client.ts")).toContain("ViewAsReadOnly");
    expect(code("apps/mobile/src/app/prep-exam-monitor/[id].tsx")).toContain("!viewingAs");
  });
});
