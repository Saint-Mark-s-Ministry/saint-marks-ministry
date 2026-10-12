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
                if (item.isPersistent) {
                  void openRequiredAction(item.url);
                  return;
                }
                void markRead(item.id).catch((error) =>
                  Alert.alert(
                    "Unable to update notification",
                    error instanceof Error ? error.message : "Try again.",
                  ),
                );
              }}
            />
            <Copy kind="caption">
              {item.isPersistent ? "Action required · Tap to continue" : item.isRead ? "Read" : "Tap to mark as read"}
            </Copy>
          </Card>
        ))}
      </Screen>
    </>
  );
}
