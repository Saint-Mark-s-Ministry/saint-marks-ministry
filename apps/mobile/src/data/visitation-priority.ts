// Priority visits: a shared class-team flag on the child, kept on the server
// (PATCH /api/sunday-school/visitations { childId, priority }). Pure helpers.
// The flag is independent of visit and phone-call history: recording either
// never sends or changes it, and the server never clears it.

import type {
  SundaySchoolVisitationChild,
  SundaySchoolVisitationClass,
} from "@stmark/contracts";

export type PriorityOverrides = Record<string, boolean>;

/** What the signed-in person may do, from the response's own permission flags. */
export function canEditPriority(options: { classCanEdit: boolean; viewingAs: boolean }): boolean {
  // `canEdit` is the server's current answer for this class (priests and admins
  // get it for every class). View as is read-only in the app and on the server.
  return options.classCanEdit && !options.viewingAs;
}

/** The request body, built from the state the person toggled to. */
export function priorityRequest(childId: string, priority: boolean) {
  return { childId, priority };
}

/** Pending local choices laid over the server's answer, so a tap shows at once and can be rolled back. */
export function applyPriorityOverrides(
  classes: SundaySchoolVisitationClass[],
  overrides: PriorityOverrides,
): SundaySchoolVisitationClass[] {
  if (!Object.keys(overrides).length) return classes;
  return classes.map((cls) => ({
    ...cls,
    children: cls.children.map((child) =>
      child.id in overrides ? { ...child, visitationPriority: overrides[child.id] } : child,
    ),
  }));
}

export function filterByPriority<T extends { child: Pick<SundaySchoolVisitationChild, "visitationPriority"> }>(
  rows: T[],
  priorityOnly: boolean,
): T[] {
  return priorityOnly ? rows.filter((row) => row.child.visitationPriority) : rows;
}

export function priorityCount(rows: { child: Pick<SundaySchoolVisitationChild, "visitationPriority"> }[]): number {
  return rows.filter((row) => row.child.visitationPriority).length;
}

export const PRIORITY_LABEL = "Priority visit";
export const PRIORITY_FILTER_LABEL = "Priority visits";
export const PRIORITY_EXPLAINER = "Shared with your class team on every device. Recording a visit or call doesn't clear it.";

export function priorityToggleLabel(name: string, on: boolean): string {
  return on ? `Remove ${name} from priority visits` : `Add ${name} to priority visits`;
}

export function priorityDoneMessage(on: boolean): string {
  return on ? "Added to priority visits." : "Removed from priority visits.";
}

export type PriorityFailure = "denied" | "changed" | "gone" | "retry";

export function priorityFailure(status: number | undefined): PriorityFailure {
  if (status === 403) return "denied";
  if (status === 409) return "changed";
  if (status === 404) return "gone";
  return "retry";
}

/** Why a change didn't stick, in words for the person; the list is refreshed alongside. */
export const PRIORITY_FAILURE_MESSAGE: Record<PriorityFailure, string> = {
  denied: "You can't change priority visits for this child. Your access may have changed, so the list was refreshed.",
  changed: "This child's roster changed, possibly a move to another class, so the priority wasn't saved. The list was refreshed.",
  gone: "This child is no longer on a roster, so the priority wasn't saved. The list was refreshed.",
  retry: "Couldn't save the priority. Check your connection and try again.",
};

/** Failures that mean what is on screen is out of date. */
export function failureNeedsRefresh(failure: PriorityFailure): boolean {
  return failure !== "retry";
}
