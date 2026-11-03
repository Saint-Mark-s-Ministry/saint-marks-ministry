import * as Location from "expo-location";
import type { LocationSource } from "./exam-location";

/** The device's location through Expo, when-in-use only. Nothing is stored. */
export const expoLocationSource: LocationSource = {
  servicesEnabled: () => Location.hasServicesEnabledAsync(),
  async permission() {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return "granted";
    if (!current.canAskAgain) return "blocked";
    const asked = await Location.requestForegroundPermissionsAsync();
    if (asked.granted) return "granted";
    return asked.canAskAgain ? "denied" : "blocked";
  },
  async current() {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };
  },
};
