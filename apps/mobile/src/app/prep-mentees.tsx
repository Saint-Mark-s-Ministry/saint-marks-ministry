import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { MenuView } from "@expo/ui/community/menu";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Copy, Icon, InitialsAvatar, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import {
  canViewMentees,
  filterMentees,
  formatPercent,
  graduationCounts,
  isAdminLike,
  riskLabel,
  searchMentees,
  sortMentees,
  type MenteeFilter,
  type MenteeSort,
  type StudentAnalyticsFlat,
} from "@/data/prep-mentor";

const FILTERS: { value: MenteeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "atRisk", label: "At risk" },
  { value: "onTrack", label: "On track" },
];
const SORT_LABELS: Record<MenteeSort, string> = { risk: "Risk", name: "Name", attendance: "Attendance", exam: "Exam average" };

export default function PrepMentees() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewMentees(user?.role);
  const isAdmin = isAdminLike(user?.role);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MenteeFilter>("all");
  const [sort, setSort] = useState<MenteeSort>("risk");

  // No studentIds: auto-scopes to the signed-in mentor's own mentees server-side.
  const analytics = useResource<(StudentAnalyticsFlat & { studentName: string })[]>(canView ? "/api/students/analytics/batch" : null);

  const offline = analytics.error === "Could not reach the server. Check your connection and try again.";
  const all = analytics.data ?? [];
  const withName = all.map((r) => ({ ...r, name: r.studentName }));
  const filtered = filterMentees(withName, filter);
  const searched = searchMentees(filtered, search);
  const rows = sortMentees(searched, sort);
  const counts = graduationCounts(all);

  return (
    <>
      <Stack.Screen
        options={{
          title: isAdmin ? "Students" : "My mentees",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
          headerRight: () => (
            <MenuView
              title="Sort by"
              actions={(Object.keys(SORT_LABELS) as MenteeSort[]).map((s) => ({ id: s, title: SORT_LABELS[s], state: sort === s ? "on" : "off" }))}
              onPressAction={({ nativeEvent }) => setSort(nativeEvent.event as MenteeSort)}
            >
              <Pressable accessibilityRole="button" accessibilityLabel="Sort" hitSlop={8}>
                <Icon ios="arrow.up.arrow.down" android="sort" size={20} />
              </Pressable>
            </MenuView>
          ),
        }}
      />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="automatic"
        placeholder="Search mentees"
        onChangeText={(event) => setSearch(event.nativeEvent.text)}
      />
      <Screen refreshing={analytics.loading} onRefresh={() => void analytics.refresh()}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>This list is for mentors and admins.</Copy>
          </View>
        )}

        {canView && (
          <>
            <Copy kind="caption">{all.length} {all.length === 1 ? "mentee" : "mentees"}</Copy>

            {offline && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.danger}>You're offline</Copy>
                <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
              </View>
            )}
            {!offline && <ResourceState loading={analytics.loading} error={analytics.error} retry={() => void analytics.refresh()} />}

            {analytics.data && !all.length && (
              <Copy>{isAdmin ? "No active enrollments yet." : "You have no mentees assigned yet. Contact an administrator to get mentees assigned to you."}</Copy>
            )}

            {!!all.length && (
              <SegmentedControl
                values={FILTERS.map((f) => f.label)}
                selectedIndex={FILTERS.findIndex((f) => f.value === filter)}
                onChange={({ nativeEvent }) => setFilter(FILTERS[nativeEvent.selectedSegmentIndex]?.value ?? "all")}
                style={{ width: "100%", minHeight: 36 }}
              />
            )}

            {all.length > 0 && !rows.length && <Copy>No mentees match "{search}".</Copy>}

            {!!rows.length && (
              <ListSurface>
                {rows.map((r, index) => (
                  <Pressable
                    key={r.studentId}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: "/prep-mentee/[id]", params: { id: r.studentId } })}
                    style={({ pressed }) => [
                      styles.compactRow,
                      index < rows.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                      { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                    ]}
                  >
                    <InitialsAvatar name={r.name} variant="neutral" />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Copy style={{ fontWeight: "500" }} numberOfLines={1}>{r.name}</Copy>
                      <Copy kind="caption" numberOfLines={1}>
                        Attend {formatPercent(r.attendancePercentage)} · Exam {formatPercent(r.examAverage)}
                      </Copy>
                    </View>
                    <StatusPill
                      label={riskLabel(r.graduationEligible)}
                      color={r.graduationEligible ? colors.success : colors.danger}
                      soft={r.graduationEligible ? colors.successSoft : colors.dangerSoft}
                    />
                  </Pressable>
                ))}
              </ListSurface>
            )}

            {!!all.length && (
              <View style={{ gap: 10 }}>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>Graduation requirements</Copy>
                <ListSurface>
                  <View style={[styles.compactRow, { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
                    <Copy style={{ flex: 1 }}>Attendance ≥ 75%</Copy>
                    <Copy kind="caption">{counts.attendance.met} of {counts.attendance.total} mentees</Copy>
                  </View>
                  <View style={styles.compactRow}>
                    <Copy style={{ flex: 1 }}>Exam average ≥ 75%</Copy>
                    <Copy kind="caption">{counts.exam.met} of {counts.exam.total} mentees</Copy>
                  </View>
                </ListSurface>
              </View>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
