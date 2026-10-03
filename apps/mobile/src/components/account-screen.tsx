import { Platform, Pressable, View } from "react-native";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { router, Stack } from "expo-router";
import {
  Brand,
  Button,
  Card,
  Copy,
  CopyableValue,
  Icon,
  ConnectionBadge,
  RowLink,
  Screen,
  SectionTitle,
  styles,
} from "@/components/ui";
import { apiOrigin, dataLabel, useAuth } from "@/data/auth-provider";
import { usePortal } from "@/data/portal-provider";
import { useAppTheme, type AppearancePreference } from "@/theme";

export function AccountScreen() {
  const { colors, isDark, preference, setPreference } = useAppTheme();
  const { user, signOut } = useAuth();
  const { refresh, loading } = usePortal();
  return (
    <>
      <Stack.Screen
        options={{
          title: "Account",
          headerRight:
            Platform.OS === "android"
              ? () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close account"
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
            accessibilityLabel="Close account"
            icon="xmark"
            onPress={() => router.back()}
          />
        </Stack.Toolbar>
      )}
      <Screen>
        <Brand />
        <ConnectionBadge />
        <Card>
          <View style={styles.row}>
            <Icon
              ios="person.crop.circle.fill"
              android="account_circle"
              size={48}
            />
            <View style={{ flex: 1 }}>
              <Copy kind="heading">{user?.name ?? "Ministry account"}</Copy>
              {user?.email && (
                <CopyableValue
                  label="Email"
                  value={user.email}
                  kind="caption"
                />
              )}
            </View>
          </View>
        </Card>
        <Button
          secondary
          label="Edit profile & security"
          onPress={() => router.push("/profile")}
        />
        <SectionTitle title="Appearance" />
        <Card>
          <SegmentedControl
            values={["System", "Light", "Dark"]}
            selectedIndex={(["system", "light", "dark"] as const).indexOf(
              preference,
            )}
            appearance={isDark ? "dark" : "light"}
            tintColor={colors.primary}
            onChange={({ nativeEvent }) =>
              setPreference(
                (["system", "light", "dark"] as AppearancePreference[])[
                  nativeEvent.selectedSegmentIndex
                ] ?? "system",
              )
            }
            style={{ width: "100%", minHeight: 36 }}
          />
        </Card>
        <Card>
          <RowLink
            title="Notifications"
            subtitle="Notification history"
            icon={<Icon ios="bell" android="notifications" />}
            onPress={() => router.push("/notifications")}
          />
        </Card>
        <Card>
          <RowLink
            title="Academic years"
            subtitle="Manage years for lessons and exams"
            icon={<Icon ios="calendar" android="calendar_month" />}
            onPress={() => router.push("/academic-years")}
          />
        </Card>
        {user?.role === "SUPER_ADMIN" && (
          <>
            <SectionTitle title="Connected portal" />
            <Card>
              <Copy>{dataLabel}</Copy>
              <Copy kind="caption">{apiOrigin}</Copy>
            </Card>
          </>
        )}
        <Button
          label={loading ? "Refreshing…" : "Refresh ministry data"}
          secondary
          disabled={loading}
          onPress={() => void refresh()}
        />
        <Button label="Sign out" onPress={() => void signOut()} />
        <Copy kind="caption" style={{ textAlign: "center" }}>
          St. Mark Ministry Portal · 0.1.0
        </Copy>
      </Screen>
    </>
  );
}
