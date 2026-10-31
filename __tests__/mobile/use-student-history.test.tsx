import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudentHistory } from "@stmark/contracts";

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

// Loaded at runtime, with their shapes written out here, so React Native's
// global types do not replace the DOM types in the separate Next.js project.
type Target = { id: string; name: string; program: "sunday-school" };
type Result = {
  history?: StudentHistory;
  problem?: "denied" | "gone" | "retry";
  loading: boolean;
  stale: boolean;
  retry: () => Promise<void>;
};
const { useStudentHistory } = await vi.importActual<{ useStudentHistory: (target: Target | null) => Result }>(
  "../../apps/mobile/src/data/use-student-history",
);
const { clearResourceCache } = await vi.importActual<{ clearResourceCache: () => void }>(
  "../../apps/mobile/src/data/resources",
);
const { ApiError } = await vi.importActual<{ ApiError: new (message: string, status: number) => Error }>(
  "../../apps/mobile/src/data/api-client",
);

const mina1: Target = { id: "child-1", name: "Mina Mark", program: "sunday-school" };
const mina2: Target = { id: "child-2", name: "Mina Mark", program: "sunday-school" };

function history(id: string, note: string): StudentHistory {
  return {
    id, name: "Mina Mark", program: "sunday-school", subtitle: "Sunday School · Grade 3",
    profile: {
      className: "Grade 3", level: "GRADE_3", birthDate: null, gender: null, isActive: true, fatherOfConfession: null,
      phone: null, email: null, guardian: { name: null, phone: null, email: null }, family: null,
    },
    attendance: { kind: "meetings", counts: { present: 1, late: 0, absent: 0, excused: 0 }, rate: 100, records: [] },
    notes: { general: note, entries: [] }, visitations: [], phoneCalls: [],
  };
}

beforeEach(() => {
  clearResourceCache();
  native.request.mockReset();
  native.auth.user = { id: "servant-1" };
  native.auth.viewingAs = null;
  native.request.mockImplementation(async (path: string) => {
    const id = decodeURIComponent(path.split("/")[4]);
    return history(id, `note for ${id}`);
  });
});
afterEach(cleanup);

describe("useStudentHistory", () => {
  it("loads the history by ID and shows it only for that record", async () => {
    const { result } = renderHook(() => useStudentHistory(mina1));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.history?.id).toBe("child-1"));
    expect(native.request.mock.calls[0][0]).toBe("/api/sunday-school/children/child-1/history");
    expect(result.current.problem).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it("keeps two children who share a name apart (highest-risk path)", async () => {
    const first = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(first.result.current.history?.notes.general).toBe("note for child-1"));
    const second = renderHook(() => useStudentHistory(mina2));
    await waitFor(() => expect(second.result.current.history?.notes.general).toBe("note for child-2"));
    expect(first.result.current.history?.id).toBe("child-1");
    const paths = native.request.mock.calls.map(([path]) => path);
    expect(paths).toContain("/api/sunday-school/children/child-1/history");
    expect(paths).toContain("/api/sunday-school/children/child-2/history");
  });

  it("never shows one account's cached answer to another (highest-risk path)", async () => {
    const first = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(first.result.current.history).toBeDefined());
    first.unmount();

    native.auth.user = { id: "servant-2" };
    let release!: (value: StudentHistory) => void;
    native.request.mockImplementationOnce(() => new Promise<StudentHistory>((resolve) => { release = resolve; }));
    const second = renderHook(() => useStudentHistory(mina1));
    // The other servant's answer is not served while this one is being asked for.
    expect(second.result.current.history).toBeUndefined();
    expect(second.result.current.loading).toBe(true);
    await act(async () => release(history("child-1", "for servant-2")));
    await waitFor(() => expect(second.result.current.history?.notes.general).toBe("for servant-2"));
  });

  it("keeps a View as session apart from the administrator's own", async () => {
    native.auth.user = { id: "servant-1" };
    const own = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(own.result.current.history).toBeDefined());
    own.unmount();
    native.auth.viewingAs = { originalId: "admin-1" };
    native.request.mockImplementationOnce(() => new Promise(() => undefined));
    const viewing = renderHook(() => useStudentHistory(mina1));
    expect(viewing.result.current.history).toBeUndefined();
  });

  it("revalidates access each time it opens, and a refusal clears what was cached (highest-risk path)", async () => {
    const first = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(first.result.current.history).toBeDefined());
    first.unmount();

    native.request.mockRejectedValueOnce(new ApiError("Forbidden", 403));
    const reopened = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(reopened.result.current.problem).toBe("denied"));
    expect(reopened.result.current.history).toBeUndefined();
    reopened.unmount();

    // Reopening again does not bring the old content back from the cache.
    native.request.mockRejectedValueOnce(new ApiError("Forbidden", 403));
    const third = renderHook(() => useStudentHistory(mina1));
    expect(third.result.current.history).toBeUndefined();
    await waitFor(() => expect(third.result.current.problem).toBe("denied"));
  });

  it("clears the cache for a record that is gone (404)", async () => {
    const first = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(first.result.current.history).toBeDefined());
    first.unmount();
    native.request.mockRejectedValueOnce(new ApiError("Not found", 404));
    const reopened = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(reopened.result.current.problem).toBe("gone"));
    expect(reopened.result.current.history).toBeUndefined();
  });

  it("shows a retry state for a server error, and recovers on retry", async () => {
    native.request.mockRejectedValueOnce(new ApiError("Server error", 500));
    const { result } = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(result.current.problem).toBe("retry"));
    expect(result.current.history).toBeUndefined();
    await act(async () => {
      await result.current.retry();
    });
    await waitFor(() => expect(result.current.history?.id).toBe("child-1"));
    expect(result.current.problem).toBeUndefined();
  });

  it("keeps the last good answer, marked stale, when the connection drops", async () => {
    const first = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(first.result.current.history).toBeDefined());
    first.unmount();
    native.request.mockRejectedValueOnce(new Error("Network request failed"));
    const reopened = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(reopened.result.current.stale).toBe(true));
    expect(reopened.result.current.history?.id).toBe("child-1");
  });

  it("does not show an answer for a different record or program", async () => {
    native.request.mockResolvedValueOnce(history("child-9", "someone else"));
    const wrongId = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(wrongId.result.current.problem).toBe("retry"));
    expect(wrongId.result.current.history).toBeUndefined();
    wrongId.unmount();

    clearResourceCache();
    native.request.mockResolvedValueOnce({ ...history("child-1", "x"), program: "servants-prep" });
    const wrongProgram = renderHook(() => useStudentHistory(mina1));
    await waitFor(() => expect(wrongProgram.result.current.problem).toBe("retry"));
    expect(wrongProgram.result.current.history).toBeUndefined();
  });

  it("asks for nothing without a target or a signed-in viewer", () => {
    const none = renderHook(() => useStudentHistory(null));
    expect(none.result.current.history).toBeUndefined();
    expect(native.request).not.toHaveBeenCalled();
    native.auth.user = null;
    renderHook(() => useStudentHistory(mina1));
    expect(native.request).not.toHaveBeenCalled();
  });
});
