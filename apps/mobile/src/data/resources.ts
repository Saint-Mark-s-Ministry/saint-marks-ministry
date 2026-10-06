import { useCallback, useState, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import { api } from "./auth-provider";

export const endpoint = (area: string, id?: string) =>
  `/api/sunday-school/${area}${id ? `/${encodeURIComponent(id)}` : ""}`;
export function query(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.toString();
}

const STALE_AFTER_MS = 30_000;
type CacheEntry = {
  data?: unknown;
  error?: string;
  loading: boolean;
  updatedAt: number;
  request?: Promise<unknown>;
};
const emptyEntry: CacheEntry = { loading: false, updatedAt: 0 };
const cache = new Map<string, CacheEntry>();
const listeners = new Map<string, Set<() => void>>();
const cacheKey = (path: string) => path.endsWith("?") ? path.slice(0, -1) : path;
const emit = (key: string) => listeners.get(key)?.forEach(listener => listener());
const subscribe = (path: string, listener: () => void) => {
  const key = cacheKey(path);
  const current = listeners.get(key) ?? new Set();
  current.add(listener);
  listeners.set(key, current);
  return () => {
    current.delete(listener);
    if (!current.size) listeners.delete(key);
  };
};

export function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  options: Omit<RequestInit, "method" | "body"> = {},
) {
  if (!api) return Promise.reject(new Error("The portal is not configured."));
  const headers = new Headers(options.headers);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return api.request<T>(path, {
    ...options,
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).then(result => {
    if (method !== "GET") invalidateResourceCache();
    return result;
  });
}

async function loadResource<T>(path: string, force = false): Promise<T> {
  const key = cacheKey(path);
  const current = cache.get(key) ?? emptyEntry;
  if (current.request) return current.request as Promise<T>;
  if (!force && current.data !== undefined && Date.now() - current.updatedAt < STALE_AFTER_MS)
    return current.data as T;

  const pending = request<T>(path).then(data => {
    if (cache.get(key)?.request === pending) {
      cache.set(key, { data, loading: false, updatedAt: Date.now() });
      emit(key);
    }
    return data;
  }).catch(error => {
    if (cache.get(key)?.request === pending) {
      cache.set(key, {
        data: current.data,
        loading: false,
        updatedAt: current.updatedAt,
        error: error instanceof Error ? error.message : "Unable to load. Please retry.",
      });
      emit(key);
    }
    throw error;
  });
  cache.set(key, { ...current, loading: true, error: undefined, request: pending });
  emit(key);
  return pending;
}

export function invalidateResourceCache() {
  for (const [key, entry] of cache) {
    cache.set(key, { ...entry, loading: false, updatedAt: 0, request: undefined });
    emit(key);
  }
}

export function clearResourceCache() {
  const keys = [...cache.keys()];
  cache.clear();
  keys.forEach(emit);
}

export async function prefetchResources(paths: string[]) {
  await Promise.allSettled(paths.map(path => loadResource(path)));
}

// Keep the last successful response visible, then refresh stale data quietly on focus.
export function useResource<T>(path: string | null) {
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const subscribeToPath = useCallback(
    (listener: () => void) => path ? subscribe(path, listener) : () => {},
    [path],
  );
  const getSnapshot = useCallback(
    () => path ? cache.get(cacheKey(path)) ?? emptyEntry : emptyEntry,
    [path],
  );
  const entry = useSyncExternalStore(subscribeToPath, getSnapshot, () => emptyEntry);
  const refresh = useCallback(async () => {
    if (!path) return;
    setManualRefreshing(true);
    await loadResource<T>(path, true).catch(() => undefined);
    setManualRefreshing(false);
  }, [path]);

  useFocusEffect(useCallback(() => {
    if (path) void loadResource<T>(path).catch(() => undefined);
  }, [path]));

  const data = entry.data as T | undefined;
  return {
    path,
    data,
    loading: !!path && data === undefined && !entry.error,
    refreshing: manualRefreshing,
    error: data === undefined ? entry.error : undefined,
    // Cached data is still shown after a failed refresh; `stale` says so, and `updatedAt` says when it was last loaded.
    stale: data !== undefined && !!entry.error,
    updatedAt: entry.updatedAt,
    refresh,
  };
}
