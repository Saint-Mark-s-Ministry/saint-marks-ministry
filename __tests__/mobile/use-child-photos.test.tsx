import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  request: vi.fn(),
  invalidate: vi.fn(),
  camera: vi.fn(),
  library: vi.fn(),
  permission: vi.fn(),
  deleted: [] as string[],
  openSettings: vi.fn(),
  blobSize: 1000,
  blobType: "image/jpeg",
}));
vi.mock("react-native", () => ({ Linking: { openSettings: native.openSettings } }));
vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: native.permission,
  launchCameraAsync: native.camera,
  launchImageLibraryAsync: native.library,
  CameraType: { back: "back" },
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: "compatible" },
}));
vi.mock("expo-file-system", () => ({
  File: class {
    constructor(public uri: string) {}
    get exists() { return true; }
    delete() { native.deleted.push(this.uri); }
  },
}));
vi.mock("../../apps/mobile/src/data/auth-provider", () => ({ api: { request: native.request } }));
vi.mock("../../apps/mobile/src/data/resources", () => ({ invalidateResourceCache: native.invalidate }));

type Notice = { kind: string; message: string; canOpenSettings?: boolean; target?: { id: string; name: string } };
type Hook = {
  busyId: string | null;
  notice: Notice | null;
  dismiss: () => void;
  openSettings: () => void;
  takePhoto: (t: { id: string; name: string }) => Promise<void>;
  choosePhoto: (t: { id: string; name: string }) => Promise<void>;
  removePhoto: (t: { id: string; name: string }) => Promise<void>;
};
const { useChildPhotos } = await vi.importActual<{ useChildPhotos: (onChanged: () => Promise<unknown> | void) => Hook }>(
  "../../apps/mobile/src/data/use-child-photos",
);
const { ApiError } = await vi.importActual<{ ApiError: new (message: string, status: number) => Error }>(
  "../../apps/mobile/src/data/api-client",
);

const kid = { id: "kid-1", name: "Mina Mark" };
const asset = (over: Record<string, unknown> = {}) => ({ uri: "file:///tmp/photo.jpg", mimeType: "image/jpeg", fileName: "photo.jpg", ...over });
let changed: () => Promise<undefined>;

beforeEach(() => {
  native.request.mockReset();
  native.request.mockResolvedValue({ id: "kid-1", photoUrl: "https://x/y.jpg" });
  native.invalidate.mockReset();
  native.camera.mockReset();
  native.library.mockReset();
  native.permission.mockReset();
  native.permission.mockResolvedValue({ granted: true, canAskAgain: true });
  native.deleted.length = 0;
  native.openSettings.mockReset();
  native.blobSize = 1000;
  native.blobType = "image/jpeg";
  changed = vi.fn(async () => undefined);
  globalThis.fetch = vi.fn(async () => ({ blob: async () => ({ size: native.blobSize, type: native.blobType }) })) as unknown as typeof fetch;
  // The component under test builds a Blob and FormData; keep them simple.
  globalThis.Blob = class { constructor(public parts: unknown[], public opts: { type: string }) {} } as unknown as typeof Blob;
  globalThis.FormData = class { fields: unknown[][] = []; append(...args: unknown[]) { this.fields.push(args); } } as unknown as typeof FormData;
});
afterEach(cleanup);

