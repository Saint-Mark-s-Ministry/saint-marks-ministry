import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import type { SundaySchoolDashboard, SundaySchoolPinnedClassesResponse } from "@stmark/contracts";
import { Copy, Icon, ListSurface, Screen, SectionTitle, StatusPill } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { endpoint, useResource } from "@/data/resources";
import { ministryAccess } from "@/data/ministry";
import { groupClassesByAgeGroup } from "@/data/sunday-school-classes";
import { filterClassesByPins } from "@/data/sunday-school-pinned-classes";
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
  const { colors, isDark } = useAppTheme();
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const access = ministryAccess(dashboard.data);
  const offline = dashboard.error === OFFLINE;

  // SUPER_ADMIN view preference: default to their chosen "main" classes
  // rather than every class in the ministry. Never consulted for anything
  // but which rows render — every class here is already one this account
  // may view and act on.
  const pinned = useResource<SundaySchoolPinnedClassesResponse>(access.admin ? endpoint("pinned-classes") : null);
  const pinnedClassIds = pinned.data?.classIds ?? [];
  const [showAll, setShowAll] = useState(false);
  const showPinnedToggle = access.admin && pinnedClassIds.length > 0;

  const allClasses = dashboard.data?.classes ?? [];
  const classes = showPinnedToggle && !showAll ? filterClassesByPins(allClasses, pinnedClassIds) : allClasses;
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
                {classes.length} {classes.length === 1 ? "class" : "classes"}
                {showPinnedToggle && !showAll ? ` of ${dashboard.data.totals.classes}` : ""} ·{" "}
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

        {showPinnedToggle && (
          <SegmentedControl
            values={["My classes", "All classes"]}
            selectedIndex={showAll ? 1 : 0}
            appearance={isDark ? "dark" : "light"}
            tintColor={colors.primary}
            onChange={({ nativeEvent }) => setShowAll(nativeEvent.selectedSegmentIndex === 1)}
            style={{ width: "100%", minHeight: 36 }}
          />
        )}
        {access.admin && (
          <Pressable accessibilityRole="button" onPress={() => router.push("/main-classes")}>
            <Copy kind="caption" color={colors.primary}>
              {pinnedClassIds.length ? "Edit my main classes" : "Choose your main classes"}
            </Copy>
          </Pressable>
        )}

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
            <Copy kind="heading">{showPinnedToggle && !showAll ? "None of your main classes remain" : "No classes yet"}</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              {showPinnedToggle && !showAll
                ? "They may have moved to a new academic year. Switch to All classes, or update your picks."
                : "Classes assigned to this account will appear here."}
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
