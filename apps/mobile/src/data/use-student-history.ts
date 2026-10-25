import { useEffect, useRef } from "react";
import { useAuth } from "./auth-provider";
import { useResource } from "./resources";
import {
  historyProblem,
  isHistoryFor,
  studentHistoryPath,
  studentHistoryScope,
  type HistoryProblem,
  type StudentHistory,
  type StudentHistoryTarget,
} from "./student-history";

/**
 * One child's read-only history. The cache is scoped to the signed-in viewer,
 * the program and the child's ID, so another account (or a View as session)
 * never sees this answer. Opening revalidates access every time, and a
 * refusal (403) or a record that is gone (404) clears what was cached rather
 * than keeping it on screen.
 */
export function useStudentHistory(target: StudentHistoryTarget | null) {
  const { user, viewingAs } = useAuth();
  const path = target && user ? studentHistoryPath(target) : null;
  const scope =
    target && user
      ? studentHistoryScope({ id: user.id, originalId: viewingAs?.originalId }, target)
      : undefined;
  const resource = useResource<StudentHistory>(path, scope);
  const { refresh } = resource;

  // Access can change between two openings: ask again each time the sheet
  // opens, showing the last answer (if any) only while the new one loads.
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!scope || asked.current === scope) return;
    asked.current = scope;
    void refresh();
  }, [scope, refresh]);

  const history = target && isHistoryFor(resource.data, target) ? resource.data : undefined;
  // An answer for some other record (or program) is never shown.
  const mismatched = resource.data !== undefined && !history;
  const problem: HistoryProblem | undefined = resource.error
    ? historyProblem(resource.errorStatus)
    : mismatched
      ? "retry"
      : undefined;

  return {
    history,
    problem,
    loading: !!path && !history && !problem,
    refreshing: resource.refreshing,
    stale: !!history && resource.stale,
    retry: refresh,
  };
}
