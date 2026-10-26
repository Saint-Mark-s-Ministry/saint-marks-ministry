import { useState } from "react";
import { Pressable, Share, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import type { SFSymbol, AndroidSymbol } from "expo-symbols";
import type { SundaySchoolChild, SundaySchoolDashboard } from "@stmark/contracts";
import { compareAgeGroupsByLevel } from "@stmark/domain";
import { Copy, Icon, ListSurface, Screen, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { StudentHistoryButton } from "@/components/student-history-parts";
import { ChildAvatar, PhotoNoticeBanner, TakePhotoButton } from "@/components/child-photo-parts";
import { useLargeType } from "@/components/attendance-history-parts";
import { canChangeChildPhoto } from "@/data/child-photo";
import { PrepStudentBadge } from "@/components/prep-student-badge";
import { showsPrepStudentBadge, withPrepStudentSpoken } from "@/data/prep-student";
import { useChildPhotos } from "@/data/use-child-photos";
import { useAuth } from "@/data/auth-provider";
import { canEditChild } from "@/data/sunday-school-roster";
import { apiOrigin } from "@/data/auth-provider";
import { endpoint, query, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import { ministryAccess } from "@/data/ministry";
import { birthMonthYear, genderLabel, truncatedName } from "@/data/sunday-school-roster";
import { MinistryTintProvider, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const STATUS_OPTIONS = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
  { value: "", label: "All" },
];

export default function Roster() {
  const params = useLocalSearchParams<{ classId?: string }>();
  const { colors } = useAppTheme();
  const { classes } = usePortal();
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const [classId, setClassId] = useState(params.classId ?? (classes.length === 1 ? classes[0].id : ""));
  const [ageGroupId, setAgeGroupId] = useState("");
  const [status, setStatus] = useState("true");
  const [search, setSearch] = useState("");

  const resource = useResource<SundaySchoolChild[]>(`${endpoint("children")}?${query({ classId, isActive: status })}`);
  const { user, viewingAs } = useAuth();
  const large = useLargeType();
  // After the server confirms a photo, read the roster again so the row shows it.
  const photos = useChildPhotos(resource.refresh);
  const access = ministryAccess(dashboard.data, classes);
  const ageGroups = [...(dashboard.data?.ageGroups ?? [])].sort(compareAgeGroupsByLevel);
  const activeAgeGroup = ageGroups.find((g) => g.id === ageGroupId);

  const all = resource.data ?? [];
  const byAgeGroup = activeAgeGroup ? all.filter((c) => activeAgeGroup.levels.includes(c.level)) : all;
  const q = search.trim().toLowerCase();
  const filtered = q ? byAgeGroup.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q)) : byAgeGroup;

  const primaryClass = classes.find((c) => c.id === classId);
  const offline = resource.error === OFFLINE;

  const classActions: MenuAction[] = [
    { id: "", title: "All classes", state: classId === "" ? "on" : "off" },
    ...classes.map((c) => ({ id: c.id, title: c.name, state: classId === c.id ? "on" : "off" }) as MenuAction),
  ];
  const ageGroupActions: MenuAction[] = [
    { id: "", title: "All age groups", state: ageGroupId === "" ? "on" : "off" },
    ...ageGroups.map((g) => ({ id: g.id, title: g.name, state: ageGroupId === g.id ? "on" : "off" }) as MenuAction),
  ];
  const statusActions: MenuAction[] = STATUS_OPTIONS.map(
    (o) => ({ id: o.value, title: o.label, state: status === o.value ? "on" : "off" }) as MenuAction,
  );

  return (
    <MinistryTintProvider ministry="sundaySchool">
      {/* The large heading below carries the title; an empty bar title avoids repeating it. */}
      <Stack.Screen
        options={{
          title: "Roster",
          headerRight: () => (
            <View style={[styles.row, { gap: 14 }]}>
              <HeaderIconButton
                ios="square.and.arrow.up"
                android="share"
                label="Share sign-up link"
                onPress={() =>
                  void Share.share({
                    message: `Register your child for Sunday School at St. Mark: ${apiOrigin}/signup/parent`,
                  })
                }
              />
              {access.canAddChild && (
                <HeaderIconButton
                  ios="plus"
                  android="add"
                  label="Add child"
                  onPress={() => router.push({ pathname: "/child/[id]", params: { id: "new", classId } })}
                />
              )}
            </View>
          ),
        }}
      />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="stacked"
        hideWhenScrolling={false}
        placeholder="Search children"
        onChangeText={(event) => setSearch(event.nativeEvent.text)}
      />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        <View style={{ paddingHorizontal: 4, gap: 2 }}>
          <Copy kind="caption">
            {primaryClass?.name ?? "All classes"} · {filtered.length} {filtered.length === 1 ? "child" : "children"}
          </Copy>
        </View>

        {/* A single servant usually serves one or two classes — the artboard's own two-way
            toggle. Beyond that, a segmented control stops being usable, so it becomes a menu
            chip alongside age group and status instead. */}
        {classes.length > 0 && classes.length <= 2 && (
          <SegmentedControl
            values={[...classes.map((c) => c.name), "All classes"]}
            selectedIndex={classes.findIndex((c) => c.id === classId)}
            onChange={({ nativeEvent }) =>
              setClassId(
                nativeEvent.selectedSegmentIndex < classes.length ? classes[nativeEvent.selectedSegmentIndex].id : "",
              )
            }
            style={{ width: "100%", minHeight: 36 }}
          />
        )}

        <View style={[styles.row, { gap: 10, flexWrap: "wrap", flexDirection: large ? "column" : "row", alignItems: large ? "flex-start" : "center" }]}>
          {classes.length > 2 && (
            <MenuView
              style={{ minHeight: large ? 100 : 44, alignSelf: "flex-start" }}
              title="Class"
              actions={classActions}
              onPressAction={({ nativeEvent }) => setClassId(nativeEvent.event)}
            >
              <FilterChip label={primaryClass?.name ?? "All classes"} />
            </MenuView>
          )}
          {ageGroups.length > 1 && (
            <MenuView
              style={{ minHeight: large ? 100 : 44, alignSelf: "flex-start" }}
              title="Age group"
              actions={ageGroupActions}
              onPressAction={({ nativeEvent }) => setAgeGroupId(nativeEvent.event)}
            >
              <FilterChip label={activeAgeGroup?.name ?? "Age group"} />
            </MenuView>
          )}
          <MenuView
            style={{ minHeight: large ? 100 : 44, alignSelf: "flex-start" }}
            title="Roster"
            actions={statusActions}
            onPressAction={({ nativeEvent }) => setStatus(nativeEvent.event)}
          >
            <FilterChip label={STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "Roster"} />
          </MenuView>
        </View>

        <PhotoNoticeBanner
          notice={photos.notice}
          uploading={photos.busyId ? "Saving photo…" : null}
          onDismiss={photos.dismiss}
          onChoose={(target) => void photos.choosePhoto(target)}
          onOpenSettings={photos.openSettings}
        />

        {offline && resource.stale && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
            <Copy kind="caption">Showing the last roster we had. Pull down to try again once you're back online.</Copy>
          </View>
        )}
        {!resource.stale && <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />}

        {resource.data && !filtered.length && (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Copy kind="heading">{all.length ? "No children match" : "No children yet"}</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              {all.length ? "Try a different class, age group, or search." : "Children added to this roster will appear here."}
            </Copy>
          </View>
        )}

        {!!filtered.length && (
          <ListSurface>
            {filtered.map((child, index, arr) => {
              const subtitle = [
                genderLabel(child.gender),
                child.birthDate ? `born ${birthMonthYear(child.birthDate)}` : null,
                !child.isActive ? "Inactive" : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <View
                  key={child.id}
                  style={[
                    { flexDirection: large ? "column" : "row", alignItems: large ? "stretch" : "center", minHeight: 62 },
                    index < arr.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${withPrepStudentSpoken(`${child.firstName} ${child.lastName}`, child)}${!child.isActive ? ", inactive" : ""}`}
                    onPress={() => router.push({ pathname: "/child/[id]", params: { id: child.id } })}
                    style={({ pressed }) => [
                      { flex: large ? undefined : 1, width: large ? "100%" : undefined, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: large ? 16 : 0, paddingVertical: 10, minHeight: 62 },
                      { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                    ]}
                  >
                    {!large && <ChildAvatar child={child} name={`${child.firstName} ${child.lastName}`} size={40} />}
                    <View style={{ flex: 1, gap: 1, justifyContent: "center" }}>
                      <Copy numberOfLines={large ? undefined : 1} style={{ fontWeight: "500" }}>{truncatedName(child.firstName, child.lastName)}</Copy>
                      {/* An empty caption still renders a blank line, taller than the name alone —
                          that extra height is what pushed the name up off-center against the avatar. */}
                      {!!subtitle && <Copy kind="caption" numberOfLines={1}>{subtitle}</Copy>}
                      {showsPrepStudentBadge(child) && (
                        <View style={{ marginTop: 3 }}>
                          <PrepStudentBadge />
                        </View>
                      )}
                    </View>
                    <Icon ios="chevron.right" android="chevron_right" size={16} color={colors.muted} />
                  </Pressable>
                  {/* Their own controls beside the row: the row opens the profile, the camera takes a photo, the clock opens history. */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: large ? 16 : 8, paddingBottom: large ? 10 : 0 }}>
                    {canChangeChildPhoto({ canEdit: canEditChild(child, classes, access.admin), isActive: child.isActive, viewingAs: !!viewingAs }) && (
                      <TakePhotoButton
                        name={`${child.firstName} ${child.lastName}`}
                        busy={photos.busyId === child.id}
                        onPress={() => void photos.takePhoto({ id: child.id, name: `${child.firstName} ${child.lastName}` })}
                      />
                    )}
                    <StudentHistoryButton childId={child.id} name={`${child.firstName} ${child.lastName}`} />
                  </View>
                </View>
              );
            })}
          </ListSurface>
        )}
      </Screen>
    </MinistryTintProvider>
  );
}

/**
 * A nav-bar icon button with its own visible resting background. Two bare
 * Pressables side by side get swallowed into one shared system capsule on
 * iOS 27 (Liquid Glass groups whatever headerRight returns as one view) —
 * giving each its own circle keeps them reading as two distinct buttons.
 */
function HeaderIconButton({ ios, android, label, onPress }: { ios: SFSymbol; android: AndroidSymbol; label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.primarySoft : colors.hover,
      })}
    >
      <Icon ios={ios} android={android} size={18} />
    </Pressable>
  );
}

function FilterChip({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: pressed ? colors.hover : colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 36 },
      ]}
    >
      <Copy kind="caption" style={{ fontWeight: "600" }}>{label}</Copy>
      <Icon ios="chevron.up.chevron.down" android="unfold_more" size={12} color={colors.muted} />
    </Pressable>
  );
}
