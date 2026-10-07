import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import type {
  SundaySchoolChild,
  SundaySchoolClass,
  SundaySchoolDashboard,
  SundaySchoolSession,
} from "@stmark/contracts";
import { getLevelDisplayName } from "@stmark/domain";
import { Button, Copy, Icon, ListSurface, RowLink, Screen, SectionTitle, InitialsAvatar } from "@/components/ui";
import { Choice, Field, ResourceState, confirmAction, useAction } from "@/components/forms";
import { Staffing } from "@/components/staffing";
import { endpoint, request, useResource } from "@/data/resources";
import { ministryAccess } from "@/data/ministry";
import { usePortal, meetingDate } from "@/data/portal-provider";
import {
  attendanceTone,
  levelMoveImpact,
  sessionAttendanceSubtitle,
  shortMonthDay,
} from "@/data/sunday-school-classes";
import { MinistryTintProvider, serifDisplay, useAppTheme } from "@/theme";

type Detail = SundaySchoolClass & { children: SundaySchoolChild[]; sessions: SundaySchoolSession[] };

export default function ClassDetail() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <ClassDetailScreen />
    </MinistryTintProvider>
  );
}

// A component that both establishes MinistryTintProvider and calls
// useAppTheme() itself reads the *outer* (un-tinted) context — confirmed
// live (the "Assign a servant" icon rendered the default maroon tint instead
// of Sunday School gold) until this split, matching every other rebuilt
// screen's own wrapper/inner-screen convention.
function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const resource = useResource<Detail>(id === "new" ? null : endpoint("classes", id));
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const [editing, setEditing] = useState(false);
  const [staffingOpen, setStaffingOpen] = useState(false);
  const portal = usePortal();
  const action = useAction();
  const cls = resource.data;
  const summary = dashboard.data?.classes.find((c) => c.id === id);
  const refresh = async () => {
    await Promise.all([resource.refresh(), dashboard.refresh(), portal.refresh()]);
  };

  if (id === "new" || (cls && editing)) {
    return (
      <>
        <Stack.Screen options={{ title: id === "new" ? "New class" : "Edit class", headerLargeTitle: false }} />
        <Screen refreshing={dashboard.loading} onRefresh={() => void dashboard.refresh()}>
          <ResourceState loading={dashboard.loading} error={dashboard.error} retry={() => void dashboard.refresh()} />
          {dashboard.data && (
            <ClassForm
              cls={cls}
              dashboard={dashboard.data}
              done={async () => {
                setEditing(false);
                await refresh();
              }}
            />
          )}
          {editing && <Button secondary label="Cancel" onPress={() => setEditing(false)} />}
        </Screen>
      </>
    );
  }

  const menuActions: MenuAction[] = [
    ...(cls?.canCoordinate ? [{ id: "edit", title: "Edit class" } as MenuAction] : []),
    ...(cls?.canDelete
      ? [{ id: "delete", title: "Delete class", attributes: { destructive: true } } as MenuAction]
      : []),
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerLargeTitle: false,
          headerRight: () =>
            cls && menuActions.length ? (
              <MenuView
                title="Class options"
                actions={menuActions}
                onPressAction={({ nativeEvent }) => {
                  if (nativeEvent.event === "edit") setEditing(true);
                  else if (nativeEvent.event === "delete") {
                    confirmAction(
                      `Delete ${cls.name}?`,
                      `This permanently deletes the class and its class-specific history. ${cls.children.length} ${cls.children.length === 1 ? "child" : "children"} will be preserved and moved to Unassigned. This cannot be undone.`,
                      () =>
                        void action.run(async () => {
                          await request(endpoint("classes", id), "DELETE");
                          await portal.refresh();
                          router.back();
                        }),
                      true,
                    );
                  }
                }}
              >
                <HeaderIconButton ios="ellipsis" android="more_horiz" label="Class options" />
              </MenuView>
            ) : undefined,
        }}
      />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />

        {cls && (
          <>
            <View style={{ paddingHorizontal: 4, gap: 2 }}>
              <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>{cls.name}</Copy>
              <Copy kind="caption">
                {getLevelDisplayName(cls.level)}
                {summary?.ageGroup ? ` · ${summary.ageGroup.name}` : ""}
              </Copy>
            </View>

            {!cls.isActive && (
              <View style={{ padding: 14, borderRadius: 18, backgroundColor: colors.hover, gap: 2 }}>
                <Copy style={{ fontWeight: "600" }}>This class has been archived</Copy>
                <Copy kind="caption">Read-only. Reactivate it from Edit class.</Copy>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <KpiTile label="Children" value={`${cls.children.filter((c) => c.isActive).length}`} caption="on roster" />
              {summary && (
                <KpiTile
                  label="Attendance"
                  value={`${Math.round(summary.attendancePercentage)}%`}
                  caption="year to date"
                  valueColor={
                    { success: colors.success, warning: colors.warning, danger: colors.danger }[
                      attendanceTone(summary.attendancePercentage)
                    ]
                  }
                />
              )}
            </View>

            <Button
              label={`${cls.canServe ? "Take" : "View"} attendance · ${shortMonthDay(meetingDate(cls))}`}
              onPress={() => router.push({ pathname: "/attendance/[classId]", params: { classId: id } })}
            />
            {(cls.canViewServantAttendance || cls.canTakeServantAttendance) && (
              <Button
                secondary
                label={cls.canTakeServantAttendance ? "Servant attendance" : "View servant attendance"}
                onPress={() => router.push({ pathname: "/servant-attendance", params: { classId: id } })}
              />
            )}

            <ListSurface>
              <RowLink
                title={`Roster (${cls.children.filter((c) => c.isActive).length})`}
                subtitle="Profiles, family details, and roster management"
                onPress={() => router.push({ pathname: "/roster", params: { classId: id } })}
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
                {cls.assignments.map((a, index) => (
                  <View
                    key={a.id}
                    style={[
                      { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 58 },
                      index < cls.assignments.length - 1 || cls.canCoordinate
                        ? { borderBottomWidth: 0.5, borderBottomColor: colors.border }
                        : null,
                    ]}
                  >
                    <InitialsAvatar name={a.user.name} size={36} variant="accent" />
                    <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                      <Copy numberOfLines={1} style={{ fontWeight: "500" }}>{a.user.name}</Copy>
                      <Copy kind="caption" numberOfLines={1}>{a.authority === "COORDINATOR" ? "Coordinator" : "Servant"}</Copy>
                    </View>
                  </View>
                ))}
                {cls.canCoordinate && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Assign a servant"
                    onPress={() => setStaffingOpen((v) => !v)}
                    style={({ pressed }) => [
                      { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 52 },
                      { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                    ]}
                  >
                    <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                      <Icon ios="plus" android="add" size={17} color={colors.primary} />
                    </View>
                    <Copy style={{ fontWeight: "500", flex: 1 }}>{staffingOpen ? "Close staffing" : "Assign a servant"}</Copy>
                    <Icon ios={staffingOpen ? "chevron.up" : "chevron.down"} android={staffingOpen ? "expand_less" : "expand_more"} size={14} color={colors.muted} />
                  </Pressable>
                )}
              </ListSurface>
              {staffingOpen && (
                <Staffing classId={id} academicYearId={cls.academicYearId} assignments={cls.assignments} refresh={refresh} />
              )}
            </View>

            <View style={{ gap: 10 }}>
              <SectionTitle title="Recent sessions" />
              <ListSurface>
                {!cls.sessions.length && (
                  <View style={{ padding: 14 }}>
                    <Copy kind="caption">No sessions recorded.</Copy>
                  </View>
                )}
                {cls.sessions.slice(0, 8).map((s, index, arr) => (
                  <View key={s.id}>
                    <RowLink
                      title={shortMonthDay(s.date)}
                      subtitle={sessionAttendanceSubtitle(
                        { attendance: s.attendance ?? [], topic: s.topic },
                        cls.children.filter((c) => c.isActive).length,
                      )}
                      onPress={() =>
                        router.push({ pathname: "/attendance/[classId]", params: { classId: id, date: s.date.slice(0, 10) } })
                      }
                    />
                    {index < arr.length - 1 && <Divider />}
                  </View>
                ))}
              </ListSurface>
            </View>
          </>
        )}
      </Screen>
    </>
  );
}

