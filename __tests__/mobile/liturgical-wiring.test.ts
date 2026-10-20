import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");

// The church calendar reaches many screens; these keep the wiring from quietly
// falling out (a card dropped from a home, a clock read from the device).
describe("Coptic IO on iOS: where it appears", () => {
  it.each(["app/(tabs)/home/index.tsx", "app/(prep)/home/index.tsx"])("%s shows Today in the Church", (file) => {
    const source = src(file);
    expect(source).toContain('from "@/components/today-in-church-card"');
    expect(source).toContain("<TodayInChurchCard />");
  });

  it.each([
    ["Sunday School lesson list", "app/lessons.tsx"],
    ["Sunday School lesson planning screen", "app/lesson/[id].tsx"],
    ["Sunday School home", "app/(tabs)/home/index.tsx"],
    ["Servants Prep curriculum", "app/prep-curriculum.tsx"],
    ["Servants Prep home", "app/(prep)/home/index.tsx"],
  ])("tags feasts and fasts on the %s", (_name, file) => {
    const source = src(file);
    expect(source).toContain("useLiturgicalCalendar(");
    expect(source).toContain("<LiturgicalTags");
  });

  it("offers every calendar the subscription menu", () => {
    for (const file of ["app/readings.tsx", "app/(tabs)/calendar/index.tsx", "app/(prep)/calendar/index.tsx"]) {
      expect(src(file)).toContain("<CalendarSubscribeMenu");
    }
    expect(src("components/today-in-church-card.tsx")).toContain("<CalendarSubscribeMenu");
  });

  it("lets a feast on either calendar open that date's readings", () => {
    expect(src("data/calendar.ts")).toContain('pathname: "/readings"');
    expect(src("app/(prep)/calendar/index.tsx")).toContain("readingsRoute(event.date)");
    expect(src("components/liturgical-parts.tsx")).toContain("readingsRoute(day.date)");
  });

  it("curriculum only flags dates that are still ahead, as on the web", () => {
    const source = src("app/prep-curriculum.tsx");
    expect(source).toMatch(/\.filter\(\(day\) => day >= churchDay\)/);
  });
});

describe("Coptic IO on iOS: time and safety", () => {
  it("reads 'today' from the church's clock, never the device's", () => {
    for (const file of [
      "app/readings.tsx",
      "components/today-in-church-card.tsx",
      "app/(tabs)/calendar/index.tsx",
      "app/(prep)/calendar/index.tsx",
    ]) {
      expect(src(file)).toContain("useChurchToday()");
    }
    expect(src("data/calendar.ts")).toMatch(/export function todayKey\(now: Date = new Date\(\)\): DateKey \{\s*return churchToday\(now\);/);
  });

  it("gives the date picker UTC days, so no device zone can shift a selected date", () => {
    const source = src("app/readings.tsx");
    expect(source).toContain('timeZoneName="UTC"');
    expect(source).toContain("pickerDateFor(shownDate)");
    expect(source).toContain("keyFromPickerDate(chosen)");
  });

  it("lays Arabic out right-to-left", () => {
    const source = src("app/readings.tsx");
    expect(source).toContain('direction: rtl ? "rtl" : "ltr"');
    expect(source).toContain('writingDirection: rtl ? "rtl" : "ltr"');
  });

  it("renders upstream text as text, never as markup", () => {
    for (const file of ["app/readings.tsx", "components/today-in-church-card.tsx", "components/liturgical-parts.tsx"]) {
      expect(src(file)).not.toMatch(/dangerouslySetInnerHTML|WebView|injectedJavaScript|html:/);
    }
  });

  it("only ever calls the shared, authenticated liturgical endpoints", () => {
    const calls = ["data/readings.ts", "data/liturgical.ts", "data/use-liturgical.ts"].map(src).join("\n");
    expect(calls).toContain("/api/liturgical/readings");
    expect(calls).toContain("/api/liturgical/day");
    expect(calls).toContain("/api/liturgical/calendar");
    // Nothing on the device talks to Coptic IO directly, except the person's own calendar app via the public feed.
    expect(calls).not.toMatch(/fetch\(["'`]https:\/\/api\.coptic\.io/);
  });
});
