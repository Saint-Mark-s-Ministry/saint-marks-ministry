import { Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import { getLevelDisplayName } from "@stmark/domain";
import {
  Brand,
  Button,
  CalendarDate,
  Card,
  CompactRow,
  ConnectionBadge,
  Copy,
  Icon,
  ListSurface,
  RowLink,
  Screen,
  SectionTitle,
  styles,
} from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useAuth } from "@/data/auth-provider";
import { useResource } from "@/data/resources";
import { birthdayCaption, birthdayParts, upcomingBirthdays, type Birthday } from "@/data/sunday-school-birthdays";
import { attendanceKey, meetingDate, usePortal } from "@/data/portal-provider";
import { DataStatus } from "@/components/data-status";
import { useAppTheme } from "@/theme";

export default function Home() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  // Birthdays are class-scoped on the server. A refusal or failure hides the card.
  const birthdays = useResource<Birthday[]>("/api/sunday-school/birthdays");
  const birthdaysThisMonth = (birthdays.data ?? []).filter((b) => birthdayParts(b.birthDate)?.month === new Date().getUTCMonth() + 1).length;
  const {
    attendance,
    classes,
    lessons,
    unreadCount,
    loading,
    error,
    refresh,
  } = usePortal();
  const pending = classes.filter(
    (schoolClass) =>
      schoolClass.canServe &&
      !attendance[attendanceKey(schoolClass.id, meetingDate(schoolClass))],
  );
  const primaryClass = pending[0] ?? classes[0];
  const attendanceRecorded = primaryClass
    ? !!attendance[attendanceKey(primaryClass.id, meetingDate(primaryClass))]
    : false;
  const childCount = classes.reduce(
    (total, schoolClass) => total + (schoolClass._count?.children ?? 0),
    0,
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Sunday School",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="sundaySchool" />,
          headerRight:
            Platform.OS === "ios"
              ? undefined
              : () => <TopActions unread={unreadCount} notifications />,
        }}
      />
      {Platform.OS === "ios" && (
        <TopActions unread={unreadCount} notifications />
      )}
      <Screen resetOnFocus refreshing={loading} onRefresh={() => void refresh()}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Brand />
          <ConnectionBadge />
        </View>
        <DataStatus />

        {!loading && !error && !classes.length && (
          <Card>
            <Copy kind="heading">No assigned class</Copy>
            <Copy kind="caption">
              Your Sunday School assignment will appear here when it is ready.
            </Copy>
          </Card>
        )}

        {primaryClass && (
          <View style={{ gap: 10 }}>
            <SectionTitle title="This week" />
            <Card style={{ padding: 18, gap: 14 }}>
              <View style={[styles.row, { alignItems: "flex-start" }]}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 15,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.primarySoft,
                  }}
                >
                  <Icon ios="person.2.fill" android="groups" size={21} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Copy kind="heading">{primaryClass.name}</Copy>
                  <Copy kind="caption">
                    {getLevelDisplayName(primaryClass.level)} ·{" "}
                    {primaryClass._count?.children ?? 0}{" "}
                    {(primaryClass._count?.children ?? 0) === 1
                      ? "child"
                      : "children"}
                  </Copy>
                </View>
                <View
                  style={[
                    styles.pill,
                    {
                      backgroundColor: attendanceRecorded
                        ? colors.successSoft
                        : colors.warningSoft,
                    },
                  ]}
                >
                  <Copy
                    kind="caption"
                    color={attendanceRecorded ? colors.success : colors.warning}
                  >
                    {attendanceRecorded ? "Recorded" : "To do"}
                  </Copy>
                </View>
              </View>
              <Button
                label={
                  primaryClass.canServe
                    ? attendanceRecorded
                      ? "Review attendance"
                      : "Take attendance"
                    : "View attendance"
                }
                onPress={() =>
                  router.push({
                    pathname: "/attendance/[classId]",
                    params: { classId: primaryClass.id },
                  })
                }
              />
            </Card>
          </View>
        )}

        {user?.role === "PARENT" && (
          <ListSurface>
            <RowLink title="My children" subtitle="Classes, registrations, and new children" onPress={() => router.push("/parent-children")} />
          </ListSurface>
        )}

        {!!birthdays.data?.length && (
          <View style={{ gap: 10 }}>
            <View style={[styles.row, { justifyContent: "space-between", paddingHorizontal: 4 }]}>
              <Copy style={{ fontSize: 17, fontWeight: "600" }}>Birthdays</Copy>
              <Copy kind="caption">{birthdaysThisMonth} this month</Copy>
            </View>
            <ListSurface>
              {upcomingBirthdays(birthdays.data, new Date(), 3).map((b, index, all) => (
                <View
                  key={b.id}
                  style={[
                    { paddingHorizontal: 16, paddingVertical: 12, minHeight: 56, gap: 2 },
                    index < all.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                  ]}
                >
                  <Copy style={{ fontWeight: "500" }}>{b.firstName} {b.lastName}</Copy>
                  <Copy kind="caption">{b.class?.name ?? "No class"} · {birthdayCaption(b.birthDate, new Date())}</Copy>
                </View>
              ))}
              <RowLink title="All birthdays" subtitle="Filter by month and class" onPress={() => router.push("/sunday-birthdays")} />
            </ListSurface>
          </View>
        )}

        {!!classes.length && (
          <ListSurface>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                minHeight: 76,
              }}
            >
              <Metric
                value={classes.length}
                label={classes.length === 1 ? "Class" : "Classes"}
              />
              <View
                style={{ width: 1, height: 34, backgroundColor: colors.border }}
              />
              <Metric
                value={childCount}
                label={childCount === 1 ? "Child" : "Children"}
              />
              <View
                style={{ width: 1, height: 34, backgroundColor: colors.border }}
              />
              <Metric value={pending.length} label="Attendance due" />
            </View>
          </ListSurface>
        )}

        <View style={{ gap: 10 }}>
          <SectionTitle title="Upcoming lessons" />
          <ListSurface>
            {!loading && !lessons.length && (
              <View style={{ paddingVertical: 18 }}>
                <Copy kind="caption">No upcoming lessons.</Copy>
              </View>
            )}
            {lessons.slice(0, 4).map((lesson, index) => (
              <CompactRow
                key={lesson.id}
                divider={index < Math.min(lessons.length, 4) - 1}
                title={lesson.title ?? "Weekly lesson"}
                subtitle={lesson.class.name}
                icon={<CalendarDate date={lesson.sundayDate} />}
                onPress={() =>
                  router.push({
                    pathname: "/lesson/[id]",
                    params: { id: lesson.id, classId: lesson.classId },
                  })
                }
              />
            ))}
          </ListSurface>
        </View>
      </Screen>
    </>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Copy kind="heading">{value}</Copy>
      <Copy kind="caption">{label}</Copy>
    </View>
  );
}
