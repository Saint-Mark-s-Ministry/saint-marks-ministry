import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (file: string) => readFileSync(join(__dirname, "../../apps/mobile/src", file), "utf8");
const code = (file: string) => src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("child photos on iOS", () => {
  it("the roster row has a camera control apart from the row's own tap, shown only where permitted", () => {
    const roster = src("app/roster.tsx");
    expect(roster).toContain("<TakePhotoButton");
    expect(roster).toContain("canChangeChildPhoto({ canEdit: canEditChild(child, classes, access.admin)");
    expect(roster).toContain("viewingAs: !!viewingAs");
    expect(roster.indexOf("<TakePhotoButton")).toBeGreaterThan(roster.indexOf("</Pressable>", roster.indexOf('pathname: "/child/[id]"')));
  });

  it("the profile offers Take photo, Choose from library and Remove, gated the same way", () => {
    const detail = src("app/child/[id].tsx");
    for (const label of ['label="Take photo"', 'label="Choose from library"', 'label="Remove photo"']) expect(detail).toContain(label);
    expect(detail).toContain("canChangeChildPhoto(");
    expect(detail).toContain("confirmAction(");
  });

  it("asks for the camera only inside the Take photo action, never at launch or for the library", () => {
    const hook = code("data/use-child-photos.ts");
    expect(hook.match(/requestCameraPermissionsAsync/g)).toHaveLength(1);
    expect(hook).not.toMatch(/requestMediaLibraryPermissionsAsync|Camera\.use|CameraView/);
    expect(code("app/_layout.tsx")).not.toMatch(/requestCameraPermissionsAsync/);
  });

  it("uses the system camera in-process, so it releases the camera when it closes, and keeps no local copy", () => {
    const hook = code("data/use-child-photos.ts");
    expect(hook).toContain("launchCameraAsync");
    expect(hook).toContain("discard(asset.uri)");
    expect(hook).not.toMatch(/saveToLibrary|MediaLibrary|createAssetAsync|SecureStore|AsyncStorage/);
  });

  it("uploads with multipart field `file` and removes with DELETE on the existing route", () => {
    const hook = code("data/use-child-photos.ts");
    expect(hook).toContain('"file"');
    expect(hook).toContain('method: "POST"');
    expect(hook).toContain('method: "DELETE"');
    expect(hook).toContain("childPhotoPath(");
  });

  it("keeps the account-photo fallback by using the shared getChildPhotoUrl order", () => {
    expect(code("data/child-photo.ts")).toContain("getChildPhotoUrl(child)");
  });
});
