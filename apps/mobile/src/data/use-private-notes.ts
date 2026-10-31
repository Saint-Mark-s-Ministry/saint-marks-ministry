import { useEffect, useRef } from "react";
import { useAuth } from "./auth-provider";
import { dropResources, useResource } from "./resources";
import {
  PRIVATE_NOTES_PREFIX,
  parsePrivateNotes,
  privateNotesPath,
  privateNotesProblem,
  privateNotesScope,
  type PrivateNotesAccess,
  type PrivateNotesProblem,
} from "./private-notes";
import type { SundaySchoolPriestNotesResponse } from "@stmark/contracts";

/**
 * One child's confidential notes, only when the session may read them and the section is
 * open. The request goes to the private-note route and nowhere else. The cache is scoped to
 * the viewer and the child; it is asked again every time the section opens (access can change
 * between two openings); and everything cached is forgotten when the viewer changes, when the
 * section closes or the permission goes away, and when the screen is left. After a refusal
 * (403) or any failed request no earlier content is shown.
 */
export function usePrivateNotes(options: { childId: string | undefined; access: PrivateNotesAccess; open: boolean }) {
  const { user, viewingAs } = useAuth();
  const originalId = viewingAs?.originalId;
  // Defence in depth: a View as session never asks, whatever the response said.
  const enabled = options.open && options.access !== "none" && !!user && !viewingAs && !!options.childId;
  const path = enabled && options.childId ? privateNotesPath(options.childId) : null;
  const scope =
    enabled && user && options.childId
      ? privateNotesScope({ id: user.id, originalId }, options.childId)
      : undefined;
  const resource = useResource<SundaySchoolPriestNotesResponse>(path, scope);
  const { refresh } = resource;

  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!scope) {
      asked.current = null;
      return;
    }
    if (asked.current !== scope) {
      asked.current = scope;
      void refresh();
    }
    // Leaving this scope (another viewer, another child, section closed, permission lost, screen left)
    // forgets every private answer held in memory.
    return () => dropResources(PRIVATE_NOTES_PREFIX);
  }, [scope, refresh]);

  const failed = !!resource.error;
  const problem: PrivateNotesProblem | undefined = failed ? privateNotesProblem(resource.errorStatus) : undefined;
  return {
    notes: enabled && !failed && resource.data ? parsePrivateNotes(resource.data) : undefined,
    loading: enabled && !resource.data && !failed,
    problem,
    retry: refresh,
  };
}
