/**
 * Pure logic for the Sunday School Visitations list, child history, and
 * entry-sheet screens (SMM-55).
 *
 * The real model (SundaySchoolVisitation) has only status (DONE/NOT_DONE),
 * visitedAt, and a public notes field — confirmed against the real POST
 * route and Prisma schema. There is no participants field and no follow-up
 * owner/date field anywhere in the schema or in the design artboards'
 * own entry-sheet artboard, so this module does not invent them.
 */

import type {
  SundaySchoolVisitationChild,
  SundaySchoolVisitationClass,
  SundaySchoolVisitationRecord,
} from "@stmark/contracts";

export type FlatVisitationChild = {
  child: SundaySchoolVisitationChild;
  classId: string;
  className: string;
  canEdit: boolean;
};

/** One row per active child, across every class in the response — the list screen's own real unit. */
export function flattenVisitationChildren(classes: SundaySchoolVisitationClass[]): FlatVisitationChild[] {
  return classes.flatMap((cls) =>
    cls.children.map((child) => ({ child, classId: cls.id, className: cls.name, canEdit: cls.canEdit })),
  );
}

/** Visitations are already ordered newest-first by the server; this just names that assumption. */
export function latestVisitation(child: SundaySchoolVisitationChild): SundaySchoolVisitationRecord | null {
  return child.visitations[0] ?? null;
}

export type VisitationStatusTone = "done" | "notDone";

/** A child with no record yet reads the same as "not done" — the real data has no third bucket. */
export function visitationTone(child: SundaySchoolVisitationChild): VisitationStatusTone {
  return latestVisitation(child)?.status === "DONE" ? "done" : "notDone";
}

export type VisitationSummary = { total: number; done: number; notDone: number };

export function visitationSummary(children: SundaySchoolVisitationChild[]): VisitationSummary {
  const done = children.filter((c) => visitationTone(c) === "done").length;
  return { total: children.length, done, notDone: children.length - done };
}

export type StatusFilter = "all" | "done" | "notDone";

export function filterByStatus<T extends { child: SundaySchoolVisitationChild }>(rows: T[], filter: StatusFilter): T[] {
  if (filter === "all") return rows;
  return rows.filter((row) => visitationTone(row.child) === filter);
}

export function matchesSearch(child: SundaySchoolVisitationChild, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${child.firstName} ${child.lastName}`.toLowerCase().includes(q);
}

export type ChildSort = "name" | "due" | "recent";

/**
 * "due" surfaces children with no completed visit (or the oldest completed
 * one) first — the closest honest reading of this ticket's "due" filter,
 * since the real schema has no due-date field to sort by directly. "recent"
 * surfaces the most recently visited first.
 */
export function sortFlatChildren<T extends { child: SundaySchoolVisitationChild }>(rows: T[], sort: ChildSort): T[] {
  const byName = (a: T, b: T) => `${a.child.lastName}${a.child.firstName}`.localeCompare(`${b.child.lastName}${b.child.firstName}`);
  if (sort === "name") return [...rows].sort(byName);
  const dateKey = (row: T) => latestVisitation(row.child)?.visitedAt ?? latestVisitation(row.child)?.createdAt ?? null;
  if (sort === "recent") {
    return [...rows].sort((a, b) => {
      const da = dateKey(a);
      const db = dateKey(b);
      if (!da && !db) return byName(a, b);
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da) || byName(a, b);
    });
  }
  // "due": not-done children first (undated ones first among those), then done children, oldest visit first.
  return [...rows].sort((a, b) => {
    const toneA = visitationTone(a.child);
    const toneB = visitationTone(b.child);
    if (toneA !== toneB) return toneA === "notDone" ? -1 : 1;
    const da = dateKey(a);
    const db = dateKey(b);
    if (!da && !db) return byName(a, b);
    if (!da) return -1;
    if (!db) return 1;
    return da.localeCompare(db) || byName(a, b);
  });
}

/** The list row / child header's second line. */
export function rowSubtitle(child: SundaySchoolVisitationChild, className: string): string {
  const latest = latestVisitation(child);
  if (latest?.status === "DONE" && latest.visitedAt) return `Last visit ${latest.visitedAt.slice(0, 10)}`;
  return className;
}

/** The confidential-notes section's own caption, honest about what this viewer can see — the real route does the actual filtering server-side; this never overrides it. */
export function confidentialNotesCaption(isPriest: boolean): string {
  return isPriest
    ? "As a priest, you can read every confidential note for this child."
    : "Only priests and each note's author can read these.";
}

export type EntryDraft = {
  status: "DONE" | "NOT_DONE";
  visitedAt: string;
  notes: string;
  privateNote: string;
};

export function emptyEntryDraft(today: string): EntryDraft {
  return { status: "DONE", visitedAt: today, notes: "", privateNote: "" };
}

/** Mirrors the real POST route's own validation exactly, so the sheet can fail fast before a request. */
export function validateEntryDraft(draft: EntryDraft, today: string): string | null {
  if (draft.status === "DONE") {
    if (!draft.visitedAt) return "Choose the date this visit happened.";
    if (draft.visitedAt > today) return "A completed visitation cannot be in the future.";
  }
  if (draft.notes.trim().length > 5000) return "Notes must be 5,000 characters or fewer.";
  if (draft.privateNote.trim().length > 5000) return "The private note must be 5,000 characters or fewer.";
  return null;
}

export function isEntryDraftDirty(draft: EntryDraft, blank: EntryDraft): boolean {
  return (
    draft.status !== blank.status ||
    draft.visitedAt !== blank.visitedAt ||
    draft.notes.trim() !== blank.notes.trim() ||
    draft.privateNote.trim() !== blank.privateNote.trim()
  );
}
