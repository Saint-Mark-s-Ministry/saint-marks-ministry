import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "./auth-provider";
import { connectExamChannel, realtimeSettings, type RealtimeSettings, type RealtimeStatus } from "./exam-realtime";

/** Public keys, set at build time like EXPO_PUBLIC_API_URL. Unset (the default) means polling only. */
export const REALTIME_SETTINGS = realtimeSettings({
  key: process.env.EXPO_PUBLIC_PUSHER_KEY,
  cluster: process.env.EXPO_PUBLIC_PUSHER_CLUSTER,
});

/**
 * Holds the exam's private staff channel while the screen is focused and the app is active, and says whether it is live.
 * `onChange` runs for each ping (and once on connect). Only the Exam Monitoring screen calls this.
 */
export function useExamRealtime(examId: string, enabled: boolean, onChange: () => void, settings: RealtimeSettings | null = REALTIME_SETTINGS) {
  const [status, setStatus] = useState<RealtimeStatus>("off");
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [focused, setFocused] = useState(false);
  const change = useRef(onChange);
  change.current = onChange;
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (value) => setForeground(value === "active"));
    return () => subscription.remove();
  }, []);
  const active = enabled && focused && foreground && !!api && !!settings;
  useEffect(() => {
    if (!active || !settings || !api) { setStatus("off"); return; }
    const connection = connectExamChannel({
      settings,
      examId,
      authorize: (socketId, channel) =>
        api!.request<{ auth: string }>("/api/digital-exams/live-auth", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ socket_id: socketId, channel_name: channel }).toString(),
        }),
      onChange: () => change.current(),
      onStatus: setStatus,
    });
    return () => { connection.close(); setStatus("off"); };
  }, [active, examId, settings]);
  return status;
}
