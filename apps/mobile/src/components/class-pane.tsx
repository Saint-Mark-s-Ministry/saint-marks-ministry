import { View } from "react-native";
import { router } from "expo-router";
import type { SundaySchoolChild, SundaySchoolClass, SundaySchoolDashboard, SundaySchoolSession } from "@stmark/contracts";
import { getLevelDisplayName } from "@stmark/domain";
import { Button, Copy, InitialsAvatar, ListSurface, RowLink, Screen, SectionTitle } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { endpoint, useResource } from "@/data/resources";
import { individualAttendanceRoute } from "@/data/individual-attendance";
import { meetingDate } from "@/data/portal-provider";
import { attendanceTone, sessionAttendanceSubtitle, shortMonthDay } from "@/data/sunday-school-classes";
import { useAppTheme } from "@/theme";

type Detail = SundaySchoolClass & { children: SundaySchoolChild[]; sessions: SundaySchoolSession[] };

/**
 * One class, read-only, for the detail pane beside the Classes list on a wide window: how many children
 * and how attendance is going, the actions a servant reaches for (take attendance, history, roster),
 * who serves it and its recent sessions. Editing and staffing stay on the full class screen, one tap away.
 */
export function ClassPane({ classId }: { classId: string }) {
  const { colors } = useAppTheme();
  const resource = useResource<Detail>(endpoint("classes", classId));
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const cls = resource.data;
  const summary = dashboard.data?.classes.find((c) => c.id === classId);
  const active = cls?.children.filter((child) => child.isActive).length ?? 0;
  const tone = summary ? attendanceTone(summary.attendancePercentage) : null;
  const toneColor = tone ? { success: colors.success, warning: colors.warning, danger: colors.danger }[tone] : undefined;

  return (
    <Screen refreshing={resource.loading} onRefresh={() => void resource.refresh()}>
      <ResourceState loading={resource.loading && !cls} error={cls ? undefined : resource.error} retry={() => void resource.refresh()} />
      {cls && (
        <>
          <View style={{ gap: 2 }}>
            <Copy kind="title">{cls.name}</Copy>
            <Copy kind="caption">
              {getLevelDisplayName(cls.level)}
              {!cls.isActive ? " · archived" : ""}
            </Copy>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Tile label="Children" value={`${active}`} caption="on roster" />
            {summary && (
              <Tile label="Attendance" value={`${Math.round(summary.attendancePercentage)}%`} caption="year to date" valueColor={toneColor} />
            )}
          </View>

          <Button
            label={`${cls.canServe ? "Take" : "View"} attendance · ${shortMonthDay(meetingDate(cls))}`}
            onPress={() => router.push({ pathname: "/attendance/[classId]", params: { classId } })}
          />
          <Button secondary label="Individual attendance history" onPress={() => router.push(individualAttendanceRoute(classId))} />

          <ListSurface>
            <RowLink
              title={`Roster (${active})`}
              subtitle="Profiles, family details, and roster management"
              onPress={() => router.push({ pathname: "/roster", params: { classId } })}
            />
            <RowLink
              title="Open full class"
              subtitle="Edit the class, assign servants, see every session"
              onPress={() => router.push({ pathname: "/class/[id]", params: { id: classId } })}
            />
          </ListSurface>

          <View style={{ gap: 10 }}>
            <SectionTitle title="Servants" />
            <ListSurface>
              {!cls.assignments.length && (
                <View style={{ padding: 14 }}>
                  <Copy kind="caption">No servants assigned.</Copy>
                </View>
              )}
              {cls.assignments.map((assignment, index) => (
                <View
                  key={assignment.id}
                  style={[
                    { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 58 },
                    index < cls.assignments.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                  ]}
                >
                  <InitialsAvatar name={assignment.user.name} size={36} variant="accent" />
                  <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                    <Copy numberOfLines={1} style={{ fontWeight: "500" }}>{assignment.user.name}</Copy>
                    <Copy kind="caption" numberOfLines={1}>{assignment.authority === "COORDINATOR" ? "Coordinator" : "Servant"}</Copy>
                  </View>
                </View>
              ))}
            </ListSurface>
          </View>

          <View style={{ gap: 10 }}>
            <SectionTitle title="Recent sessions" />
            <ListSurface>
              {!cls.sessions.length && (
                <View style={{ padding: 14 }}>
                  <Copy kind="caption">No sessions recorded.</Copy>
                </View>
              )}
              {cls.sessions.slice(0, 8).map((session, index, all) => (
                <View key={session.id}>
                  <RowLink
                    title={shortMonthDay(session.date)}
                    subtitle={sessionAttendanceSubtitle({ attendance: session.attendance ?? [], topic: session.topic }, active)}
                    onPress={() =>
                      router.push({ pathname: "/attendance/[classId]", params: { classId, date: session.date.slice(0, 10) } })
                    }
                  />
                  {index < all.length - 1 && <View style={{ height: 0.5, marginLeft: 16, backgroundColor: colors.border }} />}
                </View>
              ))}
            </ListSurface>
          </View>
        </>
      )}
    </Screen>
  );
}

function Tile({ label, value, caption, valueColor }: { label: string; value: string; caption: string; valueColor?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 }}>
      <Copy kind="caption">{label}</Copy>
      <Copy style={{ fontSize: 28, lineHeight: 30, fontWeight: "600" }} color={valueColor}>{value}</Copy>
      <Copy kind="caption">{caption}</Copy>
    </View>
  );
}
