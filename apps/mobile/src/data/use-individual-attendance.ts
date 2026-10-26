import { useEffect, useRef } from "react";
import { useAuth } from "./auth-provider";
import { useResource } from "./resources";
import {
  classHistoryProblem,
  individualAttendancePath,
  individualAttendanceScope,
  isHistoryForClass,
  type ClassHistoryProblem,
  type IndividualAttendanceResponse,
} from "./individual-attendance";

/**
 * One class's read-only individual attendance. The cache key is the viewer
 * (and View as original) plus the class, so a different account or a different
 * class never reads this answer. Opening asks again, so a save made on the
 * attendance screen is reflected, and a refusal (403) or an inactive class
 * (404) clears what was cached. Nothing here touches pending marks.
 */
export function useIndividualAttendance(classId: string | null) {
  const { user, viewingAs } = useAuth();
  const path = classId && user ? individualAttendancePath(classId) : null;
  const scope =
    classId && user ? individualAttendanceScope({ id: user.id, originalId: viewingAs?.originalId }, classId) : undefined;
  const resource = useResource<IndividualAttendanceResponse>(path, scope);
  const { refresh } = resource;

  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!scope || asked.current === scope) return;
    asked.current = scope;
    void refresh();
  }, [scope, refresh]);

  const history = classId && isHistoryForClass(resource.data, classId) ? resource.data : undefined;
  const mismatched = resource.data !== undefined && !history;
  const problem: ClassHistoryProblem | undefined = resource.error
    ? classHistoryProblem(resource.errorStatus)
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
