import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiError } from "./api-client";
import { useAuth } from "./auth-provider";
import { request } from "./resources";
import {
  ATTENDANCE_REMINDERS_PATH,
  attendanceRemindersScope,
  onAttendanceReminderRefresh,
  parseReminders,
  type SundaySchoolAttendanceReminder,
} from "./attendance-reminders";

type State = { scope: string; reminders: SundaySchoolAttendanceReminder[]; loaded: boolean; failed: boolean };

/**
 * The signed-in servant's pending class-attendance reminders, straight from the
 * server. It asks again when the app comes to the foreground and after a
 * confirmed attendance save; it never decides completion itself. A refusal
 * (403) or a different account clears what was shown; a connection failure
 * keeps the last answer so a reminder doesn't vanish because of a bad signal.
 */
export function useAttendanceReminders() {
  const { user, viewingAs } = useAuth();
  // A parent serves no class; anyone else only matters if they have Sunday School access at all.
  const enabled = !!user && user.role !== "PARENT" && !!user.sundaySchool?.hasAccess;
  const scope = enabled && user ? attendanceRemindersScope({ id: user.id, originalId: viewingAs?.originalId }) : null;
  const [state, setState] = useState<State | null>(null);
  const latest = useRef(0);
  const current = useRef<string | null>(null);
  current.current = scope;

  const load = useCallback(async () => {
    if (!scope) return;
    const ticket = ++latest.current;
    try {
      const data = await request<unknown>(ATTENDANCE_REMINDERS_PATH);
      if (ticket !== latest.current || current.current !== scope) return;
      setState({ scope, reminders: parseReminders(data), loaded: true, failed: false });
    } catch (error) {
      if (ticket !== latest.current || current.current !== scope) return;
      // Refused: this account has no reminders to show. Otherwise keep the last answer.
      if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
        setState({ scope, reminders: [], loaded: true, failed: false });
        return;
      }
      setState((previous) => ({
        scope,
        reminders: previous?.scope === scope ? previous.reminders : [],
        loaded: previous?.scope === scope ? previous.loaded : false,
        failed: true,
      }));
    }
  }, [scope]);

  useEffect(() => {
    if (!scope) {
      latest.current++;
      setState(null);
      return;
    }
    void load();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void load();
    });
    const unregister = onAttendanceReminderRefresh(() => void load());
    return () => {
      subscription.remove();
      unregister();
    };
  }, [scope, load]);

  // Only ever show an answer that belongs to the current viewer.
  const mine = state && state.scope === scope ? state : null;
  return {
    reminders: mine?.reminders ?? [],
    loading: !!scope && !mine?.loaded && !mine?.failed,
    /** The last check failed and there is nothing earlier to show. */
    checkFailed: !!mine?.failed && !mine.loaded,
    retry: load,
  };
}
