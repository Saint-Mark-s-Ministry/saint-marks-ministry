import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { feedback } from "./haptics";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import type { DigitalExamView, ExamActivity } from "@stmark/contracts";
import { PAUSE_ALERT_KINDS, examActivityMessage } from "@stmark/domain";

const sounds = ["egyptian-english-uh-oh.wav", "egyptian-english-oh-no.wav", "egyptian-english-alalalala.wav", "egyptian-english-come-back.wav", "egyptian-english-where-going.wav", "borat-very-nice.wav"];
type Alert = { event: ExamActivity; name: string; studentId: string };

export function useProctorAlerts(examId: string, view?: DigitalExamView) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState("");
  const seen = useRef<Set<string> | null>(null);
  const focused = useRef(false);
  const lastSound = useRef(0);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  useEffect(() => {
    if (!view?.roster) return;
    const events = view.roster.flatMap(row => row.attempt?.events.map(event => ({ event, name: row.student.name, studentId: row.student.id })) ?? []);
    if (!seen.current) { seen.current = new Set(events.map(item => item.event.id)); return; }
    const fresh = events.filter(item => !seen.current!.has(item.event.id));
    fresh.forEach(item => seen.current!.add(item.event.id));
    const pauses = fresh.filter(item => PAUSE_ALERT_KINDS.has(item.event.kind));
    if (!pauses.length) return;
    setAlerts(previous => [...pauses.reverse(), ...previous].slice(0, 8));
    if (!focused.current || AppState.currentState !== "active") return;
    feedback("warning");
    if (!sound || Date.now() - lastSound.current < 8000) return;
    lastSound.current = Date.now();
    const latest = pauses[0];
    // Local, foreground proctor alert. No student device plays audio and no
    // remote push service is involved. iOS sound/Focus settings still apply.
    void Notifications.scheduleNotificationAsync({
      content: {
        title: latest.name, body: examActivityMessage(latest.event.kind, latest.event).title,
        sound: sounds[Math.floor(Math.random() * sounds.length)],
        data: { url: `/dashboard/admin/exams/${examId}/monitor` },
      }, trigger: null,
    }).catch(() => { setSound(false); setSoundError("Could not play the alert. Enable alert sound to retry."); });
  }, [view, sound, examId]);
  async function toggleSound() {
    setSoundError("");
    if (sound) { setSound(false); return; }
    try {
      const permission = await Notifications.getPermissionsAsync();
      const granted = permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
      if (!granted) { setSoundError("Allow notifications and sounds for this app in Settings to hear proctor alerts."); return; }
      setSound(true);
    } catch { setSoundError("Alert sound is unavailable on this device. Visual alerts remain active."); }
  }
  return { alerts, sound, soundError, toggleSound, dismiss: () => setAlerts([]) };
}
