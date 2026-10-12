import { useState } from "react";
import { Alert, Modal, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { MenuView } from "@expo/ui/community/menu";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Button, Copy, Icon, InitialsAvatar, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { Choice, Field, ResourceState, Toggle, confirmAction, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { isAdminLike } from "@/data/prep-home";
import {
  canManageEnrollments,
  filterRosterSegment,
  filterRosterYear,
  isEligibleMentorRole,
  mentorWorkload,
  searchRoster,
  unenrolledStudents,
  type RosterEnrollment,
  type RosterSegment,
} from "@/data/prep-roster";

type StudentAnalytics = { studentId: string; graduationEligible: boolean };
type AcademicYear = { id: string; name: string; isActive: boolean };
type UserLite = { id: string; name: string; role: string };

const YEAR_LABELS: Record<string, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2" };

export default function PrepRoster() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = isAdminLike(user?.role);
  const canManage = canManageEnrollments(user?.role);

  const [segment, setSegment] = useState<RosterSegment>("active");
  const [yearLevel, setYearLevel] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  const enrollmentsRes = useResource<RosterEnrollment[]>(canView ? "/api/enrollments" : null);
  const analytics = useResource<StudentAnalytics[]>(canView ? "/api/students/analytics/batch" : null);
  const all = enrollmentsRes.data ?? [];
  const eligibleById = new Map((analytics.data ?? []).map((a) => [a.studentId, a.graduationEligible]));

  const offline = enrollmentsRes.error === "Could not reach the server. Check your connection and try again.";
  const withoutMentor = all.filter((e) => e.isActive && !e.mentor).length;
  const rows = searchRoster(filterRosterYear(filterRosterSegment(all, segment), yearLevel), query);
  const workload = mentorWorkload(all);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Roster & async students",
          headerRight: () => (
            <View style={[styles.row, { gap: 4 }]}>
              <MenuView
                title="Filter by year"
                actions={[
                  { id: "", title: "All years", state: (yearLevel === null ? "on" : "off") as "on" | "off" },
                  { id: "YEAR_1", title: "Year 1", state: (yearLevel === "YEAR_1" ? "on" : "off") as "on" | "off" },
                  { id: "YEAR_2", title: "Year 2", state: (yearLevel === "YEAR_2" ? "on" : "off") as "on" | "off" },
                ]}
                onPressAction={({ nativeEvent }) => setYearLevel(nativeEvent.event || null)}
              >
                <Pressable accessibilityRole="button" accessibilityLabel="Filter by year" hitSlop={8} style={{ padding: 6 }}>
                  <Icon ios="line.3.horizontal.decrease.circle" android="filter_list" size={22} color={colors.text} />
                </Pressable>
              </MenuView>
              {canManage && (
                <Pressable accessibilityRole="button" accessibilityLabel="Enroll student" hitSlop={8} onPress={() => setEnrolling(true)} style={{ padding: 6 }}>
                  <Icon ios="plus" android="add" size={20} color={colors.primary} />
                </Pressable>
              )}
            </View>
          ),
        }}
      />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="automatic"
        placeholder="Search students"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
      />
      <Screen refreshing={enrollmentsRes.loading} onRefresh={() => { void enrollmentsRes.refresh(); void analytics.refresh(); }}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>The roster is for Servants Prep administrators.</Copy>
          </View>
        )}

        {canView && (
          <>
            <Copy kind="caption">{all.length} enrolled · {withoutMentor} without a mentor</Copy>

            {offline && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.danger}>You're offline</Copy>
                <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
              </View>
            )}
            <ResourceState loading={enrollmentsRes.loading} error={offline ? undefined : enrollmentsRes.error} retry={() => void enrollmentsRes.refresh()} />

            <SegmentedControlRow segment={segment} onChange={setSegment} counts={{
              active: filterRosterSegment(all, "active").length,
              async: filterRosterSegment(all, "async").length,
              all: all.length,
            }} />

            <ListSurface>
              {!rows.length && enrollmentsRes.data && (
                <View style={{ paddingVertical: 18 }}>
                  <Copy kind="caption">No students in this view.</Copy>
                </View>
              )}
              {rows.map((e, index) => (
                <RosterRow
                  key={e.studentId}
                  enrollment={e}
                  divider={index < rows.length - 1}
                  canManage={canManage}
                  graduationEligible={eligibleById.get(e.studentId) ?? null}
                  onChanged={() => { void enrollmentsRes.refresh(); }}
                />
              ))}
            </ListSurface>

            <Copy style={{ fontSize: 17, fontWeight: "600" }}>Mentor workload</Copy>
            <ListSurface>
              {!workload.length && (
                <View style={{ paddingVertical: 18 }}>
                  <Copy kind="caption">No mentor assignments yet.</Copy>
                </View>
              )}
              {workload.map((m, index) => (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: "/person/[id]", params: { id: m.id } })}
                  style={({ pressed }) => [
                    styles.compactRow,
                    index < workload.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                    { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                  ]}
                >
                  {/* Mentor avatars are gold-tinted (confirmed exact: #F6EFDD/#8A6A1C in
                      iOS-Roster-Light.dc.html) regardless of ministry, to visually set
                      servants/mentors apart from maroon-tinted student avatars. */}
                  <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#F6EFDD" }}>
                    <Copy style={{ fontWeight: "600", fontSize: 13, color: "#8A6A1C" }}>
                      {m.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                    </Copy>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Copy style={{ fontWeight: "500" }}>{m.name}</Copy>
                    <Copy kind="caption">{m.count} {m.count === 1 ? "mentee" : "mentees"}</Copy>
                  </View>
                  <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
                </Pressable>
              ))}
            </ListSurface>
          </>
        )}
      </Screen>

      {enrolling && (
        <EnrollStudentSheet
          enrollments={all}
          onClose={() => setEnrolling(false)}
          onEnrolled={() => { setEnrolling(false); void enrollmentsRes.refresh(); }}
        />
      )}
    </>
  );
}

