import { Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import {
  compareAgeGroupsByLevel,
  compareClassesByLevelAndName,
  findAgeGroupForLevel,
  getClassMeetingDayName,
  getLevelDisplayName,
} from "@stmark/domain";
import {
  Button,
  Card,
  CompactRow,
  ConnectionBadge,
  Copy,
  Icon,
  ListSurface,
  Screen,
  SectionTitle,
  styles,
} from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { meetingDate, attendanceKey, usePortal } from "@/data/portal-provider";
import { DataStatus } from "@/components/data-status";
import { useAppTheme } from "@/theme";
import type { SundaySchoolDashboard } from "@stmark/contracts";
import { endpoint, useResource } from "@/data/resources";
import { ministryAccess } from "@/data/ministry";

export default function Classes() {
  const { attendance, classes, loading, error, refresh } = usePortal();
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const canCreateClass = ministryAccess(dashboard.data).createLevels.length > 0;
  const primaryClass = classes[0];
  const additionalClasses = classes
    .slice(1)
    .sort(compareClassesByLevelAndName);
  const ageGroups = [...(dashboard.data?.ageGroups ?? [])].sort(
    compareAgeGroupsByLevel,
  );
  const grouped = new Map<string, { name: string; classes: typeof classes }>();
  for (const schoolClass of additionalClasses) {
    const ageGroup = findAgeGroupForLevel(schoolClass.level, ageGroups);
    const key = ageGroup?.id ?? "other";
    const group = grouped.get(key) ?? {
      name: ageGroup?.name ?? "Other classes",
      classes: [],
    };
    group.classes.push(schoolClass);
    grouped.set(key, group);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: classes.length === 1 ? "My class" : "Classes",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="sundaySchool" />,
          headerRight:
            Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen resetOnFocus refreshing={loading} onRefresh={() => void refresh()}>
        <ConnectionBadge />
        <DataStatus />
        {canCreateClass && (
          <Button
            secondary
            label="New class"
            onPress={() =>
              router.push({ pathname: "/class/[id]", params: { id: "new" } })
            }
          />
        )}
        {!loading && !error && !classes.length && (
          <Card>
            <Copy kind="heading">No assigned classes</Copy>
            <Copy kind="caption">
              Classes assigned to this account will appear here.
            </Copy>
          </Card>
        )}

        {primaryClass && (
          <View style={{ gap: 10 }}>
            <SectionTitle
              title={classes.length === 1 ? "Assigned class" : "Primary class"}
            />
            <PrimaryClass
              schoolClass={primaryClass}
              recorded={
                !!attendance[
                  attendanceKey(primaryClass.id, meetingDate(primaryClass))
                ]
              }
            />
          </View>
        )}

        {additionalClasses.length > 0 && (
          <View style={{ gap: 18 }}>
            <SectionTitle title="Additional classes" />
            {[...grouped.entries()].map(([id, group]) => (
              <View key={id} style={{ gap: 8 }}>
                <Copy kind="eyebrow">{group.name}</Copy>
                <ListSurface>
                  {group.classes.map((schoolClass, index) => (
                    <CompactRow
                      key={schoolClass.id}
                      divider={index < group.classes.length - 1}
                      title={schoolClass.name}
                      subtitle={`${getLevelDisplayName(schoolClass.level)} · ${schoolClass._count?.children ?? 0} children`}
                      icon={<ClassIcon />}
                      trailing={
                        <AttendanceStatus
                          recorded={
                            !!attendance[
                              attendanceKey(
                                schoolClass.id,
                                meetingDate(schoolClass),
                              )
                            ]
                          }
                          readOnly={!schoolClass.canServe}
                        />
                      }
                      onPress={() =>
                        router.push({
                          pathname: "/class/[id]",
                          params: { id: schoolClass.id },
                        })
                      }
                    />
                  ))}
                </ListSurface>
              </View>
            ))}
          </View>
        )}
      </Screen>
    </>
  );
}

function PrimaryClass({
  schoolClass,
  recorded,
}: {
  schoolClass: ReturnType<typeof usePortal>["classes"][number];
  recorded: boolean;
}) {
  const childCount = schoolClass._count?.children ?? 0;
  return (
    <Card style={{ padding: 18, gap: 14 }}>
      <View style={[styles.row, { alignItems: "flex-start" }]}>
        <ClassIcon large />
        <View style={{ flex: 1, gap: 3 }}>
          <Copy kind="heading">{schoolClass.name}</Copy>
          <Copy kind="caption">
            {getLevelDisplayName(schoolClass.level)} ·{" "}
            {getClassMeetingDayName(schoolClass.level)}s · {childCount}{" "}
            {childCount === 1 ? "child" : "children"}
          </Copy>
        </View>
        <AttendanceStatus recorded={recorded} readOnly={!schoolClass.canServe} />
      </View>
      <Button
        label={schoolClass.canServe ? "Take attendance" : "View attendance"}
        onPress={() =>
          router.push({
            pathname: "/attendance/[classId]",
            params: { classId: schoolClass.id },
          })
        }
      />
      <Button
        secondary
        label="Class details"
        onPress={() =>
          router.push({
            pathname: "/class/[id]",
            params: { id: schoolClass.id },
          })
        }
      />
    </Card>
  );
}

function ClassIcon({ large = false }: { large?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        width: large ? 46 : 38,
        height: large ? 46 : 38,
        borderRadius: large ? 16 : 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.primarySoft,
      }}
    >
      <Icon
        ios="person.2.fill"
        android="groups"
        size={large ? 22 : 18}
      />
    </View>
  );
}

function AttendanceStatus({
  recorded,
  readOnly,
}: {
  recorded: boolean;
  readOnly: boolean;
}) {
  const { colors } = useAppTheme();
  const label = readOnly ? "View" : recorded ? "Done" : "Due";
  const color = readOnly
    ? colors.muted
    : recorded
      ? colors.success
      : colors.warning;
  const background = readOnly
    ? colors.primarySoft
    : recorded
      ? colors.successSoft
      : colors.warningSoft;
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Copy kind="caption" color={color}>
        {label}
      </Copy>
    </View>
  );
}
