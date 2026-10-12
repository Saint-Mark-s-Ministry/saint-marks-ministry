import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";
import { router } from "expo-router";
import { fetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { PortalApi, type CookieJar, type PortalUser, type PortalSession, type ViewAsSession } from "./api-client";

import { defaultMinistry } from "./navigation";
import { clearResourceCache } from "./resources";

const configured = process.env.EXPO_PUBLIC_API_URL;
export const apiOrigin =
  configured ||
  (__DEV__
    ? Platform.OS === "android"
      ? "http://10.0.2.2:3000"
      : "http://127.0.0.1:3000"
    : "");
export const dataLabel =
  process.env.EXPO_PUBLIC_DATA_LABEL ||
  (__DEV__ ? "Local database" : "Ministry portal");
// Namespace credentials by origin so changing servers never reuses another session.
const storageKey = `stmark.session.${Array.from<string>(apiOrigin)
  .map((c) => c.charCodeAt(0).toString(16))
  .join("")}`;
export const api = apiOrigin
  ? new PortalApi(
      apiOrigin,
      fetch,
      {
        async load() {
          const raw = await SecureStore.getItemAsync(storageKey);
          if (!raw) return {};
          try {
            return JSON.parse(raw) as CookieJar;
          } catch {
            await SecureStore.deleteItemAsync(storageKey);
            return {};
          }
        },
        async save(jar) {
          if (!Object.keys(jar).length)
            await SecureStore.deleteItemAsync(storageKey);
          else
            await SecureStore.setItemAsync(storageKey, JSON.stringify(jar), {
              keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            });
        },
      },
      __DEV__,
    )
  : null;

type AuthState = {
  user: PortalUser | null;
  viewingAs: ViewAsSession | null;
  switchingIdentity: boolean;
  viewAs: (targetId: string | null) => Promise<void>;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
  /** Re-reads the session in place (no splash, no remount), e.g. after the user's own permissions change. */
  refreshUser: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<PortalSession>({});
  const user = session.user ?? null;
  const [switchingIdentity, setSwitchingIdentity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;
  async function retry() {
    setLoading(true);
    setError(null);
    try {
      if (!api)
        throw new Error("Configure EXPO_PUBLIC_API_URL for this build.");
      await api.restore();
      await api.session();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (api) {
      api.onSessionChanged = (next, changed) => {
        if (changed) clearResourceCache();
        setSession(next);
      };
      api.onUnauthorized = () => {
        setSession({});
        setError("Your session expired. Please sign in again.");
      };
    }
    void retry();
    return () => {
      if (api) {
        api.onUnauthorized = undefined;
        api.onSessionChanged = undefined;
      }
    };
  }, []);
  useEffect(() => {
    if (!userId || !api) return;
    async function revalidate() {
      try {
        await api!.session();
      } catch {
        /* Data requests surface connection failures; do not sign out when offline. */
      }
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void revalidate();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void revalidate();
    }, 60000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [userId]);
  return (
    <AuthContext.Provider
      value={{
        user,
        viewingAs: session.impersonating ?? null,
        switchingIdentity,
        viewAs: async (targetId) => {
          if (!api) throw new Error("No API server configured.");
          setSwitchingIdentity(true);
          try {
            const next = await api.updateViewAs(targetId);
            router.dismissAll();
            router.replace(defaultMinistry(next.user!, next.user!.sundaySchool.hasAccess) === "prep" ? "/(prep)/home" : "/(tabs)/home");
          }
          finally { setSwitchingIdentity(false); }
        },
        loading,
        error,
        retry,
        refreshUser: async () => {
          if (!api) return;
          try {
            // The session adopts itself through onSessionChanged.
            await api.session();
          } catch {
            /* Keep the current user; data requests surface connection failures. */
          }
        },
        signIn: async (email, password) => {
          if (!api) throw new Error("No API server configured.");
          await api.signIn(email, password);
          setError(null);
        },
        signOut: async () => {
          setSession({});
          setError(null);
          try {
            await api?.signOut();
          } catch {
            /* Local credentials are always cleared by signOut. */
          }
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
