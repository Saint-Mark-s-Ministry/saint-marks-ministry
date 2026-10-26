import type { RoleTag, UserRole } from "@stmark/contracts";
export interface Person { id: string; name: string; email: string; phone: string | null; role: UserRole; profileImageUrl?: string | null; isDisabled?: boolean; updatedAt?: string; roleAssignments: { tag: RoleTag }[]; canAccessContactBook?: boolean; }
export const accessTagLabels: Record<RoleTag, string> = {
  SUPER_ADMIN: "Super administrator", PRIEST: "Priest (edits ministry records)",
  SUNDAY_SCHOOL_SERVANT: "Sunday School servant", SUNDAY_SCHOOL_STUDENT: "Sunday School student",
  PARENT: "Parent", SERVANTS_PREP_SERVANT: "Servants Prep leader", SERVANTS_PREP_STUDENT: "Servants Prep student",
};

/**
 * "Allow contact book access" belongs to existing accounts that are not (and
 * are not being made) super administrators: they use the Users page instead,
 * and the server denies the directory to them regardless of a stored grant.
 * Judged from the *draft* tags so ticking Super administrator hides it, as on web.
 */
export function showsContactBookAccess(input: { exists: boolean; draftTags: RoleTag[] }): boolean {
  return input.exists && !input.draftTags.includes("SUPER_ADMIN");
}

/** Only an active super admin may change it, and never while viewing as someone else. */
export function canChangeContactBookAccess(input: { actorRole: string | null | undefined; viewAs?: boolean }): boolean {
  return input.actorRole === "SUPER_ADMIN" && !input.viewAs;
}

/** Whether saving needs the separate access request; profile updates never carry this field. */
export function contactBookAccessChanged(input: {
  draftTags: RoleTag[];
  original: boolean | undefined;
  next: boolean;
}): boolean {
  return !input.draftTags.includes("SUPER_ADMIN") && input.next !== (input.original ?? false);
}

export function contactBookAccessErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("ViewAsReadOnly")) return "Exit View as to change contact book access.";
  return message || "Please try again.";
}
