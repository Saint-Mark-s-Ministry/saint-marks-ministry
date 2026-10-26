import { useCallback, useRef, useState } from "react";
import type { SundaySchoolVisitationPriorityResponse } from "@stmark/contracts";
import { ApiError } from "./api-client";
import { request, endpoint } from "./resources";
import {
  PRIORITY_FAILURE_MESSAGE,
  failureNeedsRefresh,
  priorityDoneMessage,
  priorityFailure,
  priorityRequest,
  type PriorityOverrides,
} from "./visitation-priority";

export type PriorityNotice = { kind: "error" | "info"; message: string };

/**
 * Starring a child. A tap shows at once (an override over the server's answer),
 * is saved with PATCH, and then the list is refreshed from the server. If the
 * save fails the override is dropped, so the star returns to what the server
 * has, and a notice says why; a refusal or a changed roster also refreshes so
 * the screen stops showing something that is no longer true.
 */
export function useVisitationPriority(refresh: () => Promise<unknown>) {
  const [overrides, setOverrides] = useState<PriorityOverrides>({});
  const [saving, setSaving] = useState<Record<string, true>>({});
  const [notice, setNotice] = useState<PriorityNotice | null>(null);
  const inFlight = useRef(new Set<string>());

  const drop = (childId: string) =>
    setOverrides((current) => {
      const { [childId]: _removed, ...rest } = current;
      return rest;
    });

  const toggle = useCallback(
    async (childId: string, next: boolean) => {
      // One save per child at a time: a second tap must not race the first.
      if (inFlight.current.has(childId)) return;
      inFlight.current.add(childId);
      setSaving((current) => ({ ...current, [childId]: true }));
      setOverrides((current) => ({ ...current, [childId]: next }));
      setNotice(null);
      try {
        await request<SundaySchoolVisitationPriorityResponse>(
          endpoint("visitations"),
          "PATCH",
          priorityRequest(childId, next),
        );
        // Show the server's answer, then let go of the local choice.
        await refresh().catch(() => undefined);
        drop(childId);
        setNotice({ kind: "info", message: priorityDoneMessage(next) });
      } catch (error) {
        drop(childId);
        const failure = priorityFailure(error instanceof ApiError ? error.status : undefined);
        setNotice({ kind: "error", message: PRIORITY_FAILURE_MESSAGE[failure] });
        if (failureNeedsRefresh(failure)) await refresh().catch(() => undefined);
      } finally {
        inFlight.current.delete(childId);
        setSaving((current) => {
          const { [childId]: _done, ...rest } = current;
          return rest;
        });
      }
    },
    [refresh],
  );

  return { overrides, saving, notice, dismiss: () => setNotice(null), toggle };
}