function SegmentedControlRow({ segment, onChange, counts }: { segment: RosterSegment; onChange: (s: RosterSegment) => void; counts: Record<RosterSegment, number> }) {
  return (
    <SegmentedControl
      values={[`Active ${counts.active}`, `Async ${counts.async}`, "All"]}
      selectedIndex={(["active", "async", "all"] as const).indexOf(segment)}
      onChange={({ nativeEvent }: { nativeEvent: { selectedSegmentIndex: number } }) =>
        onChange((["active", "async", "all"] as const)[nativeEvent.selectedSegmentIndex] ?? "active")
      }
      style={{ width: "100%", minHeight: 36 }}
    />
  );
}

function RosterRow({
  enrollment,
  divider,
  canManage,
  graduationEligible,
  onChanged,
}: {
  enrollment: RosterEnrollment;
  divider: boolean;
  canManage: boolean;
  graduationEligible: boolean | null;
  onChanged: () => void;
}) {
  const { colors } = useAppTheme();
  const subtitle = `${YEAR_LABELS[enrollment.yearLevel] ?? enrollment.yearLevel}${
    enrollment.status === "WITHDRAWN"
      ? " · Withdrawn"
      : enrollment.status === "GRADUATED"
        ? " · Graduated"
        : enrollment.isAsyncStudent
          ? " · Async"
          : enrollment.mentor
            ? ` · Mentor ${enrollment.mentor.name}`
            : " · No mentor yet"
  }`;

  function transition(status: "ACTIVE" | "GRADUATED" | "WITHDRAWN") {
    const consequence =
      status === "GRADUATED"
        ? `This marks ${enrollment.student.name} inactive and records their graduation.`
        : status === "WITHDRAWN"
          ? `This marks ${enrollment.student.name} inactive. They can be reactivated later.`
          : `This reactivates ${enrollment.student.name} as an active student.`;
    const needsNote = status === "GRADUATED" && graduationEligible === false;
    confirmAction(
      `${status === "GRADUATED" ? "Graduate" : status === "WITHDRAWN" ? "Withdraw" : "Reactivate"} ${enrollment.student.name}?`,
      needsNote ? `${consequence} They haven't met graduation requirements, so a note is required.` : consequence,
      () => {
        if (needsNote) {
          Alert.prompt(
            "Reason for exception",
            "Required since graduation requirements aren't met.",
            (note) => {
              if (!note?.trim()) return;
              void save(status, note.trim());
            },
          );
          return;
        }
        void save(status);
      },
      status === "WITHDRAWN",
    );
  }

  async function save(status: "ACTIVE" | "GRADUATED" | "WITHDRAWN", graduationNote?: string) {
    try {
      await request(`/api/enrollments/${encodeURIComponent(enrollment.id)}`, "PATCH", { status, ...(graduationNote ? { graduationNote } : {}) });
      onChanged();
    } catch (error) {
      Alert.alert("Unable to update", error instanceof Error ? error.message : "Please try again.");
    }
  }

  const actions = [];
  if (enrollment.status !== "ACTIVE") actions.push({ id: "ACTIVE", title: "Reactivate" });
  if (enrollment.status !== "GRADUATED") actions.push({ id: "GRADUATED", title: "Graduate" });
  if (enrollment.status !== "WITHDRAWN") actions.push({ id: "WITHDRAWN", title: "Withdraw", attributes: { destructive: true } });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push(
          enrollment.isAsyncStudent
            ? { pathname: "/prep-async-student/[id]", params: { id: enrollment.studentId } }
            : { pathname: "/prep-student/[id]", params: { id: enrollment.studentId } },
        )
      }
      style={({ pressed }) => [
        styles.compactRow,
        divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
        { backgroundColor: pressed ? colors.primarySoft : "transparent" },
      ]}
    >
      <InitialsAvatar name={enrollment.student.name} size={38} />
      <View style={{ flex: 1, gap: 1 }}>
        <Copy numberOfLines={1} style={{ fontWeight: "500" }}>{enrollment.student.name}</Copy>
        <Copy kind="caption" numberOfLines={1}>{subtitle}</Copy>
      </View>
      {enrollment.status === "WITHDRAWN" && <StatusPill label="Withdrawn" color={colors.muted} soft={colors.hover} />}
      {enrollment.status === "ACTIVE" && enrollment.isAsyncStudent && <StatusPill label="Async" color={colors.info} soft={colors.infoSoft} />}
      {canManage && (
        <MenuView title="Student status" actions={actions} onPressAction={({ nativeEvent }) => transition(nativeEvent.event as "ACTIVE" | "GRADUATED" | "WITHDRAWN")}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Change status for ${enrollment.student.name}`} hitSlop={6} style={{ padding: 4 }}>
            <Icon ios="ellipsis" android="more_horiz" size={16} color={colors.muted} />
          </Pressable>
        </MenuView>
      )}
    </Pressable>
  );
}

function EnrollStudentSheet({ enrollments, onClose, onEnrolled }: { enrollments: RosterEnrollment[]; onClose: () => void; onEnrolled: () => void }) {
  const { colors } = useAppTheme();
  const students = useResource<UserLite[]>("/api/users?role=STUDENT");
  const servants = useResource<UserLite[]>("/api/users?role=SERVANT_PREP");
  const mentors = useResource<UserLite[]>("/api/users?role=MENTOR");
  const years = useResource<AcademicYear[]>("/api/academic-years");
  const activeYear = years.data?.find((y) => y.isActive) ?? years.data?.[0];

  const addable = unenrolledStudents(students.data ?? [], enrollments);
  const mentorOptions = [...(servants.data ?? []), ...(mentors.data ?? [])].filter((u) => isEligibleMentorRole(u.role));

  const [studentId, setStudentId] = useState("");
  const [yearLevel, setYearLevel] = useState<"YEAR_1" | "YEAR_2">("YEAR_1");
  const [mentorId, setMentorId] = useState("");
  const [isAsync, setIsAsync] = useState(false);
  const [asyncReason, setAsyncReason] = useState("");
  const action = useAction();

  const canSubmit = !!studentId && !!activeYear && (!isAsync || !!asyncReason.trim());

  function submit() {
    if (!studentId) {
      Alert.alert("Choose a student", "Select which student to enroll.");
      return;
    }
    if (isAsync && !asyncReason.trim()) {
      Alert.alert("Reason required", "Give a reason for async status.");
      return;
    }
    void action.run(async () => {
      const created = await request<{ id: string }>("/api/enrollments", "POST", {
        studentId,
        yearLevel,
        mentorId: mentorId || undefined,
        academicYearId: activeYear!.id,
        isActive: true,
      });
      if (isAsync) {
        // isAsyncStudent/asyncReason aren't accepted by POST — set them via the same PATCH every other status change uses.
        await request(`/api/enrollments/${encodeURIComponent(created.id)}`, "PATCH", { isAsyncStudent: true, asyncReason: asyncReason.trim() });
      }
      onEnrolled();
    });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 24, gap: 14 }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            disabled={action.busy}
            onPress={onClose}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>Enroll student</Copy>
          <View style={{ width: 40 }} />
        </View>

        <ResourceState
          loading={students.loading || years.loading}
          error={students.error || years.error}
          retry={() => { void students.refresh(); void years.refresh(); }}
        />

        {!!students.data && (
          <Choice
            label="Student"
            value={studentId}
            options={addable.map((s) => ({ value: s.id, label: s.name }))}
            onChange={setStudentId}
            disabled={action.busy}
          />
        )}
        {!!students.data && !addable.length && <Copy kind="caption">Every student account is already enrolled.</Copy>}

        <Choice
          label="Year level"
          value={yearLevel}
          options={[{ value: "YEAR_1", label: "Year 1" }, { value: "YEAR_2", label: "Year 2" }]}
          onChange={(v) => setYearLevel(v as "YEAR_1" | "YEAR_2")}
          disabled={action.busy}
        />

        <Choice
          label="Mentor"
          value={mentorId}
          options={[{ value: "", label: "Not assigned" }, ...mentorOptions.map((m) => ({ value: m.id, label: m.name }))]}
          onChange={setMentorId}
          disabled={action.busy}
        />

        <Toggle label="Async student" value={isAsync} onChange={setIsAsync} disabled={action.busy} />
        {isAsync && (
          <Field label="Reason for async status" value={asyncReason} onChange={setAsyncReason} placeholder="Required" disabled={action.busy} />
        )}

        {!activeYear && !years.loading && (
          <Copy kind="caption" color={colors.danger}>No academic year is set up yet.</Copy>
        )}

        <Button label={action.busy ? "Enrolling…" : "Enroll student"} disabled={!canSubmit || action.busy} onPress={submit} />
      </View>
    </Modal>
  );
}
