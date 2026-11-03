// The church-location check for online original exams (docs/digital-exams.md, "Church location requirement"). The server
// requires a position on every start, save and submit: captured within two minutes, accurate to 100 meters, within 150 meters
// of the church. Start and submit take a fresh fix; autosaves may reuse one for up to a minute. A position lives in memory
// only, is never written to the draft, and is never sent with heartbeats or activity reports. Pure and injectable; the Expo
// source is in exam-location-source.ts.

export type ExamPosition = { latitude: number; longitude: number; accuracy: number; timestamp: number };
export type LocateMode = "fresh" | "reuse";
export type Locator = (mode: LocateMode) => Promise<ExamPosition>;

/** The device could not give a usable position. The exam stays open and saved answers stay put; `settings` means only the Settings app can fix it. */
export class LocationUnavailable extends Error {
  constructor(message: string, readonly settings = false) {
    super(message);
  }
}

export const MAX_ACCURACY_METERS = 100;
export const REUSE_MS = 60_000;
export const MAX_FIX_AGE_MS = 120_000;

export type RawFix = { latitude: number; longitude: number; accuracy: number | null; timestamp: number };
export type LocationSource = {
  servicesEnabled(): Promise<boolean>;
  /** Asks only when the system still allows asking. */
  permission(): Promise<"granted" | "denied" | "blocked">;
  current(): Promise<RawFix>;
};

/** The server's own bounds on a position (lib/meeting-geofence.ts validMeetingPosition), checked before sending. */
export function usable(fix: RawFix, now: number): fix is ExamPosition {
  return (
    [fix.latitude, fix.longitude, fix.timestamp].every(Number.isFinite) &&
    Math.abs(fix.latitude) <= 90 &&
    Math.abs(fix.longitude) <= 180 &&
    typeof fix.accuracy === "number" &&
    Number.isFinite(fix.accuracy) &&
    fix.accuracy > 0 &&
    fix.accuracy <= MAX_ACCURACY_METERS &&
    fix.timestamp <= now + 10_000 &&
    now - fix.timestamp <= MAX_FIX_AGE_MS
  );
}

export function createLocator(
  source: LocationSource,
  options: { now?: () => number; wait?: (ms: number) => Promise<void>; attempts?: number } = {},
): Locator {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const attempts = options.attempts ?? 4;
  let cached: ExamPosition | null = null;
  let flight: Promise<ExamPosition> | null = null;

  async function capture(): Promise<ExamPosition> {
    if (!(await source.servicesEnabled()))
      throw new LocationUnavailable("Location Services are off. Turn them on in Settings to take this exam.", true);
    const permission = await source.permission();
    if (permission === "blocked")
      throw new LocationUnavailable("Location access is off for this app. Turn it on in Settings to take this exam.", true);
    if (permission === "denied") throw new LocationUnavailable("Allow location access to take this exam. It is only checked, never stored.");
    let last: RawFix | null = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        last = await source.current();
      } catch {
        throw new LocationUnavailable("Could not get your location. Check that Location Services are on and try again.");
      }
      if (usable(last, now())) return (cached = { latitude: last.latitude, longitude: last.longitude, accuracy: last.accuracy, timestamp: last.timestamp });
      if (attempt < attempts - 1) await wait(2000);
    }
    const accuracy = last?.accuracy;
    throw new LocationUnavailable(
      typeof accuracy === "number" && accuracy > MAX_ACCURACY_METERS
        ? `Your location is not precise enough (about ${Math.round(accuracy)} meters; 100 or better is needed). Move closer to a window or outdoors and try again.`
        : "Could not get a precise, current location. Enable precise location and try again.",
    );
  }

  return (mode) => {
    // An autosave may reuse a fix up to a minute old; start and submit always take a new one.
    if (mode === "reuse" && cached && now() - cached.timestamp < REUSE_MS && cached.timestamp <= now()) return Promise.resolve(cached);
    flight ??= capture().finally(() => {
      flight = null;
    });
    return flight;
  };
}

/** The server's refusals about location (400 stale or imprecise, 403 outside the boundary, 503 lookup failure), by their stable wording. */
export function isLocationRefusal(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  const message = error instanceof Error ? error.message : "";
  return (
    (status === 400 || status === 403 || status === 503) &&
    /(precise location|exam location|within \d+ meters of)/i.test(message)
  );
}
