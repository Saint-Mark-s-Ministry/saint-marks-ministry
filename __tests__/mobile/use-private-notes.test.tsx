import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  request: vi.fn(),
  auth: { user: { id: "priest-1" } as { id: string } | null, viewingAs: null as { originalId: string } | null },
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { useFocusEffect: (callback: () => void | (() => void)) => useEffect(callback, [callback]) };
});
vi.mock("../../apps/mobile/src/data/auth-provider", () => ({
  api: { request: native.request },
  useAuth: () => native.auth,
}));

type Note = { id: string; content: string; createdAt: string; author: { name: string } };
type Hook = { notes?: Note[]; loading: boolean; problem?: "denied" | "gone" | "retry"; retry: () => Promise<void> };
type Access = "all" | "own" | "none";
const { usePrivateNotes } = await vi.importActual<{
  usePrivateNotes: (o: { childId: string | undefined; access: Access; open: boolean }) => Hook;
}>("../../apps/mobile/src/data/use-private-notes");
const { clearResourceCache } = await vi.importActual<{ clearResourceCache: () => void }>("../../apps/mobile/src/data/resources");
const { ApiError } = await vi.importActual<{ ApiError: new (message: string, status: number) => Error }>(
  "../../apps/mobile/src/data/api-client",
);

const note = (id: string, content: string, author = "Fr. Priest"): Note => ({ id, content, createdAt: "2026-10-01T00:00:00Z", author: { name: author } });

beforeEach(() => {
  clearResourceCache();
  native.request.mockReset();
  native.request.mockResolvedValue({ notes: [note("n1", "Confidential one")] });
  native.auth.user = { id: "priest-1" };
  native.auth.viewingAs = null;
});
afterEach(cleanup);

describe("usePrivateNotes", () => {
  it("a priest opens the section: asks the private-note route and shows the notes", async () => {
    const { result } = renderHook(() => usePrivateNotes({ childId: "kid-1", access: "all", open: true }));
    await waitFor(() => expect(result.current.notes?.[0].content).toBe("Confidential one"));
    expect(native.request.mock.calls[0][0]).toBe("/api/sunday-school/priest-notes?childId=kid-1");
  });

  it("an ordinary author asks the same route (the server returns only their own)", async () => {
    native.auth.user = { id: "servant-1" };
    native.request.mockResolvedValue({ notes: [note("mine", "My own", "Servant One")] });
    const { result } = renderHook(() => usePrivateNotes({ childId: "kid-1", access: "own", open: true }));
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    expect(result.current.notes?.[0].author.name).toBe("Servant One");
  });

  it("never asks while closed, or when the response says no access (Super Admin, Super Admin who is also a priest)", async () => {
    const closed = renderHook(() => usePrivateNotes({ childId: "kid-1", access: "all", open: false }));
    const denied = renderHook(() => usePrivateNotes({ childId: "kid-1", access: "none", open: true }));
    expect(native.request).not.toHaveBeenCalled();
    expect(closed.result.current.notes).toBeUndefined();
    expect(denied.result.current.notes).toBeUndefined();
    expect(denied.result.current.loading).toBe(false);
  });

  it("never asks in a View as session, even if the response claimed access (priest-started previews included)", async () => {
    native.auth.viewingAs = { originalId: "priest-1" };
    const { result } = renderHook(() => usePrivateNotes({ childId: "kid-1", access: "all", open: true }));
    expect(native.request).not.toHaveBeenCalled();
    expect(result.current.notes).toBeUndefined();
  });

  it("does not show one account's notes to the next account on the device (highest-risk path)", async () => {
    const first = renderHook(() => usePrivateNotes({ childId: "kid-1", access: "all", open: true }));
    await waitFor(() => expect(first.result.current.notes).toHaveLength(1));
    first.unmount();
    native.auth.user = { id: "servant-2" };
    let release!: (value: unknown) => void;
    native.request.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const second = renderHook(() => usePrivateNotes({ childId: "kid-1", access: "own", open: true }));
    expect(second.result.current.notes).toBeUndefined();
    expect(second.result.current.loading).toBe(true);
    release({ notes: [] });
    await waitFor(() => expect(second.result.current.notes).toEqual([]));
  });

  it("forgets the content when the permission goes away mid-session, and when the section closes", async () => {
    const { result, rerender } = renderHook(({ access, open }: { access: Access; open: boolean }) => usePrivateNotes({ childId: "kid-1", access, open }), {
      initialProps: { access: "all" as Access, open: true },
    });
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    rerender({ access: "none", open: true });
    expect(result.current.notes).toBeUndefined();
    rerender({ access: "all", open: true });
    // Coming back asks again rather than reusing what was held.
    expect(result.current.notes).toBeUndefined();
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    expect(native.request).toHaveBeenCalledTimes(2);
    rerender({ access: "all", open: false });
    expect(result.current.notes).toBeUndefined();
  });

  it("asks again every time the section opens, since access can change between two openings", async () => {
    const { result, rerender } = renderHook(({ open }: { open: boolean }) => usePrivateNotes({ childId: "kid-1", access: "all", open }), { initialProps: { open: true } });
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    rerender({ open: false });
    rerender({ open: true });
    await waitFor(() => expect(native.request).toHaveBeenCalledTimes(2));
  });

  it("a refusal (403) shows no earlier content and says why; a failure shows no stale notes either", async () => {
    const { result } = renderHook(() => usePrivateNotes({ childId: "kid-1", access: "all", open: true }));
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    native.request.mockRejectedValueOnce(new ApiError("Forbidden", 403));
    await act(async () => { await result.current.retry(); });
    await waitFor(() => expect(result.current.problem).toBe("denied"));
    expect(result.current.notes).toBeUndefined();
    native.request.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { await result.current.retry(); });
    await waitFor(() => expect(result.current.problem).toBe("retry"));
    expect(result.current.notes).toBeUndefined();
  });

  it("a missing child (404) is reported and shows nothing", async () => {
    native.request.mockRejectedValue(new ApiError("Child not found", 404));
    const { result } = renderHook(() => usePrivateNotes({ childId: "kid-1", access: "all", open: true }));
    await waitFor(() => expect(result.current.problem).toBe("gone"));
    expect(result.current.notes).toBeUndefined();
  });

  it("forgets everything when the screen is left", async () => {
    const first = renderHook(() => usePrivateNotes({ childId: "kid-1", access: "all", open: true }));
    await waitFor(() => expect(first.result.current.notes).toHaveLength(1));
    first.unmount();
    native.request.mockImplementationOnce(() => new Promise(() => undefined));
    const again = renderHook(() => usePrivateNotes({ childId: "kid-1", access: "all", open: true }));
    expect(again.result.current.notes).toBeUndefined();
  });
});
