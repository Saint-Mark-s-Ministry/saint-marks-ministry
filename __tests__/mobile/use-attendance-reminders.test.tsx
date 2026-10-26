import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  listeners: new Set<(value: string) => void>(),
  request: vi.fn(),
  auth: {
    user: { id: "servant-1", role: "SERVANT", sundaySchool: { hasAccess: true, isCoordinator: false } } as unknown as
      | { id: string; role: string; sundaySchool: { hasAccess: boolean } }
      | null,
    viewingAs: null as { originalId: string } | null,
  },
}));
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_kind: string, listener: (value: string) => void) => {
      native.listeners.add(listener);
      return { remove: () => native.listeners.delete(listener) };
    },
  },
}));
vi.mock("../../apps/mobile/src/data/resources", () => ({ request: native.request }));
vi.mock("../../apps/mobile/src/data/auth-provider", () => ({ useAuth: () => native.auth }));

type Reminder = { classId: string; className: string; sessionDate: string; url: string };
type Hook = { reminders: Reminder[]; loading: boolean; checkFailed: boolean; retry: () => Promise<void> };
const { useAttendanceReminders } = await vi.importActual<{ useAttendanceReminders: () => Hook }>(
  "../../apps/mobile/src/data/use-attendance-reminders",
);
const { requestAttendanceReminderRefresh } = await vi.importActual<{ requestAttendanceReminderRefresh: () => void }>(
  "../../apps/mobile/src/data/attendance-reminders",
);
const { ApiError } = await vi.importActual<{ ApiError: new (message: string, status: number) => Error }>(
  "../../apps/mobile/src/data/api-client",
);

const reminder = (classId: string, sessionDate = "2026-10-24"): Reminder => ({ classId, className: `Class ${classId}`, sessionDate, url: "/x" });

beforeEach(() => {
  native.listeners.clear();
  native.request.mockReset();
  native.request.mockResolvedValue({ reminders: [reminder("c1"), reminder("c2")] });
  native.auth.user = { id: "servant-1", role: "SERVANT", sundaySchool: { hasAccess: true } };
  native.auth.viewingAs = null;
});
afterEach(cleanup);

describe("useAttendanceReminders", () => {
  it("loads the server's reminders, one per returned class", async () => {
    const { result } = renderHook(() => useAttendanceReminders());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.reminders.map((r) => r.classId)).toEqual(["c1", "c2"]));
    expect(native.request).toHaveBeenCalledWith("/api/sunday-school/attendance/reminders");
    expect(result.current.loading).toBe(false);
  });

  it("asks again when the app comes to the foreground, and an answer can clear a class", async () => {
    const { result } = renderHook(() => useAttendanceReminders());
    await waitFor(() => expect(result.current.reminders).toHaveLength(2));
    native.request.mockResolvedValue({ reminders: [reminder("c2")] });
    await act(async () => { native.listeners.forEach((listener) => listener("active")); });
    await waitFor(() => expect(result.current.reminders.map((r) => r.classId)).toEqual(["c2"]));
    // Backgrounding alone asks nothing.
    native.request.mockClear();
    await act(async () => { native.listeners.forEach((listener) => listener("background")); });
    expect(native.request).not.toHaveBeenCalled();
  });

  it("asks again after a confirmed attendance save", async () => {
    const { result } = renderHook(() => useAttendanceReminders());
    await waitFor(() => expect(result.current.reminders).toHaveLength(2));
    native.request.mockResolvedValue({ reminders: [] });
    await act(async () => { requestAttendanceReminderRefresh(); });
    await waitFor(() => expect(result.current.reminders).toEqual([]));
  });

  it("a partial save or a draft changes nothing: only the server's answer clears a reminder", async () => {
    const { result } = renderHook(() => useAttendanceReminders());
    await waitFor(() => expect(result.current.reminders).toHaveLength(2));
    // The server still lists the class after a partial save.
    await act(async () => { requestAttendanceReminderRefresh(); });
    await waitFor(() => expect(native.request).toHaveBeenCalledTimes(2));
    expect(result.current.reminders.map((r) => r.classId)).toEqual(["c1", "c2"]);
  });

  it("a revoked assignment (403) clears the reminders", async () => {
    const { result } = renderHook(() => useAttendanceReminders());
    await waitFor(() => expect(result.current.reminders).toHaveLength(2));
    native.request.mockRejectedValue(new ApiError("Forbidden", 403));
    await act(async () => { await result.current.retry(); });
    await waitFor(() => expect(result.current.reminders).toEqual([]));
    expect(result.current.checkFailed).toBe(false);
  });

  it("a bad signal keeps the last reminders instead of dropping them", async () => {
    const { result } = renderHook(() => useAttendanceReminders());
    await waitFor(() => expect(result.current.reminders).toHaveLength(2));
    native.request.mockRejectedValue(new Error("offline"));
    await act(async () => { await result.current.retry(); });
    expect(result.current.reminders).toHaveLength(2);
    expect(result.current.checkFailed).toBe(false);
  });

  it("reports a failed first check, and recovers on retry", async () => {
    native.request.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useAttendanceReminders());
    await waitFor(() => expect(result.current.checkFailed).toBe(true));
    await act(async () => { await result.current.retry(); });
    await waitFor(() => expect(result.current.reminders).toHaveLength(2));
    expect(result.current.checkFailed).toBe(false);
  });

  it("never shows one account's reminders to another (highest-risk path)", async () => {
    const first = renderHook(() => useAttendanceReminders());
    await waitFor(() => expect(first.result.current.reminders).toHaveLength(2));
    first.unmount();
    native.auth.user = { id: "servant-2", role: "SERVANT", sundaySchool: { hasAccess: true } };
    let release!: (value: unknown) => void;
    native.request.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const second = renderHook(() => useAttendanceReminders());
    expect(second.result.current.reminders).toEqual([]);
    await act(async () => { release({ reminders: [reminder("c9")] }); });
    await waitFor(() => expect(second.result.current.reminders.map((r) => r.classId)).toEqual(["c9"]));
  });

  it("asks nothing of a parent or an account without Sunday School access", async () => {
    native.auth.user = { id: "p1", role: "PARENT", sundaySchool: { hasAccess: true } };
    renderHook(() => useAttendanceReminders());
    native.auth.user = { id: "s2", role: "SERVANT", sundaySchool: { hasAccess: false } };
    renderHook(() => useAttendanceReminders());
    native.auth.user = null;
    const none = renderHook(() => useAttendanceReminders());
    expect(native.request).not.toHaveBeenCalled();
    expect(none.result.current.reminders).toEqual([]);
    expect(none.result.current.loading).toBe(false);
  });
});
