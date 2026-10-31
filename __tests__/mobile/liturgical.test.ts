import { describe, expect, it } from "vitest";
import {
  CALENDAR_CHUNK_SIZE,
  COPTIC_CALENDAR_FEED_URL,
  calendarPath,
  calendarSubscriptionLinks,
  chunkDates,
  churchToday,
  clampLiturgicalDate,
  copticDateText,
  fastLabel,
  headlineReading,
  isLiturgicalDateKey,
  keyFromPickerDate,
  liturgicalSummary,
  liturgicalTags,
  msUntilChurchMidnight,
  pickerDateFor,
  readingsRoute,
  saintsSentence,
  secondsUntilChurchMidnight,
  subscribeUrl,
  SUBSCRIBE_CHOICES,
  type LiturgicalCalendarDay,
  type ReadingReference,
} from "../../apps/mobile/src/data/liturgical";
import { addDays } from "../../apps/mobile/src/data/calendar";

describe("church time", () => {
  it("is New York's calendar day, whatever the device zone is (happy path)", () => {
    // 03:30 UTC is 23:30 the evening before in New York (EDT, UTC-4).
    expect(churchToday(new Date("2026-10-18T03:30:00Z"))).toBe("2026-10-17");
    expect(churchToday(new Date("2026-10-18T12:00:00Z"))).toBe("2026-10-18");
  });

  it("rolls over exactly at church midnight, in summer and winter time (highest-risk path)", () => {
    // EDT: midnight is 04:00 UTC.
    expect(churchToday(new Date("2026-10-18T03:59:59Z"))).toBe("2026-10-17");
    expect(churchToday(new Date("2026-10-18T04:00:00Z"))).toBe("2026-10-18");
    // EST: midnight is 05:00 UTC (the clocks went back on 2026-11-01).
    expect(churchToday(new Date("2026-11-02T04:59:59Z"))).toBe("2026-11-01");
    expect(churchToday(new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02");
  });

  it("keeps the day through both daylight-saving changes", () => {
    // Spring forward 2026-03-08 02:00 EST -> 03:00 EDT (07:00 UTC).
    expect(churchToday(new Date("2026-03-08T06:59:00Z"))).toBe("2026-03-08");
    expect(churchToday(new Date("2026-03-08T07:00:00Z"))).toBe("2026-03-08");
    expect(churchToday(new Date("2026-03-09T03:59:00Z"))).toBe("2026-03-08");
    expect(churchToday(new Date("2026-03-09T04:00:00Z"))).toBe("2026-03-09");
    // Fall back: 01:30 happens twice on 2026-11-01 and is still the 1st.
    expect(churchToday(new Date("2026-11-01T05:30:00Z"))).toBe("2026-11-01");
    expect(churchToday(new Date("2026-11-01T06:30:00Z"))).toBe("2026-11-01");
  });

  it("counts the seconds left in the church's day", () => {
    expect(secondsUntilChurchMidnight(new Date("2026-10-17T20:00:00Z"))).toBe(8 * 3600); // 16:00 EDT
    expect(secondsUntilChurchMidnight(new Date("2026-10-18T03:00:00Z"))).toBe(3600); // 23:00 EDT
    expect(secondsUntilChurchMidnight(new Date("2026-10-18T04:00:00Z"))).toBe(86400); // just after midnight
  });

  it("times the screen's rollover to the millisecond, with no minimum", () => {
    expect(msUntilChurchMidnight(new Date("2026-10-18T03:59:59.250Z"))).toBe(750);
    expect(msUntilChurchMidnight(new Date("2026-10-18T03:59:30Z"))).toBe(30_000);
    expect(msUntilChurchMidnight(new Date("2026-10-18T04:00:00Z"))).toBe(86_400_000);
  });

  it("never asks a cache for a lifetime shorter than a minute", () => {
    expect(secondsUntilChurchMidnight(new Date("2026-10-18T03:59:45Z"))).toBe(60);
  });
});

describe("dates the server accepts", () => {
  it("accepts real days from 1900 through 2199 only", () => {
    expect(isLiturgicalDateKey("2026-10-17")).toBe(true);
    expect(isLiturgicalDateKey("1900-01-01")).toBe(true);
    expect(isLiturgicalDateKey("2199-12-31")).toBe(true);
    expect(isLiturgicalDateKey("1899-12-31")).toBe(false);
    expect(isLiturgicalDateKey("2200-01-01")).toBe(false);
    expect(isLiturgicalDateKey("2026-02-30")).toBe(false);
    expect(isLiturgicalDateKey("2026-2-3")).toBe(false);
    expect(isLiturgicalDateKey("2026-10-17T00:00:00Z")).toBe(false);
    expect(isLiturgicalDateKey(undefined)).toBe(false);
  });

  it("clamps a stepped date to the supported years", () => {
    expect(clampLiturgicalDate(addDays("1900-01-01", -1))).toBe("1900-01-01");
    expect(clampLiturgicalDate(addDays("2199-12-31", 1))).toBe("2199-12-31");
    expect(clampLiturgicalDate("2026-10-17")).toBe("2026-10-17");
  });

  it("hands the date picker a day that no device time zone can move", () => {
    for (const key of ["2026-03-08", "2026-11-01", "2026-12-31", "2027-01-01", "1900-01-01", "2199-12-31"]) {
      expect(keyFromPickerDate(pickerDateFor(key))).toBe(key);
    }
    // Noon UTC is the same calendar day from UTC-11 to UTC+11.
    expect(pickerDateFor("2026-10-17").toISOString()).toBe("2026-10-17T12:00:00.000Z");
  });
});

describe("calendar endpoint chunking", () => {
  const days = (count: number, from = "2026-01-01") => Array.from({ length: count }, (_, i) => addDays(from, i));

  it("splits any range into requests of at most 60 dates, nothing dropped (highest-risk path)", () => {
    const chunks = chunkDates(days(125));
    expect(chunks.map((chunk) => chunk.length)).toEqual([60, 60, 5]);
    expect(chunks.flat()).toEqual(days(125));
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThanOrEqual(CALENDAR_CHUNK_SIZE);
  });

  it("sorts, de-duplicates and drops anything the server would reject", () => {
    const messy = ["2026-10-20", "2026-10-18", "2026-10-20", "not-a-date", "2026-02-30", "1800-01-01", "2026-10-19"];
    expect(chunkDates(messy)).toEqual([["2026-10-18", "2026-10-19", "2026-10-20"]]);
    expect(chunkDates([])).toEqual([]);
  });

  it("fits exactly 60 in one request", () => {
    expect(chunkDates(days(60)).map((chunk) => chunk.length)).toEqual([60]);
    expect(chunkDates(days(61)).map((chunk) => chunk.length)).toEqual([60, 1]);
  });

  it("builds the request path", () => {
    expect(calendarPath(["2026-10-18", "2026-10-19"])).toBe("/api/liturgical/calendar?dates=2026-10-18,2026-10-19");
  });
});

describe("feast and fast tags", () => {
  const day = (over: Partial<LiturgicalCalendarDay> = {}): LiturgicalCalendarDay => ({
    date: "2026-12-29",
    copticDate: { day: 20, month: 4, year: 1743, monthName: "Koiahk", label: "20 Koiahk 1743 A.M." },
    fast: null,
    feasts: [],
    ...over,
  });

  it("flags feasts and the fast, but not commemorations (happy path)", () => {
    const tags = liturgicalTags(
      day({
        fast: { name: "Nativity Fast", type: null },
        feasts: [
          { name: "Nativity", category: "majorFeast" },
          { name: "St. Mark", category: "commemoration" },
        ],
      }),
    );
    expect(tags).toEqual({
      copticLabel: null,
      feasts: [{ name: "Nativity", category: "majorFeast" }],
      fast: "Nativity Fast",
    });
  });

  it("renders nothing for an ordinary day or when Coptic IO had no answer", () => {
    expect(liturgicalTags(day())).toBeNull();
    expect(liturgicalTags(undefined)).toBeNull();
    expect(liturgicalSummary(undefined)).toBe("");
  });

  it("shows the Coptic date only when asked, and a lone Coptic date is enough to show", () => {
    expect(liturgicalTags(day())).toBeNull();
    expect(liturgicalTags(day(), { copticDate: true })?.copticLabel).toBe("20 Koiahk 1743 A.M.");
  });

  it("reads a day out for a screen reader", () => {
    expect(
      liturgicalSummary(
        day({ fast: { name: "Nativity Fast", type: null }, feasts: [{ name: "Nativity", category: "majorFeast" }] }),
      ),
    ).toBe("Nativity, Nativity Fast");
  });

  it("opens that date's readings", () => {
    expect(readingsRoute("2026-12-29")).toEqual({ pathname: "/readings", params: { date: "2026-12-29" } });
  });
});

describe("Today in the Church", () => {
  const ref = (key: string, reference: string): ReadingReference => ({ key, label: key, service: "liturgy", reference });

  it("headlines the Liturgy Gospel, else the nearest Gospel, else the first reading", () => {
    expect(headlineReading([ref("MGospel", "Mark 1"), ref("LGospel", "John 10:1-16")])?.reference).toBe("John 10:1-16");
    expect(headlineReading([ref("VGospel", "Matthew 16"), ref("MGospel", "Mark 1")])?.reference).toBe("Mark 1");
    expect(headlineReading([ref("Pauline", "Romans 1")])?.reference).toBe("Romans 1");
    expect(headlineReading([])).toBeNull();
  });

  it("lists up to three saints, then counts the rest", () => {
    expect(saintsSentence(["A", "B"])).toBe("A · B");
    expect(saintsSentence(["A", "B", "C"])).toBe("A · B · C");
    expect(saintsSentence(["A", "B", "C", "D", "E"])).toBe("A · B · C · and 2 more");
  });

  it("tells a known non-fasting day from an unknown one (highest-risk path)", () => {
    expect(fastLabel({ fasting: null })).toBeNull();
    expect(fastLabel({ fasting: { fast: null } })).toEqual({ text: "No fast today", fasting: false });
    expect(fastLabel({ fasting: { fast: { name: "Great Lent", type: null } } })).toEqual({
      text: "Great Lent",
      fasting: true,
    });
  });
});

describe("subscribing in the phone's calendar", () => {
  it("uses Coptic IO's own feed, directly", () => {
    expect(COPTIC_CALENDAR_FEED_URL).toBe("https://api.coptic.io/api/calendar/ical/subscribe");
    const links = calendarSubscriptionLinks();
    expect(links.https).toBe("https://api.coptic.io/api/calendar/ical/subscribe");
    expect(links.webcal).toBe("webcal://api.coptic.io/api/calendar/ical/subscribe");
  });

  it("builds the Google and Outlook add-by-URL links", () => {
    const links = calendarSubscriptionLinks();
    expect(links.google).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent("webcal://api.coptic.io/api/calendar/ical/subscribe")}`,
    );
    expect(links.outlookWeb).toContain(
      `url=${encodeURIComponent("https://api.coptic.io/api/calendar/ical/subscribe")}`,
    );
    expect(links.outlookWeb).toContain(`name=${encodeURIComponent("Coptic Orthodox Calendar")}`);
  });

  it("offers each calendar app, plus copying the link, and opens nothing for copy", () => {
    expect(SUBSCRIBE_CHOICES.map((choice) => choice.id)).toEqual(["apple", "google", "outlook", "copy"]);
    expect(subscribeUrl("apple")).toBe("webcal://api.coptic.io/api/calendar/ical/subscribe");
    expect(subscribeUrl("google")?.startsWith("https://calendar.google.com/")).toBe(true);
    expect(subscribeUrl("outlook")?.startsWith("https://outlook.live.com/")).toBe(true);
    expect(subscribeUrl("copy")).toBeNull();
  });

  it("sends nothing about the person: only the public feed address is ever used", () => {
    const everything = Object.values(calendarSubscriptionLinks()).join(" ");
    expect(everything).not.toMatch(/token|session|cookie|userId|childId/i);
  });
});

describe("Arabic Coptic date", () => {
  it("ends an Arabic label with a left-to-right mark so \"A.M.\" keeps its full stop, and leaves English alone", () => {
    expect(copticDateText("9 بابه 1743 A.M.", "ar")).toBe("9 بابه 1743 A.M.\u200E");
    expect(copticDateText("9 Baba 1743 A.M.", "en")).toBe("9 Baba 1743 A.M.");
  });
});
