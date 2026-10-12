import { useCallback, useEffect, useReducer, useState } from "react";
import { AppState } from "react-native";
import { api } from "./auth-provider";
import {
  contactBookPath,
  contactBookReducer,
  initialContactBookState,
  type ContactBookResponse,
} from "./contact-book";

const REVALIDATE_MS = 60_000;
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Loads one page of the Contact Book for one signed-in identity.
 *
 * Deliberately not built on the shared resource cache: that cache is keyed by
 * URL alone, and contacts must never be shown to a different identity or
 * outlive a revoked permission. State lives here, is scoped to `identity`, and
 * is discarded when it changes or the screen closes.
 *
 * Revalidates on foreground and every minute while open, so a revoked grant
 * (403) clears the list on the next check rather than at the next sign-in.
 */
export function useContactBook(identity: string, enabled: boolean) {
  const [state, dispatch] = useReducer(contactBookReducer, identity, initialContactBookState);
  const [search, setSearch] = useState("");
  // Term and page change together so a new search never fetches the old page number.
  const [query, setQuery] = useState({ term: "", page: 1 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const term = search.trim();
      setQuery((current) => (current.term === term ? current : { term, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    dispatch({ type: "started", identity });
    if (!api) {
      dispatch({ type: "failed", identity, error: new Error("The portal is not configured.") });
      return;
    }
    api
      .request<ContactBookResponse>(contactBookPath(query.term, query.page), { signal: controller.signal })
      .then((response) => dispatch({ type: "loaded", identity, response }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        dispatch({ type: "failed", identity, error });
      });
    return () => controller.abort();
  }, [identity, enabled, query, tick]);

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

  const goToPage = useCallback((page: number) => setQuery((current) => ({ ...current, page })), []);
  const retry = useCallback(() => setTick((value) => value + 1), []);

  return { state, search, setSearch, term: query.term, page: query.page, goToPage, retry };
}
