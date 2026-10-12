import { useEffect, useState } from "react";
import { LayoutAnimation, Pressable, View } from "react-native";
import { Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Button, Copy, Icon, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { query, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import {
  actorLabel,
  canViewActivity,
  filterByResult,
  formatAction,
  formatReason,
  metadataEntries,
  resultLabel,
  resultTone,
  shortId,
  targetLabel,
  type AuditEvent,
  type ResultFilter,
  type Tone,
} from "@/data/prep-activity";

type AuditPage = {
  events: AuditEvent[];
  page: number;
  totalPages: number;
  total: number;
  retention: { hours: number };
};

const RESULTS: ResultFilter[] = ["", "DENIED", "FAILED"];

function toneColor(tone: Tone, colors: ReturnType<typeof useAppTheme>["colors"]) {
  if (tone === "success") return { fg: colors.success, bg: colors.successSoft };
  if (tone === "warning") return { fg: colors.warning, bg: colors.warningSoft };
  return { fg: colors.danger, bg: colors.dangerSoft };
}

export default function PrepActivity() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewActivity(user?.role);

  const [search, setSearch] = useState("");
  const [result, setResult] = useState<ResultFilter>("");
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resource = useResource<AuditPage>(
    canView ? `/api/admin/audit-log?${query({ page: String(page), search, result })}` : null,
  );

  const offline = resource.error === "Could not reach the server. Check your connection and try again.";
  const forbidden = resource.error === "Forbidden";

  // The cache is keyed by the exact URL (including page), so a fresh fetch for
  // page 1 (a new search/filter) replaces the list; any later page appends.
  useEffect(() => {
    if (!resource.data) return;
    setEvents((prev) => (resource.data!.page === 1 ? resource.data!.events : [...prev, ...resource.data!.events]));
  }, [resource.data]);

  function applyFilters(next: { search?: string; result?: ResultFilter }) {
    setPage(1);
    setEvents([]);
    if (next.search !== undefined) setSearch(next.search);
    if (next.result !== undefined) setResult(next.result);
  }

  function toggle(id: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((current) => (current === id ? null : id));
  }

  const rows = filterByResult(events, result);
  const canLoadMore = !!resource.data && resource.data.page < resource.data.totalPages;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Activity",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
        }}
      />
      {canView && !forbidden && (
        <Stack.SearchBar
          autoCapitalize="none"
          placement="automatic"
          placeholder="Search activity"
          onChangeText={(event) => applyFilters({ search: event.nativeEvent.text })}
        />
      )}
      <Screen refreshing={resource.loading} onRefresh={() => { setPage(1); setEvents([]); void resource.refresh(); }}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Activity is for Super Admins only.</Copy>
          </View>
        )}

        {canView && (
          <>
            <Copy kind="caption">Security and admin activity</Copy>

            {offline && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.danger}>You're offline</Copy>
                <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
              </View>
            )}
            {forbidden && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.hover, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }}>Access denied</Copy>
                <Copy kind="caption">Your account doesn't currently hold Super Admin access to view activity.</Copy>
              </View>
            )}
            {!forbidden && !offline && (
              <ResourceState loading={resource.loading && page === 1} error={resource.error} retry={() => void resource.refresh()} />
            )}

            {!forbidden && (
              <>
                <SegmentedControl
                  values={["All", "Denied", "Failed"]}
                  selectedIndex={RESULTS.indexOf(result)}
                  onChange={({ nativeEvent }) => applyFilters({ result: RESULTS[nativeEvent.selectedSegmentIndex] ?? "" })}
                  style={{ width: "100%", minHeight: 36 }}
                />

                {resource.data && (
                  <Copy kind="caption">
                    Showing the last {resource.data.retention.hours} hours · activity isn't kept longer than that
                  </Copy>
                )}

                {resource.data && !rows.length && <Copy>No activity in this window.</Copy>}
              </>
            )}

            {!forbidden && !!rows.length && (
              <ListSurface>
                {rows.map((e, index) => {
                  const tone = toneColor(resultTone(e.result), colors);
                  const expanded = expandedId === e.id;
                  return (
                    <View key={e.id}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        onPress={() => toggle(e.id)}
                        style={({ pressed }) => [
                          styles.compactRow,
                          index < rows.length - 1 && !expanded && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                          { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                        ]}
                      >
                        <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: tone.bg }}>
                          <Icon ios="doc.text" android="description" size={16} color={tone.fg} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Copy style={{ fontWeight: "500" }} numberOfLines={1}>{formatAction(e.action)}</Copy>
                          <Copy kind="caption" numberOfLines={1}>
                            {actorLabel(e)} · {new Date(e.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </Copy>
                        </View>
                        <StatusPill label={resultLabel(e.result)} color={tone.fg} soft={tone.bg} />
                      </Pressable>
                      {expanded && (
                        <View
                          style={[
                            { padding: 16, gap: 10, backgroundColor: colors.hover },
                            index < rows.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                          ]}
                          accessibilityLabel={`Details for ${formatAction(e.action)}`}
                        >
                          <DetailRow label="Result" value={resultLabel(e.result)} />
                          <DetailRow label="User" value={actorLabel(e)} />
                          <DetailRow
                            label="When"
                            value={new Date(e.createdAt).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              timeZoneName: "short",
                            })}
                          />
                          <DetailRow label="Affected record" value={targetLabel(e)} />
                          {!!e.entityId && <DetailRow label="Record ID" value={shortId(e.entityId)} />}
                          {!!formatReason(e.reason) && <DetailRow label="Reason" value={formatReason(e.reason)!} />}
                          {metadataEntries(e.metadata).map((m) => (
                            <DetailRow key={m.key} label={m.key} value={m.value} />
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ListSurface>
            )}

            {canLoadMore && (
              <Button
                secondary
                label={resource.loading ? "Loading…" : "Load more"}
                disabled={resource.loading}
                onPress={() => setPage((p) => p + 1)}
              />
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Copy kind="caption">{label}</Copy>
      <Copy>{value}</Copy>
    </View>
  );
}
