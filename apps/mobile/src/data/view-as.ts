// View As eligibility and display, as the native app uses it. Pure helpers; nothing here grants anything.
// The server decides who may preview (lib/view-as-access.ts: an active Super Admin, or an account with an
// individual grant) and re-checks on every session request. These only decide what the app shows, from the
// session capability the server last sent. A Priest role or tag does not appear anywhere in them: a priest
// can preview only once a Super Admin has switched the grant on for that person.

import type { RoleTag } from "@stmark/contracts";

/** The preview lasts 30 minutes (lib/auth.ts VIEW_AS_MAX_AGE_MS); this is only for the countdown. */
export const VIEW_AS_MINUTES = 30;

/**
 * Whether to offer View As. During a preview the session user is the person being viewed, so being in one
 * is itself the signal (the server ends it if the actor lost access). Otherwise: a Super Admin, or an
 * account the server marked `canUseViewAs`. A forced password change blocks it, as on the server.
 */
export function canStartViewAs(input: {
  user: { role: string; canUseViewAs?: boolean; mustChangePassword?: boolean } | null | undefined;
  viewingAs: unknown;
}): boolean {
  if (input.viewingAs) return true;
  const user = input.user;
  if (!user || user.mustChangePassword) return false;
  return user.role === "SUPER_ADMIN" || user.canUseViewAs === true;
}

/** Milliseconds left in the preview, never negative. */
export function viewAsRemainingMs(expiresAt: number, now: number = Date.now()): number {
  return Math.max(0, expiresAt - now);
}

/** "29 min left", "Under a minute left", or "Ending" once it has run out. */
export function viewAsRemainingLabel(expiresAt: number, now: number = Date.now()): string {
  const ms = viewAsRemainingMs(expiresAt, now);
  if (ms <= 0) return "Ending";
  // Rounded, so a device clock a few seconds behind the server's still reads "30 min" at the start.
  return ms < 60000 ? "Under a minute left" : `${Math.round(ms / 60000)} min left`;
}

/** What to tell someone whose preview ended without their pressing Stop. */
export function viewAsEndedMessage(reason: "expired" | "access-ended"): { title: string; message: string } {
  return reason === "expired"
    ? { title: "View as ended", message: "The 30-minute preview has ended, and you are back in your own account." }
    : { title: "View as ended", message: "Your View as access was removed, so the preview was closed." };
}

export type ViewAsAccessControl =
  | { visible: false }
  | {
      visible: true;
      /** The switch can be used at all: only an active Super Admin outside a preview. */
      editable: boolean;
      /** Switching on is allowed (an active priest). Switching off is allowed whenever the grant exists. */
      canGrant: boolean;
      caption: string;
    };

/**
 * The "Allow View as" switch on a person's access screen. It belongs to priests: shown while the draft tags
 * include Priest, or while a grant exists (so it can be revoked after the tag is removed). Granting needs an
 * active account that is a priest in the draft; revoking is always possible. Super Admins already have
 * access and get no switch. Only an authorized Super Admin outside View As may use it; the server enforces
 * the same and also refuses a Super Admin who holds the Priest tag.
 */
export function viewAsAccessControl(input: {
  exists: boolean;
  actorRole: string | null | undefined;
  viewingAs: boolean;
  targetRole: string;
  targetDisabled: boolean;
  draftTags: readonly RoleTag[];
  granted: boolean;
}): ViewAsAccessControl {
  if (!input.exists || input.targetRole === "SUPER_ADMIN" || input.draftTags.includes("SUPER_ADMIN")) return { visible: false };
  const isPriest = input.draftTags.includes("PRIEST");
  if (!isPriest && !input.granted) return { visible: false };
  const canGrant = isPriest && !input.targetDisabled;
  const editable = input.actorRole === "SUPER_ADMIN" && !input.viewingAs && (canGrant || input.granted);
  const caption = input.viewingAs
    ? "Exit View as to change this."
    : input.actorRole !== "SUPER_ADMIN"
      ? "Only a Super Admin can change this."
      : !isPriest
        ? "This person is no longer a priest. Turn this off to remove the grant."
        : input.targetDisabled && !input.granted
          ? "Enable the account before allowing View as."
          : "Lets this priest preview the app as another user, read-only, for 30 minutes.";
  return { visible: true, editable, canGrant, caption };
}

/** Whether saving needs the separate request: the switch moved, and the move is allowed. */
export function viewAsAccessChanged(input: { control: ViewAsAccessControl; original: boolean; next: boolean }): boolean {
  if (!input.control.visible || !input.control.editable || input.original === input.next) return false;
  return input.next ? input.control.canGrant : true;
}

export function viewAsAccessPath(userId: string): string {
  return `/api/admin/users/${encodeURIComponent(userId)}/view-as-access`;
}

export function viewAsAccessErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("ViewAsReadOnly")) return "Exit View as to change View as access.";
  return message || "Please try again.";
}

/** Why starting a preview failed, in the person's terms. */
export function viewAsStartErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/forbidden|403/i.test(message)) return "You no longer have View as access.";
  return message || "View as could not be started. Try again.";
}
