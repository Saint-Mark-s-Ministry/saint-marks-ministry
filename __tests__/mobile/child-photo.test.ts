import { describe, expect, it } from "vitest";
import {
  CHILD_PHOTO_MAX_BYTES,
  canChangeChildPhoto,
  childPhotoPath,
  childPhotoUri,
  hasOwnPhoto,
  isCameraUnavailable,
  photoFailure,
  photoFailureMessage,
  resolvePhotoMimeType,
  validateChildPhoto,
} from "../../apps/mobile/src/data/child-photo";

const ORIGIN = "https://portal.example.org";

describe("child photos", () => {
  it("uses the existing route with the id encoded", () => {
    expect(childPhotoPath("kid-1")).toBe("/api/sunday-school/children/kid-1/photo");
    expect(childPhotoPath("a/b")).toBe("/api/sunday-school/children/a%2Fb/photo");
  });

  it("keeps the account-photo fallback: the child's own photo first, then the linked account's", () => {
    expect(childPhotoUri({ photoUrl: "https://blob.example/own.jpg", accountPhotoUrl: "https://blob.example/acct.jpg" }, ORIGIN)).toBe("https://blob.example/own.jpg");
    expect(childPhotoUri({ photoUrl: null, accountPhotoUrl: "https://blob.example/acct.jpg" }, ORIGIN)).toBe("https://blob.example/acct.jpg");
    expect(childPhotoUri({ photoUrl: null, user: { profileImageUrl: "/uploads/u.jpg" } }, ORIGIN)).toBe("https://portal.example.org/uploads/u.jpg");
    expect(childPhotoUri({}, ORIGIN)).toBeNull();
    expect(childPhotoUri({ photoUrl: "javascript:alert(1)" }, ORIGIN)).toBeNull();
  });

  it("only a child's own photo can be removed; removing it brings back the account photo", () => {
    expect(hasOwnPhoto({ photoUrl: "https://x/y.jpg" })).toBe(true);
    expect(hasOwnPhoto({ photoUrl: null })).toBe(false);
    expect(hasOwnPhoto({})).toBe(false);
  });

  it("gates the actions on current permission, an active record, and View as being read-only", () => {
    expect(canChangeChildPhoto({ canEdit: true, isActive: true, viewingAs: false })).toBe(true);
    expect(canChangeChildPhoto({ canEdit: false, isActive: true, viewingAs: false })).toBe(false);
    expect(canChangeChildPhoto({ canEdit: true, isActive: false, viewingAs: false })).toBe(false);
    expect(canChangeChildPhoto({ canEdit: true, isActive: true, viewingAs: true })).toBe(false);
    expect(canChangeChildPhoto({ canEdit: true, viewingAs: false })).toBe(true);
  });

  it("checks the same limits the server does before sending", () => {
    expect(validateChildPhoto({ mimeType: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateChildPhoto({ mimeType: "image/png", size: CHILD_PHOTO_MAX_BYTES })).toBeNull();
    expect(validateChildPhoto({ mimeType: "image/webp", size: 10 })).toBeNull();
    expect(validateChildPhoto({ mimeType: "image/jpeg", size: CHILD_PHOTO_MAX_BYTES + 1 })).toMatch(/over 4 MB/);
    expect(validateChildPhoto({ mimeType: "image/heic", size: 1000 })).toMatch(/JPG, PNG or WebP/);
    expect(validateChildPhoto({ mimeType: "image/gif", size: 1000 })).toMatch(/JPG, PNG or WebP/);
    expect(validateChildPhoto({ mimeType: "image/jpeg", size: 0 })).toMatch(/couldn't be read/);
  });

  it("settles the file type from the picker, then the file name, else JPEG", () => {
    expect(resolvePhotoMimeType("IMAGE/PNG", "x.jpg")).toBe("image/png");
    expect(resolvePhotoMimeType(null, "x.WEBP")).toBe("image/webp");
    expect(resolvePhotoMimeType(undefined, "x.png")).toBe("image/png");
    expect(resolvePhotoMimeType(null, null)).toBe("image/jpeg");
  });

  it("explains a refused, missing, oversized, rejected and failed upload, and that the saved photo is unchanged", () => {
    expect(photoFailure(403)).toBe("denied");
    expect(photoFailure(404)).toBe("gone");
    expect(photoFailure(413)).toBe("tooLarge");
    expect(photoFailure(400)).toBe("invalid");
    expect(photoFailure(500)).toBe("retry");
    expect(photoFailure(undefined)).toBe("retry");
    expect(photoFailureMessage("denied")).toMatch(/can't change/);
    expect(photoFailureMessage("invalid", "Photo must be under 4 MB")).toBe("Photo must be under 4 MB");
    expect(photoFailureMessage("retry")).toMatch(/saved photo is unchanged/);
  });

  it("tells a missing camera from a bug", () => {
    expect(isCameraUnavailable(new Error("Camera not available on simulator"))).toBe(true);
    expect(isCameraUnavailable(new Error("Cannot launch: no camera"))).toBe(true);
    expect(isCameraUnavailable(new Error("boom"))).toBe(false);
  });
});
