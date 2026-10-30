import * as SecureStore from "expo-secure-store";
import type { DraftStore } from "./attendance-editor";

/**
 * Attendance drafts live in the Keychain, like the app's other drafts: encrypted, and not copied to a new
 * phone. "After first unlock" lets a mark made with the phone locked (a Live Activity, a widget, a
 * resumed app) still be written.
 */
export const secureDraftStore: DraftStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) =>
    SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
  remove: (key) => SecureStore.deleteItemAsync(key),
};
