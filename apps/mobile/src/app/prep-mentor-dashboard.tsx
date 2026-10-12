import { View } from "react-native";
import { Stack } from "expo-router";
import { Copy, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import {
  aggregateSectionAverages,
  canViewMentees,
  diff,
  formatDiff,
  formatPercent,
  isAdminLike,
  menteesAverage,
  sectionDiffs,
  type ClassSection,
  type StudentAnalyticsFlat,
} from "@/data/prep-mentor";

type ClassAverages = { sectionAverages: ClassSection[]; overallAverage: number | null; totalStudents: number; totalScores: number };

export default function PrepMentorDashboard() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewMentees(user?.role);
  const isAdmin = isAdminLike(user?.role);

  // No studentIds param: for a MENTOR this auto-scopes server-side to their
  // own mentees (confirmed in app/api/students/analytics/batch/route.ts);
  // for an admin it returns every active enrollment.
  const analytics = useResource<StudentAnalyticsFlat[]>(canView ? "/api/students/analytics/batch" : null);
  const classAverages = useResource<ClassAverages>(canView ? "/api/dashboard/class-averages" : null);

  const offline = analytics.error === "Could not reach the server. Check your connection and try again.";
  const rows = analytics.data ?? [];
  const onTrack = rows.filter((r) => r.graduationEligible).length;
  const atRisk = rows.length - onTrack;
  const menteesAvg = menteesAverage(rows);
  const classAvg = classAverages.data?.overallAverage ?? null;
  const diffs = sectionDiffs(classAverages.data?.sectionAverages ?? [], aggregateSectionAverages(rows));

  return (
    <>
      <Stack.Screen
        options={{
          title: "Dashboard",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
        }}
      />
      <Screen refreshing={analytics.loading} onRefresh={() => { void analytics.refresh(); void classAverages.refresh(); }}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>The mentor dashboard is for mentors and admins.</Copy>
          </View>
        )}

        {canView && (
          <>
            <Copy kind="caption">{isAdmin ? "All active students" : `Mentor · ${rows.length} ${rows.length === 1 ? "mentee" : "mentees"}`}</Copy>

            {offline && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.danger}>You're offline</Copy>
                <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
              </View>
            )}
            {!offline && <ResourceState loading={analytics.loading} error={analytics.error} retry={() => void analytics.refresh()} />}

            {analytics.data && !rows.length && (
              <Copy>{isAdmin ? "No active enrollments yet." : "You have no mentees assigned yet."}</Copy>
            )}

            {!!rows.length && (
              <>
                <ListSurface>
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    <Stat label="On track" value={onTrack} sublabel={`of ${rows.length} mentees`} color={colors.success} />
                    <Stat label="At risk" value={atRisk} sublabel={atRisk ? "need a check-in" : "none right now"} color={atRisk ? colors.danger : colors.muted} />
                    <Stat label="Mentees avg" value={formatPercent(menteesAvg)} sublabel="exam average" />
                    <Stat label="Class avg" value={formatPercent(classAvg)} sublabel={`difference ${formatDiff(diff(menteesAvg, classAvg))}`} />
                  </View>
                </ListSurface>

                {!!diffs.length && (
                  <View style={{ gap: 10 }}>
                    <Copy style={{ fontSize: 17, fontWeight: "600" }}>Section averages</Copy>
                    <Copy kind="caption">Class vs {isAdmin ? "students" : "mentees"}</Copy>
                    <ListSurface>
                      {diffs.map((section, index) => (
                        <View
                          key={section.sectionId}
                          style={[styles.compactRow, index < diffs.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
                        >
                          <Copy style={{ flex: 1 }}>{section.displayName}</Copy>
                          {section.diff === null ? (
                            <Copy kind="caption">—</Copy>
                          ) : (
                            <StatusPill
                              label={formatDiff(section.diff)}
                              color={section.diff >= 0 ? colors.success : colors.danger}
                              soft={section.diff >= 0 ? colors.successSoft : colors.dangerSoft}
                            />
                          )}
                        </View>
                      ))}
                    </ListSurface>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function Stat({ label, value, sublabel, color }: { label: string; value: string | number; sublabel: string; color?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ width: "50%", padding: 12, gap: 6 }} accessible accessibilityLabel={`${label}: ${value}, ${sublabel}`}>
      <Copy kind="caption" style={{ fontWeight: "500" }}>{label}</Copy>
      <Copy style={{ fontSize: 28, lineHeight: 32, fontWeight: "600" }} color={color ?? colors.text}>
        {String(value)}
      </Copy>
      <Copy kind="caption">{sublabel}</Copy>
    </View>
  );
}
