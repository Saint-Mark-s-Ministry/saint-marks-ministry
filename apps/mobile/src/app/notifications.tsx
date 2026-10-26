import { Alert, Linking, Platform, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import {
  Card,
  Copy,
  Icon,
  ConnectionBadge,
  RowLink,
  Screen,
  StatusPill,
} from "@/components/ui";
import { usePortal } from "@/data/portal-provider";
import { DataStatus } from "@/components/data-status";
import { useAppTheme } from "@/theme";
import { apiOrigin } from "@/data/auth-provider";
import { lessonReminderLessonId, resolveNotificationRoute } from "@/data/notification-routes";
import { attendanceReminderFromMetadata } from "@/data/attendance-reminders";
import { absenceDisplay, parseAbsenceMetadata } from "@/data/absence-notifications";
import { useLargeType } from "@/components/attendance-history-parts";
import { openNotificationRoute } from "@/data/notification-navigation";

export default function Notifications() {
  const { colors } = useAppTheme();
  const { notifications, markRead, loading, error, refresh } = usePortal();
  // At the largest text sizes the decorative icon takes width the title needs.
  const large = useLargeType();
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
              icon={large ? undefined : lessonReminderLessonId(item.metadata) ? <Icon ios="book.closed" android="menu_book" /> : attendanceReminderFromMetadata(item.metadata) ? <Icon ios="checklist" android="checklist" /> : parseAbsenceMetadata(item.metadata) ? <Icon ios="exclamationmark.bubble" android="warning" /> : <Icon ios="bell" android="notifications" />}
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
                const route = resolveNotificationRoute({ url: item.url, type: item.type, metadata: item.metadata });
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
            <AbsenceTags metadata={item.metadata} />
            <Copy kind="caption">
              {item.isPersistent
                ? "Action required · Tap to continue"
                : resolveNotificationRoute({ url: item.url, type: item.type, metadata: item.metadata })
                  ? lessonReminderLessonId(item.metadata)
                    ? "Tap to open the lesson"
                    : item.isRead
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

/**
 * The server's absence details, as they arrive in the notification: whether this
 * is the follow-up for class staff or the escalation, and how many consecutive
 * weeks. Nothing here is counted on the device.
 */
function AbsenceTags({ metadata }: { metadata: unknown }) {
  const { colors } = useAppTheme();
  const absence = parseAbsenceMetadata(metadata);
  if (!absence) return null;
  const display = absenceDisplay(absence);
  const escalation = display.tone === "escalation";
  return (
    <View accessible accessibilityLabel={display.spoken} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      <StatusPill label={display.tag} color={escalation ? colors.danger : colors.warning} soft={escalation ? colors.dangerSoft : colors.warningSoft} />
      <StatusPill label={display.weeksText} color={colors.muted} soft={colors.hover} />
    </View>
  );
}
