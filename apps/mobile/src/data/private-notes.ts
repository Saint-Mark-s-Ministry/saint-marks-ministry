// Confidential notes to priests (GET /api/sunday-school/priest-notes?childId=…), kept
// separate from the shared visitation history. The server decides who reads what, and
// the visitations response says whether to ask at all:
//
//   - `standing.canReadPrivateNotes` is false for Super Admin accounts (including one that
//     also holds the Priest tag, and including notes they wrote) and for every View as
//     session, including one a priest started. Then the section is hidden and the
//     request is never made.
//   - Otherwise an active priest (`standing.isPriest`) reads every note for the child, and
//     any other author reads only their own submissions.
//
// Ministry editing rights never grant note access. Pure helpers.

import type { SundaySchoolPriestNote } from "@stmark/contracts";

export type PrivateNotesAccess = "all" | "own" | "none";

/** What this session may read, from the response's own signals; unknown (still loading) reads as none. */
export function privateNotesAccess(
  standing: { canReadPrivateNotes?: boolean; isPriest?: boolean } | null | undefined,
): PrivateNotesAccess {
  if (!standing || standing.canReadPrivateNotes !== true) return "none";
  return standing.isPriest === true ? "all" : "own";
}

export const PRIVATE_NOTES_PREFIX = "priest-notes:";

export function privateNotesPath(childId: string): string {
  return `/api/sunday-school/priest-notes?childId=${encodeURIComponent(childId)}`;
}

/** Cache scope: the viewer (and the real account during View as) and the child, so no one else's answer is ever served. */
export function privateNotesScope(viewer: { id: string; originalId?: string | null }, childId: string): string {
  return `${PRIVATE_NOTES_PREFIX}${viewer.originalId ? `${viewer.originalId}>${viewer.id}` : viewer.id}:${childId}`;
}

export const PRIVATE_NOTES_TITLE = "Private notes to priests";

export function privateNotesCaption(access: Exclude<PrivateNotesAccess, "none">): string {
  return access === "all"
    ? "As a priest, you can read every confidential note for this child."
    : "Only priests and each note's author can read these. You see only your own.";
}

/** Under the private-note field of the visit form. Super Admin accounts can write one but never read it back. */
export function privateNoteFieldHint(access: PrivateNotesAccess): string {
  if (access === "none") {
    return "Only priests can read the private note. Super Admin accounts can't read confidential notes, including their own. It never appears in the shared history.";
  }
  return "Only priests and you, as its author, can read the private note. It never appears in the shared history.";
}

export type PrivateNotesProblem = "denied" | "gone" | "retry";

export function privateNotesProblem(status: number | undefined): PrivateNotesProblem {
  if (status === 403) return "denied";
  if (status === 404) return "gone";
  return "retry";
}

export const PRIVATE_NOTES_PROBLEM_MESSAGE: Record<PrivateNotesProblem, string> = {
  denied: "You can't read confidential notes in this session.",
  gone: "This child's record is no longer available.",
  retry: "Couldn't load the notes.",
};

/** The usable notes from an answer; anything malformed is dropped. */
export function parsePrivateNotes(data: unknown): SundaySchoolPriestNote[] {
  const list = (data as { notes?: unknown } | null | undefined)?.notes;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (note): note is SundaySchoolPriestNote =>
      !!note &&
      typeof note === "object" &&
      typeof (note as SundaySchoolPriestNote).id === "string" &&
      typeof (note as SundaySchoolPriestNote).content === "string" &&
      typeof (note as SundaySchoolPriestNote).createdAt === "string" &&
      typeof (note as SundaySchoolPriestNote).author?.name === "string",
  );
}
