import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { uuid } from "expo-modules-core";
import * as SecureStore from "expo-secure-store";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import type { AttemptResponse, DigitalExamView } from "@stmark/contracts";
import { apiOrigin } from "./auth-provider";
import { request } from "./resources";
import { ExamAttemptController, type ExamDraftStore } from "./exam-attempt";
import { digitalExamPath } from "./live-exams";

/** Poll only the visible screen. Monitoring never presents cached status as live. */
export function useLiveResource<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data?: T; error?: string }>({ path });
  const [refreshing, setRefreshing] = useState(false);
  const lifecycle = useRef<{ active: boolean; generation: number; flight?: { controller: AbortController; promise: Promise<void> } }>({ active: false, generation: 0 });
  const refresh = useCallback((manual = false): Promise<void> => {
    const current = lifecycle.current;
    if (!path || !current.active || AppState.currentState !== "active") return Promise.resolve();
    if (manual) setRefreshing(true);
    if (current.flight) return current.flight.promise;
    const controller = new AbortController();
    const generation = current.generation;
    const valid = () => current.active && current.generation === generation && !controller.signal.aborted && AppState.currentState === "active";
    const promise = request<T>(path, "GET", undefined, { signal: controller.signal, cache: "no-store" }).then(data => {
      if (valid()) setState({ path, data });
    }).catch(error => {
      if (valid()) setState({ path, error: error instanceof Error ? error.message : "Unable to refresh the live exam." });
    }).finally(() => {
      if (current.flight?.controller === controller) current.flight = undefined;
      if (valid()) setRefreshing(false);
    });
    current.flight = { controller, promise };
    return promise;
  }, [path]);
  useFocusEffect(useCallback(() => {
    const current = lifecycle.current;
    const pause = () => {
      current.active = false; current.generation++;
      current.flight?.controller.abort(); current.flight = undefined;
      setRefreshing(false);
      setState({ path, error: "Monitoring is paused while this screen is in the background." });
    };
    const resume = () => {
      current.active = true; current.generation++;
      setState({ path });
      void refresh();
    };
    if (AppState.currentState === "active") resume(); else pause();
    const interval = setInterval(() => void refresh(), 2000);
    const subscription = AppState.addEventListener("change", value => {
      if (value === "active") { if (!current.active) resume(); }
      else pause();
    });
    return () => { pause(); clearInterval(interval); subscription.remove(); };
  }, [refresh, path]));
  const current = state.path === path ? state : { path };
  return { ...current, loading: !!path && !current.data && !current.error, refreshing,
    refresh: () => refresh(true) };
}

// Chunk encrypted drafts so Keychain/Keystore item-size limits do not lose a
// queue of activity reports. Publish the manifest only after every chunk saves.
function secureDraftStore(identity: string): ExamDraftStore {
  const key = `stmark.exam.${Array.from(identity).map(char => char.charCodeAt(0).toString(16).padStart(4, "0")).join("")}`;
  const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  type Manifest = { generation: string; parts: number };
  const manifest = async (): Promise<Manifest | null> => {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Manifest;
      return typeof value.generation === "string" && /^[a-f0-9-]{36}$/i.test(value.generation)
        && Number.isInteger(value.parts) && value.parts > 0 && value.parts < 1000 ? value : null;
    } catch { return null; }
  };
  const remove = async (value: Manifest | null) => {
    if (value) await Promise.all(Array.from({ length: value.parts }, (_, index) =>
      SecureStore.deleteItemAsync(`${key}.${value.generation}.${index}`).catch(() => {})));
  };
  return {
    async load() {
      const value = await manifest();
      if (!value) return null;
      const chunks = await Promise.all(Array.from({ length: value.parts }, (_, index) => SecureStore.getItemAsync(`${key}.${value.generation}.${index}`)));
      return chunks.every(chunk => chunk !== null) ? chunks.join("") : null;
    },
    async save(raw) {
      const previous = await manifest();
      if (raw === null) { await SecureStore.deleteItemAsync(key); await remove(previous); return; }
      const next = { generation: uuid.v4(), parts: Math.ceil(raw.length / 1500) };
      try {
        for (let index = 0; index < next.parts; index++)
          await SecureStore.setItemAsync(`${key}.${next.generation}.${index}`, raw.slice(index * 1500, (index + 1) * 1500), options);
        await SecureStore.setItemAsync(key, JSON.stringify(next), options);
      } catch (error) { await remove(next); throw error; }
      await remove(previous);
    },
  };
}

export function useNativeExamAttempt(examId: string, userId: string) {
  const [controller] = useState(() => new ExamAttemptController({
    uuid: () => uuid.v4(),
    store: secureDraftStore(`${apiOrigin}:${userId}:${examId}`),
    getView: () => request<DigitalExamView>(digitalExamPath(examId), "GET", undefined, { cache: "no-store" }),
    post: body => request<AttemptResponse>(digitalExamPath(examId), "POST", body),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  useFocusEffect(useCallback(() => {
    controller.activate();
    controller.visibility(AppState.currentState === "active");
    void controller.refresh();
    const interval = setInterval(() => { if (AppState.currentState === "active") void controller.refresh(); }, 2000);
    const subscription = AppState.addEventListener("change", value => {
      controller.visibility(value === "active", value === "inactive");
      if (value === "active") void controller.refresh();
    });
    const blur = Platform.OS === "android" ? AppState.addEventListener("blur", () => controller.visibility(false, true)) : null;
    const focus = Platform.OS === "android" ? AppState.addEventListener("focus", () => { if (AppState.currentState === "active") controller.visibility(true); }) : null;
    return () => { clearInterval(interval); subscription.remove(); blur?.remove(); focus?.remove(); controller.visibility(false); };
  }, [controller]));
  useEffect(() => () => controller.stop(), [controller]);
  return { ...state, start: controller.start, submit: controller.submit,
    choose: (question: number, answer: string) => controller.choose(question, answer),
    toggleStar: (question: number) => controller.toggleStar(question), refresh: controller.refresh };
}

export function useExamAwake(enabled: boolean) {
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const tag = `live-exam-${uuid.v4()}`;
    let active = true;
    void activateKeepAwakeAsync(tag).then(() => {
      if (active) setAwake(true); else void deactivateKeepAwake(tag).catch(() => {});
    }).catch(() => { if (active) setAwake(false); });
    return () => { active = false; setAwake(false); void deactivateKeepAwake(tag).catch(() => {}); };
  }, [enabled]);
  return awake && enabled;
}
