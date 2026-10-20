import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { request } from "./resources";
import {
  calendarPath,
  chunkDates,
  churchToday,
  msUntilChurchMidnight,
  type LiturgicalCalendar,
  type LiturgicalCalendarDay,
} from "./liturgical";

const MAX_SLEEP_MS = 10 * 60 * 1000;

/**
 * Today's date at the church (`YYYY-MM-DD`), moving on by itself at church
 * midnight. Timers don't run while the app is suspended, so coming back to the
 * foreground re-reads the clock too. Pass the result to the liturgical hooks
 * and an open screen follows the day without a refresh.
 */
export function useChurchToday(): string {
  const [today, setToday] = useState(() => churchToday());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    // Wake at the next church midnight, but never sleep longer than a few
    // minutes: the day is 23 or 25 hours long on the two DST nights, so a long
    // timer could be an hour late. Setting an unchanged date does not re-render.
    const arm = () => {
      timer = setTimeout(() => {
        setToday(churchToday());
        arm();
      }, Math.min(msUntilChurchMidnight() + 1000, MAX_SLEEP_MS));
    };
    arm();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setToday(churchToday());
    });
    return () => subscription.remove();
  }, []);

  return today;
}

// ── Calendar annotations for many dates ─────────────────────────────────────

/** The server caches too; this only spares re-asking while moving between screens. */
const CALENDAR_TTL_MS = 6 * 60 * 60 * 1000;

type Days = Record<string, LiturgicalCalendarDay>;
const calendarCache = new Map<string, { days: Days; at: number }>();
const inFlight = new Map<string, Promise<Days | null>>();

export function clearLiturgicalCalendarCache() {
  calendarCache.clear();
  inFlight.clear();
}

/**
 * One request's worth of dates. Resolves to null when the church calendar
 * can't be reached (or answers with something unexpected), after falling back
 * to the last good answer for that chunk, so a caller never has to catch.
 */
export async function loadCalendarChunk(chunk: readonly string[], force = false): Promise<Days | null> {
  const key = chunk.join(",");
  const hit = calendarCache.get(key);
  if (!force && hit && Date.now() - hit.at < CALENDAR_TTL_MS) return hit.days;
  const pending =
    inFlight.get(key) ??
    request<{ days?: Days }>(calendarPath(chunk))
      .then((response) => {
        const days = response && typeof response.days === "object" && response.days ? response.days : {};
        calendarCache.set(key, { days, at: Date.now() });
        return days;
      })
      .catch(() => hit?.days ?? null)
      .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

/** Any number of dates, fetched in requests of at most 60 and merged. Chunks that fail are simply missing. */
export async function loadCalendar(dates: readonly string[], force = false): Promise<{ days: Days; failed: boolean }> {
  const results = await Promise.all(chunkDates(dates).map((chunk) => loadCalendarChunk(chunk, force)));
  return {
    days: Object.assign({}, ...results.filter((result): result is Days => !!result)) as Days,
    failed: results.some((result) => result === null),
  };
}

function cachedCalendar(chunks: string[][]): Days {
  const merged: Days = {};
  for (const chunk of chunks) Object.assign(merged, calendarCache.get(chunk.join(","))?.days);
  return merged;
}

/**
 * Feasts and fasts for the given days, for laying over a calendar or beside
 * lessons. Best effort: it never throws, never blocks the screen it decorates,
 * and is simply empty while loading or if Coptic IO is unavailable.
 */
export function useLiturgicalCalendar(dates: readonly string[]) {
  const signature = useMemo(() => chunkDates(dates).map((chunk) => chunk.join(",")).join("|"), [dates]);
  const chunks = useMemo(() => signature.split("|").filter(Boolean).map((chunk) => chunk.split(",")), [signature]);
  const [state, setState] = useState<{ days: LiturgicalCalendar; failed: boolean; loading: boolean }>(() => ({
    days: cachedCalendar(chunks),
    failed: false,
    loading: chunks.length > 0,
  }));
  const forceNext = useRef(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!chunks.length) {
      setState({ days: {}, failed: false, loading: false });
      return;
    }
    let cancelled = false;
    const force = forceNext.current;
    forceNext.current = false;
    setState((previous) => ({ days: { ...cachedCalendar(chunks), ...previous.days }, failed: false, loading: true }));
    void loadCalendar(chunks.flat(), force).then(({ days, failed }) => {
      if (!cancelled) setState({ days, failed, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [chunks, nonce]);

  const refresh = useCallback(async () => {
    forceNext.current = true;
    setNonce((value) => value + 1);
  }, []);

  return { days: state.days, loading: state.loading, failed: state.failed, refresh };
}
