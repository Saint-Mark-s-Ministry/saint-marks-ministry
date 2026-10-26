import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import type { SundaySchoolVisitationsResponse } from "@stmark/contracts";
import { Copy, Icon, InitialsAvatar, ListSurface, Screen, SectionTitle, StatusPill, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { StudentHistoryButton } from "@/components/student-history-parts";
import { PriorityNoticeBanner, PriorityPill, PriorityStar } from "@/components/priority-parts";
import { useAuth } from "@/data/auth-provider";
import { useLargeType } from "@/components/attendance-history-parts";
import { useVisitationPriority } from "@/data/use-visitation-priority";
import {
  PRIORITY_FILTER_LABEL,
  applyPriorityOverrides,
  canEditPriority,
  filterByPriority,
  priorityCount,
} from "@/data/visitation-priority";
import { endpoint, query, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import {
  filterByStatus,
  flattenVisitationChildren,
  matchesSearch,
  rowSubtitle,
  sortFlatChildren,
  visitationSummary,
  visitationTone,
  type ChildSort,
  type StatusFilter,
} from "@/data/sunday-school-visitations";
import { MinistryTintProvider, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "notDone", label: "Not done" },
  { value: "done", label: "Done" },
];
// "due"/"recent" (this ticket's own words) have no due-date field in the real
// schema to sort by — see sunday-school-visitations.ts's own note. This sort
// chip is the honest mapping: surfacing who still needs a visit, or who was
// seen most recently, without a status tab for something the data can't back.
const SORT_LABEL: Record<ChildSort, string> = { name: "Name (A–Z)", due: "Needs a visit first", recent: "Most recently visited" };
const SORTS: ChildSort[] = ["name", "due", "recent"];

export default function Visitations() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <VisitationsScreen />
    </MinistryTintProvider>
  );
}