describe("useChildPhotos", () => {
  it("takes a photo: asks for the camera, uploads multipart `file` to the child's route, refreshes, and deletes the temporary file", async () => {
    native.camera.mockResolvedValue({ canceled: false, assets: [asset()] });
    const { result } = renderHook(() => useChildPhotos(changed));
    await act(async () => { await result.current.takePhoto(kid); });
    expect(native.permission).toHaveBeenCalledTimes(1);
    const [path, init] = native.request.mock.calls[0];
    expect(path).toBe("/api/sunday-school/children/kid-1/photo");
    expect(init.method).toBe("POST");
    expect(init.body.fields[0][0]).toBe("file");
    expect(native.invalidate).toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(native.deleted).toEqual(["file:///tmp/photo.jpg"]);
    expect(result.current.notice).toEqual({ kind: "info", message: "Photo saved." });
    expect(result.current.busyId).toBeNull();
  });

  it("a refused camera never opens it, and offers Settings (blocked) or a second ask, plus the library", async () => {
    native.permission.mockResolvedValue({ granted: false, canAskAgain: false });
    const { result } = renderHook(() => useChildPhotos(changed));
    await act(async () => { await result.current.takePhoto(kid); });
    expect(native.camera).not.toHaveBeenCalled();
    expect(native.request).not.toHaveBeenCalled();
    expect(result.current.notice).toMatchObject({ kind: "permission", canOpenSettings: true, target: kid });
    expect(result.current.notice?.message).toMatch(/Turn it on in Settings/);
    native.permission.mockResolvedValue({ granted: false, canAskAgain: true });
    await act(async () => { await result.current.takePhoto(kid); });
    expect(result.current.notice).toMatchObject({ kind: "permission", canOpenSettings: false });
    act(() => result.current.openSettings());
    expect(native.openSettings).toHaveBeenCalled();
  });

  it("a cancelled capture changes nothing: no upload, no refresh, no message", async () => {
    native.camera.mockResolvedValue({ canceled: true, assets: [] });
    const { result } = renderHook(() => useChildPhotos(changed));
    await act(async () => { await result.current.takePhoto(kid); });
    expect(native.request).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(result.current.notice).toBeNull();
    expect(result.current.busyId).toBeNull();
  });

  it("no camera on the device points to the library instead of failing", async () => {
    native.camera.mockRejectedValue(new Error("Camera not available on simulator"));
    const { result } = renderHook(() => useChildPhotos(changed));
    await act(async () => { await result.current.takePhoto(kid); });
    expect(result.current.notice).toMatchObject({ kind: "permission", target: kid });
    expect(result.current.notice?.message).toMatch(/no camera/i);
  });

  it("the library fallback uploads the chosen photo without asking for library permission", async () => {
    native.library.mockResolvedValue({ canceled: false, assets: [asset({ uri: "file:///tmp/lib.jpg" })] });
    const { result } = renderHook(() => useChildPhotos(changed));
    await act(async () => { await result.current.choosePhoto(kid); });
    expect(native.permission).not.toHaveBeenCalled();
    expect(native.request).toHaveBeenCalledTimes(1);
    expect(native.deleted).toEqual(["file:///tmp/lib.jpg"]);
  });

  it("an oversized photo is stopped before upload, and the temporary file is still deleted", async () => {
    native.blobSize = 5 * 1024 * 1024;
    native.camera.mockResolvedValue({ canceled: false, assets: [asset()] });
    const { result } = renderHook(() => useChildPhotos(changed));
    await act(async () => { await result.current.takePhoto(kid); });
    expect(native.request).not.toHaveBeenCalled();
    expect(result.current.notice?.message).toMatch(/over 4 MB/);
    expect(native.deleted).toEqual(["file:///tmp/photo.jpg"]);
  });

  it("a failed upload keeps the saved photo, says so, and offers the library; a refusal also refreshes", async () => {
    native.camera.mockResolvedValue({ canceled: false, assets: [asset()] });
    native.request.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useChildPhotos(changed));
    await act(async () => { await result.current.takePhoto(kid); });
    expect(result.current.notice).toMatchObject({ kind: "error", target: kid });
    expect(result.current.notice?.message).toMatch(/saved photo is unchanged/);
    expect(changed).not.toHaveBeenCalled();
    native.request.mockRejectedValueOnce(new ApiError("Forbidden", 403));
    await act(async () => { await result.current.takePhoto(kid); });
    expect(result.current.notice?.message).toMatch(/can't change/);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("shows the server's own words for a rejected photo (400)", async () => {
    native.camera.mockResolvedValue({ canceled: false, assets: [asset()] });
    native.request.mockRejectedValueOnce(new ApiError("Use a JPG, PNG or WebP photo", 400));
    const { result } = renderHook(() => useChildPhotos(changed));
    await act(async () => { await result.current.takePhoto(kid); });
    expect(result.current.notice?.message).toBe("Use a JPG, PNG or WebP photo");
  });

  it("removes with DELETE, refreshes, and reports a failure without changing anything", async () => {
    const { result } = renderHook(() => useChildPhotos(changed));
    await act(async () => { await result.current.removePhoto(kid); });
    expect(native.request).toHaveBeenCalledWith("/api/sunday-school/children/kid-1/photo", { method: "DELETE" });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toEqual({ kind: "info", message: "Photo removed." });
    native.request.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { await result.current.removePhoto(kid); });
    expect(result.current.notice?.kind).toBe("error");
    expect(result.current.notice?.message).toMatch(/saved photo is unchanged/);
  });

  it("does one thing at a time", async () => {
    let release!: (value: unknown) => void;
    native.camera.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const { result } = renderHook(() => useChildPhotos(changed));
    let first!: Promise<void>;
    act(() => { first = result.current.takePhoto(kid); });
    expect(result.current.busyId).toBe("kid-1");
    await act(async () => { await result.current.choosePhoto({ id: "kid-2", name: "Other" }); });
    expect(native.library).not.toHaveBeenCalled();
    await act(async () => { release({ canceled: true, assets: [] }); await first; });
    expect(result.current.busyId).toBeNull();
  });
});
