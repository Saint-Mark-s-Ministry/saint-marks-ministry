import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
vi.mock("../../apps/mobile/src/data/auth-provider", () => ({
  api: { request: native.request },
  useAuth: () => ({ user: { id: "servant-1" }, viewingAs: null }),
}));

type Hook = {
  overrides: Record<string, boolean>;
  saving: Record<string, true>;
  notice: { kind: "error" | "info"; message: string } | null;
  dismiss: () => void;
  toggle: (childId: string, next: boolean) => Promise<void>;
};
const { useVisitationPriority } = await vi.importActual<{
  useVisitationPriority: (refresh: () => Promise<unknown>) => Hook;
}>("../../apps/mobile/src/data/use-visitation-priority");
const { ApiError } = await vi.importActual<{ ApiError: new (message: string, status: number) => Error }>(
  "../../apps/mobile/src/data/api-client",
);

let refresh: () => Promise<unknown>;
beforeEach(() => {
  native.request.mockReset();
  native.request.mockResolvedValue({ id: "kid", visitationPriority: true });
  refresh = vi.fn(async () => undefined);
});
afterEach(cleanup);

describe("useVisitationPriority", () => {
  it("shows the tap at once, saves with PATCH, refreshes, then lets go of the local choice", async () => {
    let release!: (value: unknown) => void;
    native.request.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const { result } = renderHook(() => useVisitationPriority(refresh));
    let done!: Promise<void>;
    act(() => { done = result.current.toggle("kid", true); });
    expect(result.current.overrides).toEqual({ kid: true });
    expect(result.current.saving).toEqual({ kid: true });
    expect(native.request).toHaveBeenCalledTimes(1);
    const [path, init] = native.request.mock.calls[0];
    expect(path).toBe("/api/sunday-school/visitations");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ childId: "kid", priority: true });
    await act(async () => { release({ id: "kid", visitationPriority: true }); await done; });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.overrides).toEqual({});
    expect(result.current.saving).toEqual({});
    expect(result.current.notice).toEqual({ kind: "info", message: "Added to priority visits." });
  });

  it("rolls the star back when the save fails on the connection, without refreshing", async () => {
    native.request.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useVisitationPriority(refresh));
    await act(async () => { await result.current.toggle("kid", true); });
    expect(result.current.overrides).toEqual({});
    expect(result.current.notice?.kind).toBe("error");
    expect(result.current.notice?.message).toMatch(/couldn't save/i);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a refused write (403) rolls back, refreshes, and explains", async () => {
    native.request.mockRejectedValueOnce(new ApiError("Forbidden", 403));
    const { result } = renderHook(() => useVisitationPriority(refresh));
    await act(async () => { await result.current.toggle("kid", false); });
    expect(result.current.overrides).toEqual({});
    expect(result.current.notice?.message).toMatch(/can't change priority/i);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a concurrent class transfer (409) rolls back, refreshes, and explains the roster change", async () => {
    native.request.mockRejectedValueOnce(new ApiError("The roster changed. Refresh and try again.", 409));
    const { result } = renderHook(() => useVisitationPriority(refresh));
    await act(async () => { await result.current.toggle("kid", true); });
    expect(result.current.overrides).toEqual({});
    expect(result.current.notice?.message).toMatch(/roster changed/i);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores a second tap on the same child while the first is saving", async () => {
    let release!: (value: unknown) => void;
    native.request.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const { result } = renderHook(() => useVisitationPriority(refresh));
    let first!: Promise<void>;
    act(() => { first = result.current.toggle("kid", true); });
    await act(async () => { await result.current.toggle("kid", false); });
    expect(native.request).toHaveBeenCalledTimes(1);
    expect(result.current.overrides).toEqual({ kid: true });
    await act(async () => { release({}); await first; });
  });

  it("different children save independently, and a notice can be dismissed", async () => {
    const { result } = renderHook(() => useVisitationPriority(refresh));
    await act(async () => { await Promise.all([result.current.toggle("a", true), result.current.toggle("b", true)]); });
    expect(native.request).toHaveBeenCalledTimes(2);
    expect(result.current.notice).not.toBeNull();
    act(() => result.current.dismiss());
    await waitFor(() => expect(result.current.notice).toBeNull());
  });
});
