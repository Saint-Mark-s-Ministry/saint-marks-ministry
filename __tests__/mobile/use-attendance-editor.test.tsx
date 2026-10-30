import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  appState: new Set<(value: string) => void>(),
  request: vi.fn(),
  refresh: vi.fn(),
  secure: new Map<string, string>(),
}));
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_kind: string, listener: (value: string) => void) => {
      native.appState.add(listener);
      return { remove: () => native.appState.delete(listener) };
    },
  },
}));
vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afterFirstUnlockThisDeviceOnly",
  getItemAsync: async (key: string) => native.secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void native.secure.set(key, value),
  deleteItemAsync: async (key: string) => void native.secure.delete(key),
}));
vi.mock("../../apps/mobile/src/data/resources", () => ({ request: native.request }));
vi.mock("../../apps/mobile/src/data/attendance-reminders", () => ({ requestAttendanceReminderRefresh: native.refresh }));

type Hook = {
  state: { phase: string; marks: Record<string, string>; pending: Record<string, string>; saving: boolean; saveError: string | null; recovered: boolean };
  summary: { saveState: string; markedCount: number };
  mark: (childId: string, status: "PRESENT" | "LATE" | "ABSENT") => void;
};
const { useAttendanceEditor } = await vi.importActual<{
  useAttendanceEditor: (input: { userId: string | null; classId: string; date: string; canEdit: boolean }) => Hook;
}>("../../apps/mobile/src/data/use-attendance-editor");

const roster = (names: string[]) => names.map((id) => ({ id, firstName: id, lastName: "Kid", level: "GRADE_5", gender: null, user: null }));
let answers: Record<string, string[]>;
let currentDate = "2026-10-11";
let batch: (body: unknown, signal?: AbortSignal) => Promise<unknown>;

beforeEach(() => {
  native.secure.clear();
  native.appState.clear();
  native.request.mockReset();
  native.refresh.mockReset();
  answers = { "2026-10-11": ["a", "b"], "2026-10-18": ["c", "d"] };
  batch = async () => ({ success: true, lastSavedBy: { savedAt: "2026-10-11T15:00:00.000Z", recorder: { id: "user1", name: "Mina Mark" } } });
  native.request.mockImplementation(async (path: string, method = "GET", body?: unknown, options?: { signal?: AbortSignal }) => {
    if (path.startsWith("/api/sunday-school/sessions?")) {
      currentDate = new URL(`https://x${path}`).searchParams.get("from")!;
      return [];
    }
    if (path.startsWith("/api/sunday-school/children?")) return roster(answers[currentDate] ?? answers["2026-10-11"]);
    if (path === "/api/sunday-school/sessions") return { id: "session1" };
    if (path === "/api/sunday-school/attendance/batch") return batch(body, options?.signal);
    throw new Error(`unexpected ${method} ${path}`);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const props = { userId: "user1", classId: "class1", date: "2026-10-11", canEdit: true };

describe("useAttendanceEditor", () => {
  it("loads the roster, keeps a tap on the device at once, saves it, and refreshes reminders", async () => {
    const { result } = renderHook((p) => useAttendanceEditor(p), { initialProps: props });
    expect(result.current.state.phase).toBe("loading");
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    act(() => result.current.mark("a", "PRESENT"));
    await waitFor(() => expect([...native.secure.keys()]).toEqual(["stmark.attendance-draft.v1.user1.class1.2026-10-11"]));
    expect(result.current.summary.saveState).toBe("local");
    await waitFor(() => expect(result.current.summary.saveState).toBe("saved"), { timeout: 3000 });
    expect(native.refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(native.secure.size).toBe(0)); // acknowledged: nothing left to keep
  });

  it("a different account gets a fresh editor, the old save is aborted, and its late answer never reaches the screen", async () => {
    let release!: () => void;
    let signal: AbortSignal | undefined;
    batch = (_body, s) => {
      signal = s;
      return new Promise((resolve) => (release = () => resolve({ success: true })));
    };
    const { result, rerender } = renderHook((p) => useAttendanceEditor(p), { initialProps: props });
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    act(() => result.current.mark("a", "PRESENT"));
    await waitFor(() => expect(result.current.state.saving).toBe(true), { timeout: 3000 });
    rerender({ ...props, userId: "user2" });
    expect(signal?.aborted).toBe(true);
    // For the render after the change the old editor's marks are not shown.
    expect(result.current.state.marks).toEqual({});
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    expect(result.current.state.marks).toEqual({});
    expect(result.current.state.pending).toEqual({});
    release();
    await act(async () => undefined);
    expect(result.current.state.marks).toEqual({});
    // The first account's mark stays on the device under that account only.
    expect([...native.secure.keys()]).toEqual(["stmark.attendance-draft.v1.user1.class1.2026-10-11"]);
    expect(result.current.state.recovered).toBe(false);
  });

  it("changing the week shows that week's roster, unmarked", async () => {
    const { result, rerender } = renderHook((p) => useAttendanceEditor(p), { initialProps: props });
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    act(() => result.current.mark("a", "LATE"));
    rerender({ ...props, date: "2026-10-18" });
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    expect(result.current.state.marks).toEqual({});
  });

  it("a preview of another person (canEdit false) never reads, writes or sends", async () => {
    native.secure.set("stmark.attendance-draft.v1.user1.class1.2026-10-11", JSON.stringify({ v: 1, marks: { a: "PRESENT" }, notes: {} }));
    const before = new Map(native.secure);
    const { result } = renderHook((p) => useAttendanceEditor(p), { initialProps: { ...props, canEdit: false } });
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    act(() => result.current.mark("a", "PRESENT"));
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(native.request.mock.calls.every(([, method]) => (method ?? "GET") === "GET")).toBe(true);
    expect(native.secure).toEqual(before);
    expect(result.current.summary.saveState).toBe("readonly");
    expect(result.current.state.recovered).toBe(false);
  });

  it("coming back to the app sends right away after a failed save", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let attempts = 0;
    batch = async () => {
      if (++attempts === 1) throw new Error("Could not reach the server. Check your connection and try again.");
      return { success: true };
    };
    const { result } = renderHook((p) => useAttendanceEditor(p), { initialProps: props });
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    act(() => result.current.mark("a", "PRESENT"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(700)));
    await waitFor(() => expect(result.current.summary.saveState).toBe("failed"));
    expect(attempts).toBe(1);
    act(() => native.appState.forEach((listener) => listener("active")));
    await waitFor(() => expect(attempts).toBe(2));
    await waitFor(() => expect(result.current.summary.saveState).toBe("saved"));
  });

  it("a recovered draft shows only after the roster loads, and is held for Resume", async () => {
    native.secure.set("stmark.attendance-draft.v1.user1.class1.2026-10-11", JSON.stringify({ v: 1, marks: { a: "ABSENT", gone: "PRESENT" }, notes: {} }));
    const { result } = renderHook((p) => useAttendanceEditor(p), { initialProps: props });
    expect(result.current.state.marks).toEqual({});
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    expect(result.current.state.recovered).toBe(true);
    expect(result.current.state.marks).toEqual({ a: "ABSENT" });
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(native.request.mock.calls.filter(([path]) => path === "/api/sunday-school/attendance/batch")).toHaveLength(0);
  });
});
