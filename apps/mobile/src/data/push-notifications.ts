/**
 * Native push: register this device's Expo push token with the portal while
 * signed in, and open the right place when a notification is tapped.
 *
 * A distinct transport from the web app's Web Push subscriptions — see
 * MobilePushToken in prisma/schema.prisma and lib/notifications.ts's
 * sendExpoPushToUser, which delivers through Expo's push service (it relays
 * to APNs on iOS, FCM on Android) rather than raw platform SDKs.
 */

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Linking } from "react-native";
import { request } from "./resources";
import { apiOrigin } from "./auth-provider";
import { resolveNotificationRoute } from "./notification-routes";
import { openNotificationRoute } from "./notification-navigation";

try {
  // Runs at module load, before any component renders — never let a missing
  // native module (an old binary that predates this feature, say) take the
  // rest of the app down with it.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // Nothing to do — registerForPushNotificationsAsync below will also fail
  // closed, so this device simply won't receive native push this session.
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null; // Push tokens don't exist on a Simulator.

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    // A native module failed to link, there's no connectivity, or the push
    // service is unreachable right now — a servant without notifications
    // still uses everything else, so this must never surface as an error.
    return null;
  }
}

/**
 * Opens a notification's target the same way the in-app history list does:
 * in the app when there is a native screen for it, the website otherwise.
 */
function openNotificationTarget(data?: { url?: string | null; type?: string | null }) {
  const route = resolveNotificationRoute({ url: data?.url, type: data?.type });
  if (route) {
    openNotificationRoute(route);
    return;
  }
  const url = data?.url;
  if (!url || !apiOrigin) return;
  void Linking.openURL(new URL(url, `${apiOrigin}/`).toString()).catch(() => {});
}

/** Call once, while signed in, from the top-level authenticated layout. */
export function usePushNotificationRegistration(userId: string | undefined) {
  const registeredFor = useRef<string | undefined>(undefined);
  const registeredToken = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      // Signed out: stop this device from receiving another account's pushes.
      const token = registeredToken.current;
      if (token) {
        registeredToken.current = null;
        void request("/api/push/mobile-unsubscribe", "POST", { token }).catch(() => {});
      }
      registeredFor.current = undefined;
      return;
    }
    if (registeredFor.current === userId) return;
    registeredFor.current = userId;
    void registerForPushNotificationsAsync().then((token) => {
      if (!token) return;
      registeredToken.current = token;
      void request("/api/push/mobile-subscribe", "POST", {
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
      }).catch(() => {
        // Best-effort: a servant without notifications still uses everything else.
      });
    });
  }, [userId]);

  useEffect(() => {
    try {
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        // The server sends the notification type as `tag` on push payloads.
        const data = response.notification.request.content.data as
          | { url?: string | null; type?: string | null; tag?: string | null }
          | undefined;
        openNotificationTarget({ url: data?.url, type: data?.type ?? data?.tag });
      });
      return () => subscription.remove();
    } catch {
      return undefined;
    }
  }, []);
}
