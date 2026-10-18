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
import { resolveNotificationRoute, targetFromPushData, type NotificationTarget } from "./notification-routes";
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
    if (Constants.expoConfig?.extra?.remotePushEnabled === false) return null;

    // Ask first (a Simulator can show and answer the prompt too), so a denial
    // is a normal, testable state. Teaching reminders and everything else
    // still arrive in the in-app feed either way.
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return null;
    if (!Device.isDevice) return null; // Push tokens don't exist on a Simulator.

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
function openNotificationTarget(target: NotificationTarget) {
  const route = resolveNotificationRoute(target);
  if (route) {
    openNotificationRoute(route);
    return;
  }
  const url = target.url;
  if (!url || !apiOrigin) return;
  void Linking.openURL(new URL(url, `${apiOrigin}/`).toString()).catch(() => {});
}

// Responses already acted on this process, so a stale "last response" is never replayed.
const handledResponses = new Set<string>();

/**
 * A push tapped while the app was not running launches it, and the live
 * listener below is not around yet to see that tap. Pick it up once the
 * navigator has had a moment to mount.
 */
async function openLaunchNotification() {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return;
    const id = response.notification.request.identifier;
    if (handledResponses.has(id)) return;
    handledResponses.add(id);
    openNotificationTarget(targetFromPushData(response.notification.request.content.data));
  } catch {
    // No native module or nothing pending: nothing to open.
  }
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
    const launchTimer = setTimeout(() => void openLaunchNotification(), 800);
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
    return () => clearTimeout(launchTimer);
  }, [userId]);

  useEffect(() => {
    try {
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        // The payload carries the web link, a type or stable id as `tag`, and
        // for a teaching reminder its `kind` and `lessonId`.
        openNotificationTarget(targetFromPushData(response.notification.request.content.data));
      });
      return () => subscription.remove();
    } catch {
      return undefined;
    }
  }, []);
}
