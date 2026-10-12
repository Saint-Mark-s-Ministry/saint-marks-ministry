/**
 * Pure logic for deleting your own account from inside the app (App Store
 * guideline 5.1.1(v)). The server does the deleting (POST /api/account/delete,
 * the same routine an administrator uses); this only decides who is offered it
 * and how a refusal is explained.
 */

/**
 * Super administrators can't remove their own account, and while viewing as
 * someone the account on screen isn't the signed-in person's own. The server
 * refuses both too.
 */
export function canDeleteOwnAccount(role?: string | null, viewingAs: boolean = false): boolean {
  return !!role && role !== "SUPER_ADMIN" && !viewingAs;
}

export function validateDeletionPassword(password: string): string | null {
  return password ? null : "Enter your password to confirm.";
}

/** What deleting does, in the order a person would ask. Shown before the password field. */
export const DELETION_SUMMARY: string[] = [
  "Your sign-in and profile are permanently deleted, and you are signed out on every device.",
  "Your notification settings and linked devices are removed.",
  "Records the church must keep, such as confidential pastoral notes, can prevent deletion in the app. If that applies, you will be told and an administrator can close your account for you.",
  "This can't be undone.",
];

/** A refused or failed deletion, in words that say what happens next. */
export function deletionErrorMessage(status: number | null, serverMessage?: string): string {
  if (status === null) return "Couldn't reach the server. Nothing was deleted. Try again once you're connected.";
  const text = serverMessage?.trim() ?? "";
  if (/ViewAsReadOnly/i.test(text)) return "You're viewing as this person, so their account can't be deleted.";
  if (status === 403 || status === 409 || status === 400) {
    return text || "Your account can't be deleted in the app. Contact an administrator.";
  }
  if (status === 401) return "Your session expired. Sign in again to delete your account.";
  return "Something went wrong and nothing was deleted. Try again.";
}
