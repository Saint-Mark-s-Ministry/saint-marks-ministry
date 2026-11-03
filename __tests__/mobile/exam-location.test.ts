import { describe, expect, it, vi } from "vitest";
import { distanceMeters, MEETING_RADIUS_METERS, meetingVenue, validMeetingPosition } from "../../lib/meeting-geofence";
import {
  LocationUnavailable,
  createLocator,
  isLocationRefusal,
  usable,
  type LocationSource,
  type RawFix,
} from "../../apps/mobile/src/data/exam-location";

const NOW = 1_800_000_000_000;
const fix = (over: Partial<RawFix> = {}): RawFix => ({ latitude: 40.71602, longitude: -74.0867, accuracy: 8, timestamp: NOW, ...over });
function source(over: Partial<LocationSource> = {}, fixes: RawFix[] = [fix()]) {
  const queue = [...fixes];
  const current = vi.fn(async () => queue.length > 1 ? queue.shift()! : queue[0]);
  const s: LocationSource & { current: typeof current } = {
    servicesEnabled: async () => true,
    permission: async () => "granted",
    current,
    ...over,
  } as LocationSource & { current: typeof current };
  return s;
}
const locator = (s: LocationSource, clock = { t: NOW }) => ({ locate: createLocator(s, { now: () => clock.t, wait: async () => { clock.t += 2000; } }), clock });

describe("positions the server will accept", () => {
  it("agrees with the server's own validator on every bound", () => {
    const cases: Partial<RawFix>[] = [
      {}, { accuracy: 100 }, { accuracy: 101 }, { accuracy: 0 }, { accuracy: -1 }, { accuracy: null as unknown as number },
      { latitude: 91 }, { longitude: -181 }, { latitude: NaN },
      { timestamp: NOW - 120_000 }, { timestamp: NOW - 120_001 }, { timestamp: NOW + 10_000 }, { timestamp: NOW + 10_001 },
    ];
    for (const over of cases) expect(usable(fix(over), NOW), JSON.stringify(over)).toBe(validMeetingPosition(fix(over), NOW));
  });

  it("the church's own position is inside the boundary the server checks", async () => {
    expect(distanceMeters(fix(), await meetingVenue())).toBeLessThan(MEETING_RADIUS_METERS);
  });
});

describe("taking a fix", () => {
  it("returns a fresh fix for start and submit, and reuses one under a minute old for autosaves", async () => {
    const s = source();
    const { locate, clock } = locator(s);
    await locate("fresh");
    expect(s.current).toHaveBeenCalledTimes(1);
    clock.t = NOW + 59_000;
    await locate("reuse");
    expect(s.current).toHaveBeenCalledTimes(1); // reused
    await locate("fresh");
    expect(s.current).toHaveBeenCalledTimes(2); // start and submit never reuse
    clock.t += 60_000;
    await locate("reuse");
    expect(s.current).toHaveBeenCalledTimes(3); // a minute later, a new one
  });

  it("shares one capture between simultaneous requests", async () => {
    const s = source();
    const { locate } = locator(s);
    await Promise.all([locate("fresh"), locate("fresh"), locate("reuse")]);
    expect(s.current).toHaveBeenCalledTimes(1);
  });

  it("waits for a precise fix, then says how imprecise it was", async () => {
    const s = source({}, [fix({ accuracy: 250 }), fix({ accuracy: 180 }), fix({ accuracy: 60 })]);
    const { locate } = locator(s);
    expect((await locate("fresh")).accuracy).toBe(60);
    const poor = source({}, [fix({ accuracy: 250 })]);
    await expect(locator(poor).locate("fresh")).rejects.toThrow(/not precise enough \(about 250 meters; 100 or better is needed\)/);
    expect(poor.current).toHaveBeenCalledTimes(4);
  });

  it("refuses a stale fix", async () => {
    const stale = source({}, [fix({ timestamp: NOW - 200_000 })]);
    await expect(locator(stale).locate("fresh")).rejects.toThrow(/precise, current location/);
  });

  it("says what to do when location is off, asked-and-refused, or blocked in Settings", async () => {
    const off = await locator(source({ servicesEnabled: async () => false })).locate("fresh").catch((e: LocationUnavailable) => e);
    expect(off).toMatchObject({ settings: true });
    expect((off as Error).message).toMatch(/Location Services are off/);
    const denied = await locator(source({ permission: async () => "denied" })).locate("fresh").catch((e: LocationUnavailable) => e);
    expect(denied).toMatchObject({ settings: false });
    expect((denied as Error).message).toMatch(/Allow location access/);
    const blocked = await locator(source({ permission: async () => "blocked" })).locate("fresh").catch((e: LocationUnavailable) => e);
    expect(blocked).toMatchObject({ settings: true });
  });

  it("a failed read is a location problem, not a crash, and a later attempt can succeed", async () => {
    let fail = true;
    const s = source({ current: vi.fn(async () => { if (fail) throw new Error("kCLErrorDomain"); return fix(); }) });
    const { locate } = locator(s);
    await expect(locate("fresh")).rejects.toBeInstanceOf(LocationUnavailable);
    fail = false;
    await expect(locate("fresh")).resolves.toMatchObject({ latitude: 40.71602 });
  });
});

describe("the server's own refusals about location", () => {
  const refusal = (status: number, message: string) => Object.assign(new Error(message), { status });
  it("recognizes the three wordings and nothing else", () => {
    expect(isLocationRefusal(refusal(400, "Enable precise location and try again. A location captured within two minutes and accurate to within 100 meters is required."))).toBe(true);
    expect(isLocationRefusal(refusal(403, "Online exams must be taken within 150 meters of 427 Westside Ave, Jersey City, NJ. Your saved answers are preserved."))).toBe(true);
    expect(isLocationRefusal(refusal(503, "Could not verify the exam location. Your saved answers are preserved. Please try again or contact your proctor."))).toBe(true);
    // A real revocation, a revision conflict and a closed exam are not location problems.
    expect(isLocationRefusal(refusal(403, "Forbidden"))).toBe(false);
    expect(isLocationRefusal(refusal(409, "Revision changed"))).toBe(false);
    expect(isLocationRefusal(refusal(500, "Internal error"))).toBe(false);
    expect(isLocationRefusal(new Error("Enable precise location"))).toBe(false);
  });
});