function VisitationsScreen() {
  const { colors } = useAppTheme();
  const { classes } = usePortal();
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<ChildSort>("name");
  const [search, setSearch] = useState("");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const { viewingAs } = useAuth();
  const large = useLargeType();

  const resource = useResource<SundaySchoolVisitationsResponse>(`${endpoint("visitations")}?${query({ classId })}`);
  const offline = resource.error === OFFLINE;

  const priority = useVisitationPriority(resource.refresh);
  // A tap shows at once; the server's answer replaces it after the save.
  const allRows = useMemo(
    () => flattenVisitationChildren(applyPriorityOverrides(resource.data?.classes ?? [], priority.overrides)),
    [resource.data, priority.overrides],
  );
  const priorityTotal = priorityCount(allRows);
  const summary = visitationSummary(allRows.map((r) => r.child));
  const primaryClass = classes.find((c) => c.id === classId);

  let rows = search.trim() ? allRows.filter((r) => matchesSearch(r.child, search)) : allRows;
  rows = filterByStatus(rows, status);
  rows = filterByPriority(rows, priorityOnly);
  rows = sortFlatChildren(rows, sort);

  const classActions: MenuAction[] = [
    { id: "", title: "All accessible classes", state: classId === "" ? "on" : "off" },
    ...classes.map((c) => ({ id: c.id, title: c.name, state: c.id === classId ? "on" : "off" }) as MenuAction),
  ];
  const sortActions: MenuAction[] = SORTS.map(
    (s) => ({ id: s, title: SORT_LABEL[s], state: sort === s ? "on" : "off" }) as MenuAction,
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Visitations",
          // No header "+" for a new entry here (unlike the artboard's own
          // floating header circle) — a new entry always belongs to one
          // specific child, so it lives on that child's own detail screen
          // (which has the real, fully-working "New entry" action) instead
          // of inventing a child-picker step this list screen doesn't need.
        }}
      />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="stacked"
        hideWhenScrolling={false}
        placeholder="Find a child"
        onChangeText={(event) => setSearch(event.nativeEvent.text)}
      />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        <View style={{ paddingHorizontal: 4, gap: 2 }}>
          <Copy kind="caption">{primaryClass?.name ?? "All accessible classes"}</Copy>
        </View>

        {classes.length > 0 && classes.length <= 2 && (
          <SegmentedControl
            values={[...classes.map((c) => c.name), "All classes"]}
            selectedIndex={classId ? classes.findIndex((c) => c.id === classId) : classes.length}
            onChange={({ nativeEvent }) =>
              setClassId(nativeEvent.selectedSegmentIndex < classes.length ? classes[nativeEvent.selectedSegmentIndex].id : "")
            }
            style={{ width: "100%", minHeight: 36 }}
          />
        )}
        {classes.length > 2 && (
          <MenuView title="Class" actions={classActions} onPressAction={({ nativeEvent }) => setClassId(nativeEvent.event)}>
            <FilterChip label={primaryClass?.name ?? "All classes"} />
          </MenuView>
        )}

        {!!resource.data && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <KpiTile label="Children" value={`${summary.total}`} />
            <KpiTile label="Visited" value={`${summary.done}`} color={colors.success} />
            <KpiTile label="Not done" value={`${summary.notDone}`} color={colors.warning} />
          </View>
        )}

        <SegmentedControl
          values={STATUS_OPTIONS.map((o) => o.label)}
          selectedIndex={STATUS_OPTIONS.findIndex((o) => o.value === status)}
          onChange={({ nativeEvent }) => setStatus(STATUS_OPTIONS[nativeEvent.selectedSegmentIndex].value)}
          style={{ width: "100%", minHeight: 36 }}
        />

        <View style={[styles.row, { gap: 10 }]}>
          <MenuView title="Sort" style={{ minHeight: large ? 110 : 44, alignSelf: "flex-start" }} actions={sortActions} onPressAction={({ nativeEvent }) => setSort(nativeEvent.event as ChildSort)}>
            <FilterChip label={SORT_LABEL[sort]} />
          </MenuView>
        </View>

        <View style={{ flexDirection: "row" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${PRIORITY_FILTER_LABEL}, ${priorityTotal}`}
            accessibilityState={{ selected: priorityOnly }}
            onPress={() => setPriorityOnly((on) => !on)}
            style={({ pressed }) => [
              styles.pill,
              {
                minHeight: 36,
                borderWidth: 1,
                borderColor: priorityOnly ? colors.warning : colors.border,
                backgroundColor: priorityOnly ? colors.warningSoft : pressed ? colors.hover : colors.surface,
              },
            ]}
          >
            <Icon ios={priorityOnly ? "star.fill" : "star"} android={priorityOnly ? "star" : "star_border"} size={12} color={priorityOnly ? colors.warning : colors.muted} />
            <Copy kind="caption" color={priorityOnly ? colors.warning : colors.text} style={{ fontWeight: "600" }}>
              {PRIORITY_FILTER_LABEL} · {priorityTotal}
            </Copy>
          </Pressable>
        </View>

        <PriorityNoticeBanner notice={priority.notice} onDismiss={priority.dismiss} />

        {offline && resource.stale && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
            <Copy kind="caption">Showing the last list we had. Pull down to try again once you're back online.</Copy>
          </View>
        )}
        {!resource.stale && (
          <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />
        )}

        {resource.data && !rows.length && (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Copy kind="heading">
              {priorityOnly && !priorityTotal ? "No priority visits" : allRows.length ? "No children match" : "No children yet"}
            </Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              {priorityOnly && !priorityTotal
                ? "Star a child to add them to your class team's shared follow-up list."
                : allRows.length
                  ? "Try another class, status, or search."
                  : "Children in an accessible class will appear here."}
            </Copy>
          </View>
        )}

        {!!rows.length && (
          <View style={{ gap: 10 }}>
            <SectionTitle title="Children" subtitle={`${rows.length} ${rows.length === 1 ? "child" : "children"}`} />
            <ListSurface>
              {rows.map((row, index, arr) => {
                const tone = visitationTone(row.child);
                const childName = `${row.child.firstName} ${row.child.lastName}`;
                const canStar = canEditPriority({ classCanEdit: row.canEdit, viewingAs: !!viewingAs });
                const pill = tone === "done" ? { color: colors.success, soft: colors.successSoft, label: "Done" } : { color: colors.warning, soft: colors.warningSoft, label: "Not done" };
                return (
                  <View key={row.child.id}>
                    {/* At the largest text sizes the name cannot share a line with the avatar and two buttons: stack the buttons under the row and leave out the decorative avatar. */}
                    <View style={{ flexDirection: large ? "column" : "row", alignItems: large ? "stretch" : "center" }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${childName}, ${pill.label}${row.child.visitationPriority ? ", priority visit" : ""}`}
                        onPress={() => router.push({ pathname: "/visitation/[childId]", params: { childId: row.child.id, classId: row.classId } })}
                        style={({ pressed }) => [
                          { flex: large ? undefined : 1, width: large ? "100%" : undefined, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: large ? 16 : 0, paddingVertical: 10, minHeight: 62 },
                          { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                        ]}
                      >
                        {!large && <InitialsAvatar name={`${row.child.firstName} ${row.child.lastName}`} size={36} variant="accent" />}
                        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                          <Copy numberOfLines={large ? undefined : 2} style={{ fontWeight: "500" }}>{row.child.firstName} {row.child.lastName}</Copy>
                          <Copy kind="caption" numberOfLines={large ? undefined : 1}>{rowSubtitle(row.child, row.className)}</Copy>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                            <StatusPill label={pill.label} color={pill.color} soft={pill.soft} />
                            {row.child.visitationPriority && <PriorityPill />}
                          </View>
                        </View>
                        <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
                      </Pressable>
                      {/* Their own controls beside the row: the row opens visitations, the star sets the shared priority, the clock opens history. */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: large ? 16 : 8, paddingBottom: large ? 10 : 0 }}>
                        {canStar && (
                          <PriorityStar
                            name={childName}
                            on={row.child.visitationPriority}
                            saving={!!priority.saving[row.child.id]}
                            onToggle={() => void priority.toggle(row.child.id, !row.child.visitationPriority)}
                          />
                        )}
                        <StudentHistoryButton childId={row.child.id} name={childName} />
                      </View>
                    </View>
                    {index < arr.length - 1 && <View style={{ height: 0.5, marginLeft: 64, backgroundColor: colors.border }} />}
                  </View>
                );
              })}
            </ListSurface>
          </View>
        )}
      </Screen>
    </>
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

function KpiTile({ label, value, color }: { label: string; value: string; color?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
      <Copy kind="caption">{label}</Copy>
      <Copy style={{ fontSize: 24, lineHeight: 28, fontWeight: "600", marginTop: 4 }} color={color}>{value}</Copy>
    </View>
  );
}
