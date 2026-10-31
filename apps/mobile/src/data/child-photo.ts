// A child's photo (POST/DELETE /api/sunday-school/children/[id]/photo), taken with
// the camera or chosen from the library. Pure helpers: no network, no native modules.
//
// The photo is the child's own (`photoUrl`). A child without one still shows the
// linked account's photo when there is one (`accountPhotoUrl`, then
// `user.profileImageUrl`), exactly as `getChildPhotoUrl` decides; setting or
// removing a child photo never touches the account's photo.

import { getChildPhotoUrl } from "@stmark/domain";

/** The same limits the route enforces. */
export const CHILD_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const CHILD_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface PhotoTarget {
  id: string;
  name: string;
}

export function childPhotoPath(id: string): string {
  return `/api/sunday-school/children/${encodeURIComponent(id)}/photo`;
}

/** Whether the person may change this child's photo. The server still decides on every request. */
export function canChangeChildPhoto(options: {
  /** `canEditChild(child, classes, isAdmin)`: serving this child's class, or an admin. */
  canEdit: boolean;
  isActive?: boolean;
  /** View as is read-only in the app and on the server. */
  viewingAs: boolean;
}): boolean {
  return options.canEdit && options.isActive !== false && !options.viewingAs;
}

/** The photo to show: the child's own, else the linked account's, as an absolute http(s) URL, or null. */
export function childPhotoUri(
  child: Parameters<typeof getChildPhotoUrl>[0],
  origin: string,
): string | null {
  const raw = getChildPhotoUrl(child);
  if (!raw) return null;
  try {
    const url = new URL(raw, origin.endsWith("/") ? origin : `${origin}/`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Whether the child has a photo of their own that "Remove photo" would delete (an account photo is not removable here). */
export function hasOwnPhoto(child: { photoUrl?: string | null }): boolean {
  return !!child.photoUrl;
}

/** A problem with the picked photo before anything is sent, or null. */
export function validateChildPhoto(photo: { mimeType?: string | null; size: number }): string | null {
  const type = (photo.mimeType ?? "").toLowerCase();
  if (type && !(CHILD_PHOTO_TYPES as readonly string[]).includes(type)) return "Use a JPG, PNG or WebP photo.";
  if (photo.size > CHILD_PHOTO_MAX_BYTES) return "That photo is over 4 MB. Take or choose a smaller one.";
  if (photo.size <= 0) return "That photo couldn't be read. Try again.";
  return null;
}

export function resolvePhotoMimeType(mimeType: string | null | undefined, fileName: string | null | undefined): string {
  if (mimeType) return mimeType.toLowerCase();
  const name = (fileName ?? "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export type PhotoFailure = "denied" | "gone" | "tooLarge" | "invalid" | "retry";

export function photoFailure(status: number | undefined): PhotoFailure {
  if (status === 403) return "denied";
  if (status === 404) return "gone";
  if (status === 413) return "tooLarge";
  if (status === 400) return "invalid";
  return "retry";
}

/** In words for the person. A 400 carries the server's own sentence ("Use a JPG, PNG or WebP photo"). */
export function photoFailureMessage(failure: PhotoFailure, serverMessage?: string): string {
  switch (failure) {
    case "denied":
      return "You can't change this child's photo. Your access may have changed.";
    case "gone":
      return "This child is no longer on a roster, so the photo wasn't saved.";
    case "tooLarge":
      return "That photo is too large to upload. Take or choose a smaller one.";
    case "invalid":
      return serverMessage?.trim() || "The server couldn't use that photo. Try another one.";
    default:
      return "Couldn't upload the photo. Check your connection and try again. The saved photo is unchanged.";
  }
}

export const REMOVE_FAILURE = "Couldn't remove the photo. Check your connection and try again. The saved photo is unchanged.";

// ── Permissions and availability ────────────────────────────────────────────

export const CAMERA_NEEDED =
  "Camera access is needed to take a photo. You can allow it when asked, or choose a photo from your library instead.";
export const CAMERA_BLOCKED =
  "Camera access is off for this app. Turn it on in Settings to take a photo, or choose a photo from your library instead.";
export const CAMERA_UNAVAILABLE = "This device has no camera available. Choose a photo from your library instead.";

/** Whether a launch failure means there is no camera (a Simulator, or hardware in use), not a bug. */
export function isCameraUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /not available|no camera|unavailable|simulator/i.test(message);
}

export const PHOTO_SAVED = "Photo saved.";
export const PHOTO_REMOVED = "Photo removed.";
