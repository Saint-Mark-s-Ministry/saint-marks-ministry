import { Alert, Linking, Platform, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import {
  Card,
  Copy,
  Icon,
  ConnectionBadge,
  RowLink,
  Screen,
} from "@/components/ui";
import { usePortal } from "@/data/portal-provider";
import { DataStatus } from "@/components/data-status";
import { useAppTheme } from "@/theme";
import { apiOrigin } from "@/data/auth-provider";
import { resolveNotificationRoute } from "@/data/notification-routes";
import { openNotificationRoute } from "@/data/notification-navigation";

export default function Notifications() {
  const { colors } = useAppTheme();
  const { notifications, markRead, loading, error, refresh } = usePortal();
  const openRequiredAction = async (url?: string | null) => {
    if (!url) {
      Alert.alert("Action required", "Complete this action in the ministry portal.");
      return;
    }
    try {
      await Linking.openURL(new URL(url, `${apiOrigin}/`).toString());
    } catch {
      Alert.alert("Unable to open the portal", "Please try again from the website.");
    }
  };
  return (
    <>
      <Stack.Screen
        options={{
          headerRight:
            Platform.OS === "android"
              ? () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close notifications"
                    onPress={() => router.back()}
                    style={{
                      minWidth: 44,
                      minHeight: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon ios="xmark" android="close" />
                  </Pressable>
                )
              : undefined,
        }}
      />
      {Platform.OS === "ios" && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel="Close notifications"
            icon="xmark"
            onPress={() => router.back()}
          />
        </Stack.Toolbar>
      )}
      <Screen refreshing={loading} onRefresh={() => void refresh()}>
        <ConnectionBadge />
        <DataStatus />
        {!loading && !error && !notifications.length && (
          <Card>
            <Copy>No notifications.</Copy>
          </Card>
        )}
        {notifications.map((item) => (
          <Card key={item.id}>
            <RowLink
              title={item.title}
              subtitle={item.body}
              icon={<Icon ios="bell" android="notifications" />}
              trailing={
                !item.isRead ? (
                  <View
                    accessibilityLabel="Unread"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.action,
                    }}
                  />
                ) : undefined
              }
              onPress={() => {
                const route = resolveNotificationRoute({ url: item.url, type: item.type });
                if (item.isPersistent) {
                  // Persistent ones can't be marked read; they clear when the
                  // action is done. Open it in the app when we can.
                  if (route) openNotificationRoute(route, { fromSheet: true });
                  else void openRequiredAction(item.url);
                  return;
                }
                const read = item.isRead ? Promise.resolve() : markRead(item.id);
                if (route) {
                  // Never make the person wait on, or lose, the destination
                  // because the read receipt failed.
                  void read.catch(() => undefined);
                  openNotificationRoute(route, { fromSheet: true });
                  return;
                }
                void read.catch((error) =>
                  Alert.alert(
                    "Unable to update notification",
                    error instanceof Error ? error.message : "Try again.",
                  ),
                );
              }}
            />
            <Copy kind="caption">
              {item.isPersistent
                ? "Action required · Tap to continue"
                : resolveNotificationRoute({ url: item.url, type: item.type })
                  ? item.isRead
                    ? "Tap to open"
                    : "Tap to open and mark as read"
                  : item.isRead
                    ? "Read"
                    : "Tap to mark as read"}
            </Copy>
          </Card>
        ))}
      </Screen>
    </>
  );
}
