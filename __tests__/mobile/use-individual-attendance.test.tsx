import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndividualAttendanceResponse } from "@stmark/contracts";

const native = vi.hoisted(() => ({
  request: vi.fn(),
  auth: { user: { id: "servant-1" } as { id: string } | null, viewingAs: null as { originalId: string } | null },
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { useFocusEffect: (callback: () => void | (() => void)) => useEffect(callback, [callback]) };
});
vi.mock("../../apps/mobile/src/data/auth-provider", () => ({
  api: { request: native.request },
  useAuth: () => native.auth,
}));

type Result = {
  history?: IndividualAttendanceResponse;
  problem?: "denied" | "gone" | "retry";
  loading: boolean;
  stale: boolean;
  retry: () => Promise<void>;
};
const { useIndividualAttendance } = await vi.importActual<{ useIndividualAttendance: (classId: string | null) => Result }>(
  "../../apps/mobile/src/data/use-individual-attendance",
);
const { clearResourceCache, invalidateResourceCache } = await vi.importActual<{
  clearResourceCache: () => void;
  invalidateResourceCache: () => void;
}>("../../apps/mobile/src/data/resources");
const { ApiError } = await vi.importActual<{ ApiError: new (message: string, status: number) => Error }>(
  "../../apps/mobile/src/data/api-client",
);

const payload = (classId: string, marker = ""): IndividualAttendanceResponse => ({
  classroom: { id: classId, name: `Class ${classId}${marker}` },
  dates: ["2026-10-04"],
  children: [],
});

beforeEach(() => {
  clearResourceCache();
  native.request.mockReset();
  native.auth.user = { id: "servant-1" };
  native.auth.viewingAs = null;
  native.request.mockImplementation(async (path: string) => payload(new URL(`http://x${path}`).searchParams.get("classId")!));
});
afterEach(cleanup);

describe("useIndividualAttendance", () => {
  it("loads one class by ID and shows it only for that class", async () => {
    const { result } = renderHook(() => useIndividualAttendance("c1"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.history?.classroom.id).toBe("c1"));
    expect(native.request.mock.calls[0][0]).toBe("/api/sunday-school/attendance/history?classId=c1");
  });

  it("switching class asks for the new class and never shows the old one's answer", async () => {
    const { result, rerender } = renderHook(({ id }) => useIndividualAttendance(id), { initialProps: { id: "c1" } });
    await waitFor(() => expect(result.current.history?.classroom.id).toBe("c1"));
    rerender({ id: "c2" });
    expect(result.current.history?.classroom.id).not.toBe("c1");
    await waitFor(() => expect(result.current.history?.classroom.id).toBe("c2"));
  });

  it("never shows one account's cached answer to another (highest-risk path)", async () => {
    const first = renderHook(() => useIndividualAttendance("c1"));
    await waitFor(() => expect(first.result.current.history).toBeDefined());
    first.unmount();
    native.auth.user = { id: "servant-2" };
    let release!: (value: IndividualAttendanceResponse) => void;
    native.request.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const second = renderHook(() => useIndividualAttendance("c1"));
    expect(second.result.current.history).toBeUndefined();
    expect(second.result.current.loading).toBe(true);
    release(payload("c1", " (second)"));
    await waitFor(() => expect(second.result.current.history?.classroom.name).toBe("Class c1 (second)"));
  });

  it("a View as session has its own cache", async () => {
    const first = renderHook(() => useIndividualAttendance("c1"));
    await waitFor(() => expect(first.result.current.history).toBeDefined());
    first.unmount();
    native.auth.viewingAs = { originalId: "admin" };
    native.request.mockImplementationOnce(() => new Promise(() => undefined));
    const viewed = renderHook(() => useIndividualAttendance("c1"));
    expect(viewed.result.current.history).toBeUndefined();
  });

  it("a refusal clears the cached answer instead of keeping it on screen", async () => {
    const { result } = renderHook(() => useIndividualAttendance("c1"));
    await waitFor(() => expect(result.current.history).toBeDefined());
    native.request.mockRejectedValueOnce(new ApiError("Forbidden", 403));
    await result.current.retry();
    await waitFor(() => expect(result.current.problem).toBe("denied"));
    expect(result.current.history).toBeUndefined();
  });

  it("an inactive class is reported as gone", async () => {
    native.request.mockRejectedValue(new ApiError("Class not found", 404));
    const { result } = renderHook(() => useIndividualAttendance("c1"));
    await waitFor(() => expect(result.current.problem).toBe("gone"));
  });

  it("a connection failure is retryable, and retry recovers", async () => {
    native.request.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useIndividualAttendance("c1"));
    await waitFor(() => expect(result.current.problem).toBe("retry"));
    await result.current.retry();
    await waitFor(() => expect(result.current.history?.classroom.id).toBe("c1"));
    expect(result.current.problem).toBeUndefined();
  });

  it("keeps the last good history, marked stale, when a refresh fails on the connection", async () => {
    const { result } = renderHook(() => useIndividualAttendance("c1"));
    await waitFor(() => expect(result.current.history).toBeDefined());
    native.request.mockRejectedValueOnce(new Error("offline"));
    await result.current.retry();
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.history?.classroom.id).toBe("c1");
  });

  it("reloads after a confirmed attendance save (any write marks cached reads stale)", async () => {
    const { result } = renderHook(() => useIndividualAttendance("c1"));
    await waitFor(() => expect(result.current.history?.classroom.name).toBe("Class c1"));
    native.request.mockImplementation(async () => payload("c1", " (after save)"));
    invalidateResourceCache();
    const again = renderHook(() => useIndividualAttendance("c1"));
    await waitFor(() => expect(again.result.current.history?.classroom.name).toBe("Class c1 (after save)"));
  });

  it("does nothing without a class", () => {
    const { result } = renderHook(() => useIndividualAttendance(null));
    expect(result.current.history).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(native.request).not.toHaveBeenCalled();
  });
});
