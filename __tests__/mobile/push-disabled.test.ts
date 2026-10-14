import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  permissions: vi.fn(),
  requestPermissions: vi.fn(),
  token: vi.fn(),
  request: vi.fn(),
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { remotePushEnabled: false } } } }));
vi.mock("expo-device", () => ({ isDevice: true }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Linking: { openURL: vi.fn() } }));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: native.permissions,
  requestPermissionsAsync: native.requestPermissions,
  getExpoPushTokenAsync: native.token,
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
}));
vi.mock("../../apps/mobile/src/data/resources", () => ({ request: native.request }));
vi.mock("../../apps/mobile/src/data/auth-provider", () => ({ apiOrigin: "https://www.stmarkministry.app" }));
vi.mock("../../apps/mobile/src/data/notification-navigation", () => ({ openNotificationRoute: vi.fn() }));

it("does not request remote push permissions or register a token while push is disabled", async () => {
  const { usePushNotificationRegistration } = await vi.importActual<{ usePushNotificationRegistration: (userId: string | undefined) => void }>("../../apps/mobile/src/data/push-notifications");
  const { unmount } = renderHook(() => usePushNotificationRegistration("signed-in-user"));
  await Promise.resolve();
  expect(native.permissions).not.toHaveBeenCalled();
  expect(native.requestPermissions).not.toHaveBeenCalled();
  expect(native.token).not.toHaveBeenCalled();
  expect(native.request).not.toHaveBeenCalled();
  unmount();
});
