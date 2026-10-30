import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import type { SavableStatus } from "./attendance-draft";
import { secureDraftStore } from "./attendance-draft-store";
import { AttendanceEditor, INITIAL_EDITOR_STATE, summarize } from "./attendance-editor";
import { requestAttendanceReminderRefresh } from "./attendance-reminders";
import { request } from "./resources";

const noSubscription = () => () => undefined;

/**
 * The Sunday School attendance editor for one account, class and date (see attendance-editor.ts for the
 * rules). A different account, class or date, or a change in whether this person may edit, is a new editor:
 * the old one aborts its work and its answers can never reach the new screen.
 */
export function useAttendanceEditor(input: { userId: string | null; classId: string; date: string; canEdit: boolean }) {
  const { userId, classId, date, canEdit } = input;
  const [editor, setEditor] = useState<AttendanceEditor | null>(null);

  useEffect(() => {
    if (!userId) {
      setEditor(null);
      return;
    }
    const next = new AttendanceEditor({
      userId,
      classId,
      date,
      canEdit,
      request,
      store: secureDraftStore,
      onSaved: requestAttendanceReminderRefresh,
    });
    setEditor(next);
    next.start();
    // Coming back to the app, or leaving it, sends what is waiting instead of waiting out the pause.
    const subscription = AppState.addEventListener("change", () => next.flushNow());
    return () => {
      subscription.remove();
      next.dispose();
    };
  }, [userId, classId, date, canEdit]);

  // The editor is created in an effect, so for one render after a change the previous one is still held.
  const current = editor && editor.key === `${userId}|${classId}|${date}` ? editor : null;
  const state = useSyncExternalStore(
    current ? current.subscribe : noSubscription,
    current ? current.getState : () => INITIAL_EDITOR_STATE,
  );
  const summary = useMemo(() => summarize(state, canEdit), [state, canEdit]);

  return {
    state,
    summary,
    mark: useCallback((childId: string, status: SavableStatus) => current?.mark(childId, status), [current]),
    markRestPresent: useCallback(() => current?.markRestPresent(), [current]),
    setNote: useCallback((childId: string, text: string) => current?.setNote(childId, text), [current]),
    /** `finalize` is the explicit save: it records the children still unmarked as absent. */
    save: useCallback((finalize: boolean) => current?.save(finalize) ?? Promise.resolve(false), [current]),
    resume: useCallback(() => current?.resume() ?? Promise.resolve(false), [current]),
    retry: useCallback(() => current?.retry() ?? Promise.resolve(false), [current]),
    reload: useCallback(() => current?.reload(), [current]),
  };
}
