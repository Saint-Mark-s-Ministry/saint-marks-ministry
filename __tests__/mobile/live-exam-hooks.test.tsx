import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DigitalExamView, ExamAttemptView } from "@stmark/contracts";
import type { AnsweringState } from "../../apps/mobile/src/data/exam-attempt";

const native = vi.hoisted(() => ({ status: "active", listeners: new Set<(value: string) => void>(), request: vi.fn(), awake: vi.fn(), release: vi.fn(), feedback: vi.fn() }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, AppState: {
  get currentState() { return native.status; },
  addEventListener: (_kind: string, listener: (value: string) => void) => {
    native.listeners.add(listener); return { remove: () => native.listeners.delete(listener) };
  },
} }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { useFocusEffect: (callback: () => void | (() => void)) => useEffect(callback, [callback]) };
});
vi.mock("expo-modules-core", () => ({ uuid: { v4: () => "test-awake-tag" } }));
vi.mock("expo-secure-store", () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only", getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
vi.mock("expo-keep-awake", () => ({ activateKeepAwakeAsync: native.awake, deactivateKeepAwake: native.release }));
vi.mock("../../apps/mobile/src/data/auth-provider", () => ({ apiOrigin: "https://example.test" }));
vi.mock("../../apps/mobile/src/data/resources", () => ({ request: native.request }));
vi.mock("../../apps/mobile/src/data/haptics", () => ({ feedback: native.feedback }));
// Load the native module at runtime so React Native's global FormData types do
// not replace the DOM types in the separate Next.js TypeScript project.
const { useExamAwake, useLiveResource, useNativeExamAttempt } = await vi.importActual<{
  useExamAwake: (enabled: boolean) => boolean;
  useLiveResource: (path: string | null) => { data?: Record<string, unknown>; error?: string; loading: boolean; refreshing: boolean; refresh: () => Promise<void> };
  useNativeExamAttempt: (examId: string, userId: string) => AnsweringState & { start: () => Promise<void>; submit: () => Promise<void>; refresh: () => Promise<void> };
}>("../../apps/mobile/src/data/use-live-exam");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function activity(value: string) {
  act(() => { native.status = value; native.listeners.forEach(listener => listener(value)); });
}
beforeEach(() => {
  vi.useFakeTimers(); native.status = "active"; native.listeners.clear();
  native.request.mockReset(); native.awake.mockReset().mockResolvedValue(undefined); native.release.mockReset().mockResolvedValue(undefined);
  native.feedback.mockReset();
});

function examFixture() {
  let joined = false;
  let attempt: ExamAttemptView = { id: "attempt", state: "ACTIVE", answers: Array<string>(50).fill(""), revision: 0,
    startedAt: "2026-10-14T12:00:00Z", lastSeenAt: "2026-10-14T12:00:00Z", pausedAt: null, submittedAt: null, attemptNumber: 1 };
  const view = (): DigitalExamView => ({
    exam: { id: "exam", examDate: "2026-10-14T00:00:00Z", yearLevel: "YEAR_1", totalPoints: 100, examSection: { displayName: "Bible" }, academicYear: { name: "2026-27" } },
    sheet: { state: "OPEN", choiceCounts: Array<number>(50).fill(4), openedAt: "2026-10-14T00:00:00Z", closedAt: null, releasedAt: null },
    attempt: joined ? structuredClone(attempt) : null,
  });
  native.request.mockImplementation(async (_path: string, method: string, body?: Record<string, unknown>) => {
    if (method === "GET") return view();
    if (body?.action === "start") joined = true;
    if (body?.action === "submit") attempt = { ...attempt, state: "SUBMITTED", revision: 1 };
    return { attempt: structuredClone(attempt), examState: "OPEN" };
  });
  return { finalize: () => { attempt = { ...attempt, state: "SUBMITTED", revision: 1 }; } };
}

describe("intentional native exam completion feedback", () => {
  it("plays one success cue after manual submission and stays quiet during polling", async () => {
    examFixture();
    const { result } = renderHook(() => useNativeExamAttempt("exam", "student"));
    await act(async () => {});
    await act(async () => { await result.current.start(); await result.current.refresh(); });
    expect(native.feedback).not.toHaveBeenCalled();
    await act(async () => { await result.current.submit(); await result.current.refresh(); await result.current.submit(); });
    expect(result.current.attempt?.state).toBe("SUBMITTED");
    expect(native.feedback.mock.calls).toEqual([["success"]]);
  });
  it("does not buzz when polling discovers a proctor-finalized submission", async () => {
    const server = examFixture();
    const { result } = renderHook(() => useNativeExamAttempt("exam", "student"));
    await act(async () => {});
    await act(async () => { await result.current.start(); });
    server.finalize();
    await act(async () => { await result.current.refresh(); });
    expect(result.current.attempt?.state).toBe("SUBMITTED");
    expect(native.feedback).not.toHaveBeenCalled();
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("native live monitoring freshness", () => {
  it("shares an in-flight read with manual refresh instead of allowing responses to race", async () => {
    const response = deferred<{ count: number }>(); native.request.mockReturnValue(response.promise);
    const { result } = renderHook(() => useLiveResource("/api/digital-exams"));
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refresh(); });
    expect(native.request).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(true);
    await act(async () => { response.resolve({ count: 2 }); await refresh; });
    expect(result.current.data).toEqual({ count: 2 });
    expect(result.current.refreshing).toBe(false);
  });
  it("discards a late background response and fetches current status on return", async () => {
    const old = deferred<{ count: number }>(); const fresh = deferred<{ count: number }>();
    native.request.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result } = renderHook(() => useLiveResource("/api/digital-exams"));
    activity("inactive");
    expect(native.request.mock.calls[0][3].signal.aborted).toBe(true);
    await act(async () => { old.resolve({ count: 1 }); await old.promise; });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toContain("paused");
    activity("active");
    expect(result.current.loading).toBe(true);
    await act(async () => { fresh.resolve({ count: 2 }); await fresh.promise; });
    expect(result.current.data).toEqual({ count: 2 });
  });
  it("removes live data and write controls after an unsuccessful refresh", async () => {
    native.request.mockResolvedValueOnce({ canManage: true }).mockRejectedValueOnce(new Error("Forbidden"));
    const { result } = renderHook(() => useLiveResource("/api/digital-exams/test"));
    await act(async () => {});
    expect(result.current.data?.canManage).toBe(true);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBe("Forbidden");
  });
});

describe("native exam keep-awake lifetime", () => {
  it("holds the screen awake only while the exam needs it", async () => {
    const { result, rerender, unmount } = renderHook(({ enabled }) => useExamAwake(enabled), { initialProps: { enabled: true } });
    await act(async () => {});
    expect(result.current).toBe(true);
    rerender({ enabled: false });
    expect(result.current).toBe(false);
    expect(native.release).toHaveBeenCalledWith("live-exam-test-awake-tag");
    rerender({ enabled: true }); await act(async () => {}); unmount();
    expect(native.release).toHaveBeenCalledTimes(2);
  });
  it("releases an activation that completes after the student leaves", async () => {
    const activation = deferred<void>(); native.awake.mockReturnValueOnce(activation.promise);
    const { result, rerender } = renderHook(({ enabled }) => useExamAwake(enabled), { initialProps: { enabled: true } });
    rerender({ enabled: false });
    await act(async () => { activation.resolve(); await activation.promise; });
    expect(result.current).toBe(false);
    expect(native.release).toHaveBeenCalledWith("live-exam-test-awake-tag");
  });
});
