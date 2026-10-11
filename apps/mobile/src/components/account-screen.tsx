import { Linking, Platform, Pressable, View } from "react-native";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { router, Stack } from "expo-router";
import {
  Button,
  ConnectionBadge,
  Copy,
  Icon,
  InitialsAvatar,
  RowLink,
  Screen,
  SectionTitle,
  StatusPill,
} from "@/components/ui";
import { apiOrigin, dataLabel, useAuth } from "@/data/auth-provider";
import { usePortal } from "@/data/portal-provider";
import { useResource } from "@/data/resources";
import { ministryAccessSummary, roleLabel, sortAcademicYears, type AcademicYearLike } from "@/data/account";
import { serifDisplay, useAppTheme, type AppearancePreference } from "@/theme";

export function AccountScreen() {
  const { colors, isDark, preference, setPreference } = useAppTheme();
  const { user, signOut } = useAuth();
  const { refresh, loading } = usePortal();
  const years = useResource<AcademicYearLike[]>("/api/academic-years");
  const activeYear = sortAcademicYears(years.data ?? []).find((y) => y.isActive);

  return (
    <>
      <Stack.Screen
        options={{
          title: "My account",
          headerLargeTitle: false,
          headerRight:
            Platform.OS === "android"
              ? () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close account"
                    onPress={() => router.back()}
                    style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                  >
                    <Icon ios="xmark" android="close" />
                  </Pressable>
                )
              : undefined,
        }}
      />
      {Platform.OS === "ios" && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button accessibilityLabel="Close account" icon="xmark" onPress={() => router.back()} />
        </Stack.Toolbar>
      )}
      <Screen>
        <View style={{ alignItems: "center", gap: 8, paddingTop: 8 }}>
          <InitialsAvatar name={user?.name} size={76} />
          <Copy style={{ fontFamily: serifDisplay, fontSize: 26, lineHeight: 30, fontWeight: "500" }}>
            {user?.name ?? "Ministry account"}
          </Copy>
          {user?.email && <Copy kind="caption">{user.email}</Copy>}
          {user?.role && <StatusPill label={roleLabel(user.role)} color={colors.primary} soft={colors.primarySoft} />}
          {user && <Copy kind="caption">{ministryAccessSummary(user)}</Copy>}
        </View>

        <ConnectionBadge />

        <View style={{ gap: 10 }}>
          <RowLink
            title="Name"
            subtitle={user?.name ?? undefined}
            icon={<Icon ios="pencil" android="edit" size={16} color={colors.text2} />}
            onPress={() => router.push("/profile")}
          />
          <View style={{ height: 0.5, backgroundColor: colors.border }} />
          <RowLink
            title="Change password"
            icon={<Icon ios="lock.shield" android="lock" size={16} color={colors.text2} />}
            onPress={() => router.push("/change-password")}
          />
        </View>

        <View style={{ gap: 10 }}>
          <RowLink
            title="Notifications"
            subtitle="Notification history"
            icon={<Icon ios="bell" android="notifications" size={16} color={colors.warning} />}
            onPress={() => router.push("/notifications")}
          />
        </View>

        <SectionTitle title="Appearance" />
        <SegmentedControl
          values={["System", "Light", "Dark"]}
          selectedIndex={(["system", "light", "dark"] as const).indexOf(preference)}
          appearance={isDark ? "dark" : "light"}
          tintColor={colors.primary}
          onChange={({ nativeEvent }) =>
            setPreference((["system", "light", "dark"] as AppearancePreference[])[nativeEvent.selectedSegmentIndex] ?? "system")
          }
          style={{ width: "100%", minHeight: 36 }}
        />

        <RowLink
          title="Academic years"
          subtitle={activeYear ? `${activeYear.name} active` : "View and switch the active year"}
          icon={<Icon ios="calendar" android="calendar_month" size={16} color={colors.warning} />}
          onPress={() => router.push("/academic-years")}
        />

        {user?.role === "SUPER_ADMIN" && (
          <RowLink
            title="My main classes"
            subtitle="Which classes the Classes screen shows by default"
            icon={<Icon ios="star" android="star" size={16} color={colors.warning} />}
            onPress={() => router.push("/main-classes")}
          />
        )}

        <View style={{ gap: 10 }}>
          <RowLink
            title="Privacy Policy"
            icon={<Icon ios="doc.text" android="description" size={16} color={colors.text2} />}
            onPress={() => void Linking.openURL(`${apiOrigin}/privacy`)}
          />
          <View style={{ height: 0.5, backgroundColor: colors.border }} />
          <RowLink
            title="Terms of Service"
            icon={<Icon ios="doc.text" android="description" size={16} color={colors.text2} />}
            onPress={() => void Linking.openURL(`${apiOrigin}/terms`)}
          />
        </View>

        {user?.role === "SUPER_ADMIN" && (
          <>
            <SectionTitle title="Connected portal" />
            <Copy>{dataLabel}</Copy>
            <Copy kind="caption">{apiOrigin}</Copy>
          </>
        )}

        <Button label={loading ? "Refreshing…" : "Refresh ministry data"} secondary disabled={loading} onPress={() => void refresh()} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => void signOut()}
          style={{ height: 52, borderRadius: 24, alignItems: "center", justifyContent: "center" }}
        >
          <Copy style={{ color: colors.danger, fontWeight: "600", fontSize: 17 }}>Sign out</Copy>
        </Pressable>

        <Copy kind="caption" style={{ textAlign: "center" }}>
          St. Mark Ministry Portal · 0.1.0
        </Copy>
      </Screen>
    </>
  );
}
