import { describe, expect, it } from "vitest";
import {
  expandableIds,
  groupByService,
  hasText,
  headlineReference,
  isLordlyFeast,
  notableFeasts,
  readingsPath,
  referenceSummary,
  type DailyReadings,
  type ReadingSection,
} from "../../apps/mobile/src/data/readings";

const passage = (reference: string, verses: string[] = ["In the beginning"]) => ({
  bookName: reference.replace(/\s+\d+:.*$/, ""),
  reference,
  chapters: [{ chapter: 1, verses: verses.map((text, i) => ({ num: i + 1, text })) }],
});

const section = (key: string, label: string, service: ReadingSection["service"], references: string[], verses?: string[]): ReadingSection => ({
  key,
  label,
  service,
  passages: references.map((reference) => passage(reference, verses)),
});

const day: DailyReadings = {
  date: "2026-10-12",
  language: "en",
  copticDate: { day: 2, month: 2, year: 1743, monthName: "Baba", label: "2 Baba 1743 A.M." },
  season: null,
  seasonDay: null,
  sections: [
    section("LGospel", "Liturgy Gospel", "liturgy", ["John 10:1-16"]),
    section("VGospel", "Vespers Gospel", "vespers", ["Matthew 16:13-19"]),
    section("MPsalm", "Matins Psalm", "matins", ["Psalms 73:23-24", "Psalms 73:28"]),
  ],
  synaxarium: [
    { name: "The Coming of Saint Severus", text: "On this day..." },
    { name: "A name with no text", text: null },
  ],
};

describe("daily readings", () => {
  it("groups readings into services in liturgical order (happy path)", () => {
    const groups = groupByService(day.sections);
    expect(groups.map((g) => g.service)).toEqual(["vespers", "matins", "liturgy"]);
    expect(groups[0].label).toBe("Vespers");
    expect(groups[2].label).toBe("Divine Liturgy");
  });

  it("leaves out services with nothing read", () => {
    expect(groupByService([])).toEqual([]);
    expect(groupByService([section("E", "Evening", "evening", ["Psalms 1"])]).map((g) => g.service)).toEqual(["evening"]);
  });

  it("writes several passages from one book the way the Katameros does", () => {
    expect(referenceSummary(day.sections[2])).toBe("Psalms 73:23-24; 73:28");
    expect(referenceSummary(day.sections[1])).toBe("Matthew 16:13-19");
    expect(referenceSummary(section("P", "Pauline", "liturgy", ["2 Corinthians 4:5-18", "2 Corinthians 5:1-11"]))).toBe(
      "2 Corinthians 4:5-18; 5:1-11",
    );
  });

  it("keeps different books apart and tolerates odd references", () => {
    expect(referenceSummary(section("M", "Mixed", "liturgy", ["Psalms 9:14", "John 1:1-5", "John 1:9"]))).toBe(
      "Psalms 9:14 · John 1:1-5; 1:9",
    );
    expect(referenceSummary({ ...day.sections[0], passages: [] })).toBe("");
  });

  it("only offers to expand what has text (highest-risk path)", () => {
    const empty = section("X", "Empty", "liturgy", ["Psalms 1"], []);
    expect(hasText(empty)).toBe(false);
    expect(hasText(day.sections[0])).toBe(true);
    const ids = expandableIds({ ...day, sections: [...day.sections, empty] });
    expect(ids).toContain("reading:LGospel");
    expect(ids).not.toContain("reading:X");
    expect(ids).toContain("story:0");
    expect(ids).not.toContain("story:1");
  });

  it("builds the request for a day and language", () => {
    expect(readingsPath(null, "en")).toBe("/api/liturgical/readings?lang=en");
    expect(readingsPath("2026-10-12", "ar")).toBe("/api/liturgical/readings?date=2026-10-12&lang=ar");
  });

  it("picks the Liturgy Gospel as the headline, else any Gospel", () => {
    expect(headlineReference(day)).toBe("John 10:1-16");
    expect(headlineReference({ ...day, sections: [day.sections[1]] })).toBe("Matthew 16:13-19");
    expect(headlineReference({ ...day, sections: [day.sections[2]] })).toBeNull();
    expect(headlineReference(undefined)).toBeNull();
  });

  it("flags feasts but not commemorations or fasts", () => {
    const feasts = [
      { name: "Feast of the Cross", category: "majorFeast" as const },
      { name: "St. Mark", category: "commemoration" as const },
      { name: "Fast", category: "fast" as const },
      { name: "Other feast", category: "otherFeast" as const },
    ];
    expect(notableFeasts(feasts).map((f) => f.name)).toEqual(["Feast of the Cross", "Other feast"]);
    expect(isLordlyFeast(feasts[0])).toBe(true);
    expect(isLordlyFeast(feasts[3])).toBe(false);
  });
});
