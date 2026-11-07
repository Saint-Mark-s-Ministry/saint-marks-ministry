import { describe, expect, it } from "vitest";
import { PROCTOR_SOUNDS, SOUND_GAP_MS, pickSound, planAlerts, rosterEvents } from "../../apps/mobile/src/data/proctor-alerts";
import { event, row, view } from "./exam-monitor-fixture";

const base = { sounded: new Set<string>(), soundOn: true, listening: true, now: 100_000, lastSoundAt: 0 };
const mina = (events: ReturnType<typeof event>[], state: "PAUSED" | "ACTIVE" = "PAUSED") => row("Mina", { state, events });

describe("proctor alert planning", () => {
  it("records what already happened on the first dashboard without alerting or sounding", () => {
    const plan = planAlerts({ ...base, view: view({}, [mina([event("1", "HIDDEN")])]), seen: null });
    expect(plan).toMatchObject({ alerts: [], haptic: false, sound: null });
    expect([...plan.seen]).toEqual(["1"]);
  });
  it("alerts on a new interruption once, however many times the dashboard returns it", () => {
    const first = planAlerts({ ...base, view: view({}, [mina([])]), seen: null });
    const interrupted = view({}, [mina([event("1", "HIDDEN")])]);
    const plan = planAlerts({ ...base, view: interrupted, seen: first.seen });
    expect(plan.alerts.map((a) => a.event.id)).toEqual(["1"]);
    expect(plan.haptic).toBe(true);
    expect(plan.sound?.name).toBe("Mina");
    const again = planAlerts({ ...base, view: interrupted, seen: plan.seen, sounded: plan.sounded, lastSoundAt: 100_000, now: 200_000 });
    expect(again).toMatchObject({ alerts: [], haptic: false, sound: null });
  });
  it("does not alert for answers, starts, returns or unlocks", () => {
    const seen = new Set<string>();
    const plan = planAlerts({ ...base, seen, view: view({}, [mina([event("1", "ANSWER_SAVED"), event("2", "STARTED"), event("3", "RETURNED"), event("4", "UNLOCKED")], "ACTIVE")]) });
    expect(plan).toMatchObject({ alerts: [], haptic: false, sound: null });
    expect(plan.seen.size).toBe(4);
  });
  it("stays silent when sound is off, but still lists the alert and buzzes", () => {
    const plan = planAlerts({ ...base, soundOn: false, seen: new Set(), view: view({}, [mina([event("1", "BLUR")])]) });
    expect(plan.sound).toBeNull();
    expect(plan.alerts).toHaveLength(1);
    expect(plan.haptic).toBe(true);
  });
  it("never sounds or buzzes while the screen is not visible, but keeps the alerts to show", () => {
    const plan = planAlerts({ ...base, listening: false, seen: new Set(), view: view({}, [mina([event("1", "OFFLINE")])]) });
    expect(plan).toMatchObject({ haptic: false, sound: null });
    expect(plan.alerts).toHaveLength(1);
  });
  it("sounds at most once per refresh and at most once per gap, so clips never overlap", () => {
    const burst = view({}, [row("Mina", { state: "PAUSED", events: [event("1", "HIDDEN")] }), row("Mark", { state: "PAUSED", events: [event("2", "BLUR")] }), row("Mary", { state: "PAUSED", events: [event("3", "OFFLINE")] })]);
    const plan = planAlerts({ ...base, seen: new Set(), view: burst });
    expect(plan.alerts).toHaveLength(3);
    expect(plan.sound).not.toBeNull();
    const soon = planAlerts({ ...base, seen: new Set(), view: burst, lastSoundAt: base.now - (SOUND_GAP_MS - 1) });
    expect(soon.sound).toBeNull();
    const later = planAlerts({ ...base, seen: new Set(), view: burst, lastSoundAt: base.now - SOUND_GAP_MS });
    expect(later.sound).not.toBeNull();
  });
  it("does not sound again for each further event of a pause the student is still in", () => {
    const one = view({}, [mina([event("1", "HIDDEN")])]);
    const first = planAlerts({ ...base, seen: new Set(), view: one });
    expect(first.sound).not.toBeNull();
    const more = view({}, [mina([event("1", "HIDDEN"), event("2", "OFFLINE", "2026-10-14T12:00:20Z")])]);
    const second = planAlerts({ ...base, seen: first.seen, sounded: first.sounded, view: more, now: 200_000, lastSoundAt: 100_000 });
    expect(second.alerts).toHaveLength(1);
    expect(second.sound).toBeNull();
    expect(second.haptic).toBe(false);
  });
  it("sounds again after the student was unlocked and interrupted afresh", () => {
    const first = planAlerts({ ...base, seen: new Set(), view: view({}, [mina([event("1", "HIDDEN")])]) });
    const unlocked = planAlerts({ ...base, seen: first.seen, sounded: first.sounded, view: view({}, [mina([event("1", "HIDDEN"), event("2", "UNLOCKED")], "ACTIVE")]), now: 150_000, lastSoundAt: 100_000 });
    expect(unlocked.sounded.size).toBe(0);
    const again = planAlerts({ ...base, seen: unlocked.seen, sounded: unlocked.sounded, view: view({}, [mina([event("1", "HIDDEN"), event("2", "UNLOCKED"), event("3", "HIDDEN")])]), now: 300_000, lastSoundAt: 100_000 });
    expect(again.sound?.event.id).toBe("3");
  });
  it("lists the newest alert first", () => {
    const plan = planAlerts({ ...base, seen: new Set(), view: view({}, [mina([event("1", "HIDDEN", "2026-10-14T12:00:00Z"), event("2", "OFFLINE", "2026-10-14T12:00:05Z")])]) });
    expect(plan.alerts.map((a) => a.event.id)).toEqual(["2", "1"]);
  });
  it("reads events across the roster and tolerates a dashboard with no roster", () => {
    expect(rosterEvents(undefined)).toEqual([]);
    expect(rosterEvents(view({}, [row("A", null), mina([event("1", "HIDDEN")])]))).toHaveLength(1);
    expect(planAlerts({ ...base, seen: null, view: undefined }).seen.size).toBe(0);
  });
});

describe("the permitted alert sounds", () => {
  it("are the five bundled voice clips, without the clip that has no redistribution license", () => {
    expect(PROCTOR_SOUNDS).toHaveLength(5);
    expect(PROCTOR_SOUNDS.every((name) => name.startsWith("egyptian-english-") && name.endsWith(".wav"))).toBe(true);
    expect([...PROCTOR_SOUNDS]).not.toContain("borat-very-nice.wav");
  });
  it("chooses any of them with equal probability and never indexes out of range", () => {
    expect(pickSound(() => 0)).toBe(PROCTOR_SOUNDS[0]);
    expect(pickSound(() => 0.999999)).toBe(PROCTOR_SOUNDS[4]);
    expect(pickSound(() => 1)).toBe(PROCTOR_SOUNDS[4]);
    expect(new Set([0, 0.2, 0.4, 0.6, 0.8].map((r) => pickSound(() => r))).size).toBe(5);
  });
});
