// Which proctor alerts to show and which to sound, as pure rules. The alert is a convenience for the person watching the
// dashboard; the pause itself lives on the server and stays on screen until a proctor unlocks the student.

import type { DigitalExamView, ExamActivity } from "@stmark/contracts";
import { PAUSE_ALERT_KINDS } from "@stmark/domain";
import { awaitingUnlock } from "./exam-monitor";

/**
 * The permitted alert clips: the same bundled voices as the web monitor, minus `borat-very-nice.wav`. That clip's README entry
 * says its source states no redistribution license, which is fine for a church web page but not for an App Store binary.
 * Files live in public/sounds and are bundled by the expo-notifications plugin (app.json) so a local notification can play them.
 */
export const PROCTOR_SOUNDS = [
  "egyptian-english-uh-oh.wav",
  "egyptian-english-oh-no.wav",
  "egyptian-english-alalalala.wav",
  "egyptian-english-come-back.wav",
  "egyptian-english-where-going.wav",
] as const;

/** Two sounds are never closer than this, so one clip finishes before the next could start. */
export const SOUND_GAP_MS = 8000;
/** One replaceable notification, so alerts never pile up in the notification list. */
export const ALERT_NOTIFICATION_ID = "proctor-alert";

export type ProctorAlert = { event: ExamActivity; name: string; studentId: string };

export const pickSound = (random: () => number = Math.random) => PROCTOR_SOUNDS[Math.min(PROCTOR_SOUNDS.length - 1, Math.floor(random() * PROCTOR_SOUNDS.length))];

/** Every activity event across the roster, tagged with its student. */
export function rosterEvents(view: DigitalExamView | undefined): ProctorAlert[] {
  return (view?.roster ?? []).flatMap((row) => row.attempt?.events.map((event) => ({ event, name: row.student.name, studentId: row.student.id })) ?? []);
}

export type AlertPlan = {
  /** Every event seen so far: the next plan's `seen`. */
  seen: Set<string>;
  /** New interruptions to list on screen, newest first. */
  alerts: ProctorAlert[];
  /** Buzz the proctor's device. */
  haptic: boolean;
  /** The one alert to say aloud, or null. */
  sound: ProctorAlert | null;
  /** Students already sounded for during their current pause: no further sound until a proctor unlocks them. */
  sounded: Set<string>;
};

/**
 * Plans the response to a refreshed dashboard.
 * - The first dashboard only records what already happened: nothing sounds for history.
 * - Each event is handled once (by its server id), however many refreshes or channel pings return it.
 * - Only interruptions alert; saved answers, starts and returns do not.
 * - At most one sound per refresh, at most one per `SOUND_GAP_MS`, and only while this screen is visible with the app active.
 * - A student who is already paused and already sounded for does not sound again for each further event of the same pause.
 */
export function planAlerts(input: {
  view: DigitalExamView | undefined;
  seen: Set<string> | null;
  sounded: Set<string>;
  soundOn: boolean;
  listening: boolean;
  now: number;
  lastSoundAt: number;
}): AlertPlan {
  const events = rosterEvents(input.view);
  const waiting = new Set((input.view?.roster ?? []).filter(awaitingUnlock).map((row) => row.student.id));
  // A student who is no longer paused starts a fresh pause next time.
  const sounded = new Set([...input.sounded].filter((id) => waiting.has(id)));
  if (!input.seen) return { seen: new Set(events.map((item) => item.event.id)), alerts: [], haptic: false, sound: null, sounded };
  const seen = new Set(input.seen);
  const fresh = events.filter((item) => !seen.has(item.event.id));
  fresh.forEach((item) => seen.add(item.event.id));
  const pauses = fresh.filter((item) => PAUSE_ALERT_KINDS.has(item.event.kind)).sort((a, b) => b.event.createdAt.localeCompare(a.event.createdAt) || b.event.id.localeCompare(a.event.id));
  if (!pauses.length) return { seen, alerts: [], haptic: false, sound: null, sounded };
  if (!input.listening) return { seen, alerts: pauses, haptic: false, sound: null, sounded };
  const newcomer = pauses.find((item) => !sounded.has(item.studentId));
  const sound = input.soundOn && input.now - input.lastSoundAt >= SOUND_GAP_MS && newcomer ? newcomer : null;
  if (sound) sounded.add(sound.studentId);
  return { seen, alerts: pauses, haptic: !!newcomer, sound, sounded };
}
