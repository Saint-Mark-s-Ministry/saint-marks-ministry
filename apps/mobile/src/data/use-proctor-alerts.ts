import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import type { DigitalExamView } from "@stmark/contracts";
import { examActivityMessage } from "@stmark/domain";
import { feedback } from "./haptics";
import { ALERT_NOTIFICATION_ID, pickSound, planAlerts, type ProctorAlert } from "./proctor-alerts";

/**
 * The proctor's alerts: a list on screen, a haptic, and, only if the proctor turned it on, a spoken clip.
 * The clip is a local notification (no remote push, no network) with one fixed identifier, so a new alert replaces the old one
 * instead of piling up. Muting, leaving the screen and backgrounding the app dismiss it. Sound starts off every time the screen
 * opens. Only the Exam Monitoring screen uses this; student screens never import it, so no student device plays alert audio.
 */
export function useProctorAlerts(examId: string, view?: DigitalExamView) {
  const [alerts, setAlerts] = useState<ProctorAlert[]>([]);
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState("");
  const seen = useRef<Set<string> | null>(null);
  const sounded = useRef<Set<string>>(new Set());
  const focused = useRef(false);
  const lastSound = useRef(0);
  const silence = useCallback(() => {
    void Notifications.dismissNotificationAsync(ALERT_NOTIFICATION_ID).catch(() => {});
    void Notifications.cancelScheduledNotificationAsync(ALERT_NOTIFICATION_ID).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; silence(); };
  }, [silence]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (value) => { if (value !== "active") silence(); });
    return () => subscription.remove();
  }, [silence]);
  useEffect(() => silence, [silence]);
  useEffect(() => {
    if (!view?.roster) return;
    const plan = planAlerts({
      view, seen: seen.current, sounded: sounded.current, soundOn: sound,
      listening: focused.current && AppState.currentState === "active", now: Date.now(), lastSoundAt: lastSound.current,
    });
    seen.current = plan.seen;
    sounded.current = plan.sounded;
    if (plan.alerts.length) setAlerts((previous) => [...plan.alerts, ...previous].slice(0, 8));
    if (plan.haptic) feedback("warning");
    if (!plan.sound) return;
    lastSound.current = Date.now();
    void Notifications.scheduleNotificationAsync({
      identifier: ALERT_NOTIFICATION_ID,
      content: {
        title: plan.sound.name, body: examActivityMessage(plan.sound.event.kind, plan.sound.event).title,
        sound: pickSound(),
        data: { url: `/dashboard/admin/exams/${examId}/monitor` },
      },
      trigger: null,
    }).catch(() => { setSound(false); setSoundError("Could not play the alert. Enable alert sound to retry."); });
  }, [view, sound, examId]);
  async function toggleSound() {
    setSoundError("");
    if (sound) { setSound(false); silence(); return; }
    try {
      const permission = await Notifications.getPermissionsAsync();
      const granted = permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
      if (!granted) { setSoundError("Allow notifications and sounds for this app in Settings to hear proctor alerts."); return; }
      setSound(true);
    } catch { setSoundError("Alert sound is unavailable on this device. Visual alerts remain active."); }
  }
  return { alerts, sound, soundError, toggleSound, dismiss: () => setAlerts([]) };
}
