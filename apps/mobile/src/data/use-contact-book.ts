import { useCallback, useEffect, useReducer, useState } from "react";
import { AppState } from "react-native";
import { api } from "./auth-provider";
import {
  CONTACT_BOOK_PATH,
  contactBookReducer,
  initialContactBookState,
  type ContactBookResponse,
} from "./contact-book";

const REVALIDATE_MS = 60_000;

/**
 * Loads the Contact Book directory for one signed-in identity.
 *
 * Deliberately not built on the shared resource cache: that cache is keyed by
 * URL alone, and contacts must never be shown to a different identity or
 * outlive a revoked permission. State lives here, is scoped to `identity`, and
 * is discarded when it changes or the screen closes.
 *
 * The server returns everyone in one response, so search and paging are done by
 * the screen on what this hook holds. Revalidates on foreground and every
 * minute while open, so a revoked grant (403) clears the list on the next
 * check rather than at the next sign-in.
 */
export function useContactBook(identity: string, enabled: boolean) {
  const [state, dispatch] = useReducer(contactBookReducer, identity, initialContactBookState);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    dispatch({ type: "started", identity });
    if (!api) {
      dispatch({ type: "failed", identity, error: new Error("The portal is not configured.") });
      return;
    }
    api
      .request<ContactBookResponse>(CONTACT_BOOK_PATH, { signal: controller.signal })
      .then((response) => dispatch({ type: "loaded", identity, response }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        dispatch({ type: "failed", identity, error });
      });
    return () => controller.abort();
  }, [identity, enabled, tick]);

  useEffect(() => {
    if (!enabled) return;
    const revalidate = () => setTick((value) => value + 1);
    const interval = setInterval(() => {
      if (AppState.currentState === "active") revalidate();
    }, REVALIDATE_MS);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") revalidate();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled]);

  const retry = useCallback(() => setTick((value) => value + 1), []);

  return { state, retry };
}
