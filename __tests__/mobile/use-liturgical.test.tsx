import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  listeners: new Set<(value: string) => void>(),
  request: vi.fn(),
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

// Loaded at runtime, with its shape written out here, so React Native's global
// types do not replace the DOM types in the separate Next.js TypeScript project.
type Days = Record<string, { date: string; fast: { name: string } | null }>;
const { clearLiturgicalCalendarCache, loadCalendar, useChurchToday, useLiturgicalCalendar } = await vi.importActual<{
  clearLiturgicalCalendarCache: () => void;
  loadCalendar: (dates: readonly string[], force?: boolean) => Promise<{ days: Days; failed: boolean }>;
  useChurchToday: () => string;
  useLiturgicalCalendar: (dates: readonly string[]) => {
    days: Days;
    loading: boolean;
    failed: boolean;
    refresh: () => Promise<void>;
  };
}>("../../apps/mobile/src/data/use-liturgical");

const days = (count: number) =>
  Array.from({ length: count }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

/** What the server answers for a requested chunk: one entry per date, each flagged so merges are checkable. */
function answer(path: string) {
  const dates = new URL(`https://x${path}`).searchParams.get("dates")!.split(",");
  return {
    days: Object.fromEntries(
      dates.map((date) => [date, { date, copticDate: null, fast: { name: `Fast ${date}`, type: null }, feasts: [] }]),
    ),
  };
}

beforeEach(() => {
  clearLiturgicalCalendarCache();
  native.request.mockReset();
  native.request.mockImplementation(async (path: string) => answer(path));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("loading the church calendar for many dates", () => {
  it("never sends more than 60 dates in a request, and merges every answer (highest-risk path)", async () => {
    const result = await loadCalendar(days(125));
    expect(native.request).toHaveBeenCalledTimes(3);
    const sizes = native.request.mock.calls.map(([path]) => (path as string).split("dates=")[1].split(",").length);
    expect(sizes.sort((a, b) => b - a)).toEqual([60, 60, 5]);
    expect(Object.keys(result.days)).toHaveLength(125);
    expect(result.failed).toBe(false);
  });

  it("keeps the chunks that worked when one fails, and says so", async () => {
    native.request.mockImplementation(async (path: string) => {
      if ((path as string).includes("2026-03-02")) throw new Error("Coptic IO is down");
      return answer(path);
    });
    const result = await loadCalendar(days(125));
    expect(result.failed).toBe(true);
    expect(result.days["2026-01-01"]).toBeDefined();
    expect(result.days["2026-03-02"]).toBeUndefined();
  });

  it("never throws when the service is unavailable or answers with nonsense", async () => {
    native.request.mockRejectedValue(new Error("offline"));
    await expect(loadCalendar(days(3))).resolves.toEqual({ days: {}, failed: true });
    clearLiturgicalCalendarCache();
    native.request.mockResolvedValue("<html>maintenance</html>");
    await expect(loadCalendar(days(3))).resolves.toEqual({ days: {}, failed: false });
  });

  it("asks once for a range it already has, and again only when told to", async () => {
    await loadCalendar(days(10));
    await loadCalendar(days(10));
    expect(native.request).toHaveBeenCalledTimes(1);
    await loadCalendar(days(10), true);
    expect(native.request).toHaveBeenCalledTimes(2);
  });

  it("falls back to the last good answer when a refresh fails", async () => {
    await loadCalendar(days(5));
    native.request.mockRejectedValue(new Error("offline"));
    const result = await loadCalendar(days(5), true);
    expect(result.failed).toBe(false);
    expect(Object.keys(result.days)).toHaveLength(5);
  });

  it("shares one request between two screens asking at the same moment", async () => {
    await Promise.all([loadCalendar(days(7)), loadCalendar(days(7))]);
    expect(native.request).toHaveBeenCalledTimes(1);
  });

  it("asks for nothing when there are no dates", async () => {
    await expect(loadCalendar([])).resolves.toEqual({ days: {}, failed: false });
    expect(native.request).not.toHaveBeenCalled();
  });
});

describe("useLiturgicalCalendar", () => {
  it("fills in feasts and fasts without ever blocking the screen", async () => {
    const { result } = renderHook(() => useLiturgicalCalendar(["2026-10-17", "2026-10-18"]));
    expect(result.current.days).toEqual({});
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.days["2026-10-18"]?.fast?.name).toBe("Fast 2026-10-18");
    expect(result.current.failed).toBe(false);
  });

  it("stays empty and flags the failure when Coptic IO is down", async () => {
    native.request.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useLiturgicalCalendar(["2026-10-17"]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.days).toEqual({});
    expect(result.current.failed).toBe(true);
  });

  it("does nothing for no dates", async () => {
    const { result } = renderHook(() => useLiturgicalCalendar([]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(native.request).not.toHaveBeenCalled();
  });

  it("can be retried after a failure", async () => {
    native.request.mockRejectedValueOnce(new Error("down"));
    const { result } = renderHook(() => useLiturgicalCalendar(["2026-10-17"]));
    await waitFor(() => expect(result.current.failed).toBe(true));
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => expect(result.current.failed).toBe(false));
    expect(result.current.days["2026-10-17"]).toBeDefined();
  });
});

describe("useChurchToday", () => {
  it("moves on to the new day at church midnight, by itself (highest-risk path)", () => {
    vi.useFakeTimers();
    // 23:59:30 at the church on 2026-10-17 (EDT).
    vi.setSystemTime(new Date("2026-10-18T03:59:30Z"));
    const { result } = renderHook(() => useChurchToday());
    expect(result.current).toBe("2026-10-17");
    act(() => {
      vi.advanceTimersByTime(29_000); // 23:59:59, still the 17th
    });
    expect(result.current).toBe("2026-10-17");
    act(() => {
      vi.advanceTimersByTime(2_000); // 00:00:01, the 18th: no waiting out a minute-long floor
    });
    expect(result.current).toBe("2026-10-18");
  });

  it("is not an hour late on the 23-hour spring-forward day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T05:00:00Z")); // 00:00 EST on the day the clocks go forward
    const { result } = renderHook(() => useChurchToday());
    expect(result.current).toBe("2026-03-08");
    act(() => {
      vi.advanceTimersByTime(23 * 3600_000 - 5_000); // 23:59:55 EDT
    });
    expect(result.current).toBe("2026-03-08");
    act(() => {
      vi.advanceTimersByTime(10_000); // 00:00:05 EDT
    });
    expect(result.current).toBe("2026-03-09");
  });

  it("re-reads the clock when the app returns to the foreground", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const { result } = renderHook(() => useChurchToday());
    expect(result.current).toBe("2026-10-18");
    // Timers do not run while the app is suspended; the phone wakes the next evening.
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    act(() => {
      native.listeners.forEach((listener) => listener("active"));
    });
    expect(result.current).toBe("2026-10-19");
  });

  it("stops listening when the screen goes away", () => {
    const { unmount } = renderHook(() => useChurchToday());
    expect(native.listeners.size).toBe(1);
    unmount();
    expect(native.listeners.size).toBe(0);
  });
});
