import { Platform, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import type { SundaySchoolDashboard } from "@stmark/contracts";
import { Copy, Icon, ListSurface, Screen, SectionTitle, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { endpoint, useResource } from "@/data/resources";
import { ministryAccess } from "@/data/ministry";
import { groupClassesByAgeGroup } from "@/data/sunday-school-classes";
import { MinistryTintProvider, serifDisplay, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

export default function Classes() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <ClassesScreen />
    </MinistryTintProvider>
  );
}

function ClassesScreen() {
  const { colors } = useAppTheme();
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const access = ministryAccess(dashboard.data);
  const offline = dashboard.error === OFFLINE;

  const classes = dashboard.data?.classes ?? [];
  const groups = groupClassesByAgeGroup(classes, dashboard.data?.ageGroups ?? []);

  return (
    <>
      {/* The serif heading below carries the title, so the native large title stays off. */}
      <Stack.Screen
        options={{
          title: "",
          headerLargeTitle: false,
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="sundaySchool" />,
          // No native headerRight circular button here (the artboard's own
          // "+" button), unlike every pushed screen in this rebuild: this is
          // a tab-root screen under NativeTabs (expo-router's experimental
          // native tab bar), and confirmed live that a tab root's native
          // headerRight never renders here — not even a trivial, always-
          // present one — while every pushed screen's headerRight (Roster,
          // Lessons, Class detail, …) works the same way it always has. Home,
          // the other tab root in this app, independently reached the same
          // conclusion (its own headerRight is also unconditionally disabled
          // on iOS). "New class" is a real, working action (POST .../classes
          // exists and is used), so rather than drop it, it's a plain in-
          // content action below instead of the artboard's floating circle.
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen
        resetOnFocus
        refreshing={dashboard.loading || dashboard.refreshing}
        onRefresh={() => void dashboard.refresh()}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingHorizontal: 4 }}>
          <View style={{ gap: 2 }}>
            <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>Classes</Copy>
            {!!dashboard.data && (
              <Copy kind="caption">
                {dashboard.data.totals.classes} {dashboard.data.totals.classes === 1 ? "class" : "classes"} ·{" "}
                {dashboard.data.ageGroups.length} age {dashboard.data.ageGroups.length === 1 ? "group" : "groups"}
              </Copy>
            )}
          </View>
          {!!access.createLevels.length && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New class"
              onPress={() => router.push({ pathname: "/class/[id]", params: { id: "new" } })}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 12,
                height: 34,
                borderRadius: 17,
                backgroundColor: pressed ? colors.primarySoft : colors.hover,
              })}
            >
              <Icon ios="plus" android="add" size={14} color={colors.primary} />
              <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600" }}>New class</Copy>
            </Pressable>
          )}
        </View>

        {offline && dashboard.stale && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
            <Copy kind="caption">Showing the last list we had. Pull down to try again once you're back online.</Copy>
          </View>
        )}
        {!dashboard.stale && (
          <ResourceState loading={dashboard.loading} error={offline ? undefined : dashboard.error} retry={() => void dashboard.refresh()} />
        )}

        {dashboard.data && !classes.length && (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Copy kind="heading">No classes yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              Classes assigned to this account will appear here.
            </Copy>
          </View>
        )}

        {groups.map((group) => (
          <View key={group.key} style={{ gap: 10 }}>
            <SectionTitle title={group.name} />
            <ListSurface>
              {[...group.classes]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((cls, index, arr) => (
                  <Pressable
                    key={cls.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${cls.name}, ${cls.childCount} children, attendance ${cls.attendanceTakenThisWeek ? "taken" : "due"}`}
                    onPress={() => router.push({ pathname: "/class/[id]", params: { id: cls.id } })}
                    style={({ pressed }) => [
                      { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8, minHeight: 58 },
                      index < arr.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                      { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                    ]}
                  >
                    <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                      <Icon ios="person.2.fill" android="groups" size={17} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                      <Copy numberOfLines={1} style={{ fontWeight: "500" }}>{cls.name}</Copy>
                      <Copy kind="caption" numberOfLines={1}>
                        {cls.childCount} {cls.childCount === 1 ? "child" : "children"}
                        {cls.servants.length ? ` · ${cls.servants.length} ${cls.servants.length === 1 ? "servant" : "servants"}` : ""}
                      </Copy>
                    </View>
                    <StatusPill
                      label={!cls.canServe ? "View" : cls.attendanceTakenThisWeek ? "Taken" : "Due"}
                      color={!cls.canServe ? colors.muted : cls.attendanceTakenThisWeek ? colors.success : colors.warning}
                      soft={!cls.canServe ? colors.hover : cls.attendanceTakenThisWeek ? colors.successSoft : colors.warningSoft}
                    />
                    <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
                  </Pressable>
                ))}
            </ListSurface>
          </View>
        ))}
      </Screen>
    </>
  );
}