function Divider() {
  const { colors } = useAppTheme();
  return <View style={{ height: 0.5, marginLeft: 16, backgroundColor: colors.border }} />;
}

function KpiTile({
  label,
  value,
  caption,
  valueColor,
}: {
  label: string;
  value: string;
  caption: string;
  valueColor?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 }}>
      <Copy kind="caption">{label}</Copy>
      <Copy style={{ fontSize: 28, lineHeight: 30, fontWeight: "600" }} color={valueColor}>{value}</Copy>
      <Copy kind="caption">{caption}</Copy>
    </View>
  );
}

function HeaderIconButton({
  ios,
  android,
  label,
}: {
  ios: Parameters<typeof Icon>[0]["ios"];
  android: Parameters<typeof Icon>[0]["android"];
  label: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
    >
      <Icon ios={ios} android={android} size={18} />
    </View>
  );
}

function ClassForm({
  cls,
  dashboard,
  done,
}: {
  cls?: SundaySchoolClass;
  dashboard: SundaySchoolDashboard;
  done: () => Promise<void>;
}) {
  const [name, setName] = useState(cls?.name ?? "");
  const access = ministryAccess(dashboard);
  const [level, setLevel] = useState<string>(cls?.level ?? access.createLevels[0] ?? "");
  const action = useAction();
  const levels = Array.from(new Set([...(cls ? [cls.level] : []), ...access.createLevels]));

  function save() {
    const impact = cls ? levelMoveImpact(cls.level, level as never, dashboard.ageGroups) : { movesBand: false, destinationBandName: null };
    const submit = () =>
      void action.run(async () => {
        const result = await request<SundaySchoolClass>(endpoint("classes", cls?.id), cls ? "PATCH" : "POST", {
          name: name.trim(),
          ...(!cls || cls.level !== level ? { level } : {}),
        });
        await done();
        if (!cls) router.replace({ pathname: "/class/[id]", params: { id: result.id } });
      });
    if (impact.movesBand) {
      confirmAction(
        "Move to a different age group?",
        impact.destinationBandName
          ? `This moves the class into ${impact.destinationBandName}, which may hand it to a different coordinator.`
          : "This moves the class outside every age group's current grade bands.",
        submit,
      );
    } else {
      submit();
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Field label="Class name" value={name} onChange={setName} disabled={action.busy} />
      <Choice
        label="Grade level"
        value={level}
        onChange={setLevel}
        disabled={action.busy || !access.createLevels.length}
        options={levels.map((value) => ({ value, label: getLevelDisplayName(value) }))}
      />
      <Button
        label={action.busy ? "Saving…" : "Save class"}
        disabled={action.busy || !name.trim() || !level || (!cls && !access.createLevels.length)}
        onPress={save}
      />
      {cls && !cls.isActive && (
        <Button
          secondary
          label="Reactivate class"
          disabled={action.busy}
          onPress={() =>
            void action.run(async () => {
              await request(endpoint("classes", cls.id), "PATCH", { isActive: true });
              await done();
            })
          }
        />
      )}
    </View>
  );
}
