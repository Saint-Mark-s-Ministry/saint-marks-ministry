// The day's Katameros (lectionary) and Synaxarium, from /api/liturgical/*.
//
// Types mirror lib/liturgical.ts on the server; the native app can't import
// that file (it pulls in server-only code), so the shapes it uses are repeated
// here. Pure helpers only, so they are unit tested.

export type LiturgicalLanguage = "en" | "ar";
export type ReadingService = "vespers" | "matins" | "liturgy" | "evening";

export interface ScriptureVerse {
  num: number;
  text: string;
}

export interface ScripturePassage {
  bookName: string;
  /** "Luke 4:1-13" */
  reference: string;
  chapters: { chapter: number; verses: ScriptureVerse[] }[];
}

export interface ReadingSection {
  key: string;
  label: string;
  service: ReadingService;
  passages: ScripturePassage[];
}

export interface SynaxariumStory {
  name: string;
  text: string | null;
}

export interface CopticDateInfo {
  day: number;
  month: number;
  year: number;
  monthName: string;
  /** "2 Baba 1743 A.M." */
  label: string;
}

export interface DailyReadings {
  date: string;
  language: LiturgicalLanguage;
  copticDate: CopticDateInfo | null;
  season: string | null;
  seasonDay: string | null;
  sections: ReadingSection[];
  synaxarium: SynaxariumStory[];
}

export type FeastCategory = "majorFeast" | "minorFeast" | "otherFeast" | "fast" | "commemoration";

export interface LiturgicalFeast {
  name: string;
  category: FeastCategory;
}

export const SERVICE_ORDER: ReadingService[] = ["vespers", "matins", "liturgy", "evening"];

export const SERVICE_LABELS: Record<ReadingService, string> = {
  vespers: "Vespers",
  matins: "Matins",
  liturgy: "Divine Liturgy",
  evening: "Evening",
};

/** `/api/liturgical/readings`, for a given day (omit to let the server use the church's today). */
export function readingsPath(date: string | null, lang: LiturgicalLanguage): string {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  params.set("lang", lang);
  return `/api/liturgical/readings?${params.toString()}`;
}

/** `/api/liturgical/day`: season, fast, feasts, saints and reading references for a day. */
export function dayPath(date: string | null, lang: LiturgicalLanguage): string {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  params.set("lang", lang);
  return `/api/liturgical/day?${params.toString()}`;
}

export interface ServiceGroup {
  service: ReadingService;
  label: string;
  sections: ReadingSection[];
}

/** Sections grouped into services, in liturgical order, skipping services with nothing read. */
export function groupByService(sections: ReadingSection[]): ServiceGroup[] {
  return SERVICE_ORDER.map((service) => ({
    service,
    label: SERVICE_LABELS[service],
    sections: sections.filter((section) => section.service === service),
  })).filter((group) => group.sections.length > 0);
}

/**
 * The collapsed summary of a reading with several passages, written the way
 * the Katameros does: passages from the same book share its name
 * ("2 Corinthians 4:5-18; 5:1-11"), different books are separated by a dot.
 */
export function referenceSummary(section: ReadingSection): string {
  const parts: string[] = [];
  let lastBook: string | null = null;
  for (const passage of section.passages) {
    const reference = passage.reference.trim();
    if (!reference) continue;
    const prefix = passage.bookName ? `${passage.bookName} ` : "";
    if (parts.length > 0 && prefix && lastBook === passage.bookName && reference.startsWith(prefix)) {
      parts[parts.length - 1] += `; ${reference.slice(prefix.length)}`;
    } else {
      parts.push(reference);
    }
    lastBook = passage.bookName;
  }
  return parts.join(" · ");
}

/** Whether there is any scripture text to show once a reading is opened. */
export function hasText(section: ReadingSection): boolean {
  return section.passages.some((passage) => passage.chapters.some((chapter) => chapter.verses.length > 0));
}

/** Verses of one chapter, ready to render as numbered runs. */
export function chapterVerses(chapter: ScripturePassage["chapters"][number]): ScriptureVerse[] {
  return [...chapter.verses].sort((a, b) => a.num - b.num);
}

// Feast helpers live with the rest of the church-calendar logic.
export { isLordlyFeast, notableFeasts } from "./liturgical";

/** Items on the page that can be expanded: every reading with text, every story with text. */
export function expandableIds(readings: DailyReadings): string[] {
  const ids: string[] = [];
  for (const section of readings.sections) if (hasText(section)) ids.push(`reading:${section.key}`);
  readings.synaxarium.forEach((story, index) => {
    if (story.text) ids.push(`story:${index}`);
  });
  return ids;
}

export function readingId(section: ReadingSection): string {
  return `reading:${section.key}`;
}

export function storyId(index: number): string {
  return `story:${index}`;
}
