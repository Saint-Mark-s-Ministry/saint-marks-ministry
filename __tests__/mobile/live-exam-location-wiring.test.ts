import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../..");
const read = (file: string) => readFileSync(join(root, file), "utf8");
const code = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the live exam's church-location wiring", () => {
  it("the hook gives every attempt a locator, and the controller only attaches a position to start, save and submit", () => {
    expect(code("apps/mobile/src/data/use-live-exam.ts")).toContain("locate: createLocator(expoLocationSource)");
    const controller = code("apps/mobile/src/data/exam-attempt.ts");
    expect(controller).toContain('["start", "save", "submit"].includes(String(body.action))');
    expect(controller).toContain('body.action === "save" ? "reuse" : "fresh"');
  });

  it("a position is held in memory only: never in the draft, the store, or any storage", () => {
    const controller = code("apps/mobile/src/data/exam-attempt.ts");
    expect(controller.match(/type Draft = \{[^}]*\}/)?.[0]).not.toMatch(/position|latitude|location/i);
    for (const file of ["apps/mobile/src/data/exam-location.ts", "apps/mobile/src/data/exam-location-source.ts"])
      expect(code(file)).not.toMatch(/SecureStore|AsyncStorage|setItem|writeAsync|FileSystem|console\./);
  });

  it("asks for when-in-use location only, with a plain reason, and never for Always", () => {
    const app = JSON.parse(read("apps/mobile/app.json")) as { expo: { plugins: unknown[] } };
    const plugin = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-location") as [string, Record<string, unknown>] | undefined;
    expect(plugin).toBeDefined();
    expect(plugin![1].locationWhenInUsePermission).toMatch(/online exam.*at church.*never stored/i);
    expect(plugin![1].locationAlwaysAndWhenInUsePermission).toBe(false);
    expect(plugin![1].locationAlwaysPermission).toBe(false);
    expect(JSON.parse(read("apps/mobile/package.json")).dependencies["expo-location"]).toMatch(/^~57\./);
  });

  it("the start card says what is checked, and a location problem has its own card with Settings when only Settings helps", () => {
    const screen = read("apps/mobile/src/app/prep-live-exam/[id].tsx");
    expect(screen).toContain("within 150 meters of the church");
    expect(screen).toContain("it is only checked, never stored");
    expect(screen).toContain("Location needed");
    expect(screen).toContain("Linking.openSettings()");
  });

  it("Start, Resume and Submit are plain pressables that always render, not the SwiftUI-hosted shared button", () => {
    const screen = code("apps/mobile/src/app/prep-live-exam/[id].tsx");
    expect(screen).not.toMatch(/<Button\b/);
    expect(screen.match(/<ExamActionButton/g)?.length).toBeGreaterThanOrEqual(4);
    expect(code("apps/mobile/src/components/exam-action-button.tsx")).toContain("<Pressable");
  });

  it("never touches an answer key or a grade before release", () => {
    const screen = read("apps/mobile/src/app/prep-live-exam/[id].tsx");
    expect(screen).not.toMatch(/answerKey/);
    // A result is shown only when the server sent one, which it does only after release.
    expect(screen).toContain('typeof control.attempt?.correctCount === "number"');
    expect(screen).toContain("after servants release the grades");
  });
});
