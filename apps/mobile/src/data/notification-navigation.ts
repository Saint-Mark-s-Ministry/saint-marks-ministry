import { router, type Href } from "expo-router";
import { isTabRoot } from "./notification-routes";

/**
 * Opens a resolved notification route inside the app. `fromSheet` is for the
 * notifications sheet itself: it has to close first or the destination would
 * stack behind it. The short delay lets the sheet's dismiss animation finish
 * so the push isn't swallowed by the transition.
 */
export function openNotificationRoute(route: string, options: { fromSheet?: boolean } = {}) {
  const go = () => {
    try {
      if (isTabRoot(route)) router.navigate(route as Href);
      else router.push(route as Href);
    } catch {
      // Navigator not ready (cold start from a push): nothing sensible to do.
    }
  };
  if (options.fromSheet) {
    try {
      router.dismiss();
    } catch {
      // Not presented as a sheet; fall through and just navigate.
    }
    setTimeout(go, 350);
    return;
  }
  go();
}
