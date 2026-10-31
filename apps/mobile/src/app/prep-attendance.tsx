import { useEffect, useRef, useState } from "react";
import { yearLevelLabel } from "@/data/year-level";
import { Alert, AppState, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { MenuView } from "@expo/ui/community/menu";
import { Button, Copy, Icon, Screen, styles } from "@/components/ui";
import { GlassChrome } from "@/components/chrome";
import { ResourceState, confirmAction, useAction } from "@/components/forms";
import { feedback } from "@/data/haptics";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { isAdminLike, nextLessonIndex } from "@/data/prep-home";
import {
  allResolved,
  buildBatchRecords,
  canEditSession,
  canManageAttendance,
  draftChanged,
  dropAsyncMarks,
  getAttendanceDraft,
  isLessonInFuture,
  offRollCallNote,
  restPresent,
  rollCallChangeNotice,
  searchRoster,
  splitRollCall,
  statusTotals,
  setAttendanceDraft,
  useAttendanceDraft,
  type AttendanceDraft,
  type AttendanceStatus,
} from "@/data/prep-attendance";

type LessonListItem = {
  id: string;
  lessonNumber: number;
  scheduledDate: string;
  status: "SCHEDULED" | "CANCELLED" | "NO_CLASS" | "COMPLETED";
  isExamDay?: boolean;
  examSection?: { displayName: string } | null;
};

type EnrollmentLite = {
  studentId: string;
  isActive: boolean;
  /** A current async student is assessed on rotation weeks and is never on a lesson roll call. */
  isAsyncStudent?: boolean;
  yearLevel: string | null;
  student: { id: string; name: string };
};

type AttendanceRecordRow = {
  id: string;
  studentId: string;
  status: AttendanceStatus;
  notes: string | null;
};


const STATUS_META: { value: AttendanceStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "Absent" },
  { value: "EXCUSED", label: "Excused" },
];

export default function PrepAttendance() {
  const { lessonId: paramLessonId } = useLocalSearchParams<{ lessonId?: string }>();
  const { user } = useAuth();
  const canView = isAdminLike(user?.role);

  const lessons = useResource<LessonListItem[]>(canView ? "/api/lessons?excludeExamDays=true" : null);
  const today = new Date().toISOString().slice(0, 10);
  const ordered = lessons.data ?? [];
  const fallbackIndex = nextLessonIndex(ordered, today);
  const lessonId = paramLessonId || (fallbackIndex >= 0 ? ordered[fallbackIndex].id : undefined);
  const lesson = ordered.find((l) => l.id === lessonId);

  if (!canView) {
    return (
      <>
        <Stack.Screen options={{ title: "Attendance" }} />
        <Screen>
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>
              Nothing to show here yet
            </Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              Taking attendance is for Servants Prep administrators.
            </Copy>
          </View>
        </Screen>
      </>
    );
  }

  if (lessons.loading || (!lesson && !lessons.error)) {
    return (
      <>
        <Stack.Screen options={{ title: "Attendance" }} />
        <Screen>
          <ResourceState loading={lessons.loading} error={lessons.error} retry={() => void lessons.refresh()} />
          {!lessons.loading && !lessons.error && (
            <View style={{ paddingVertical: 32, alignItems: "center", gap: 6 }}>
              <Copy kind="heading">No lesson to take attendance for</Copy>
              <Copy kind="caption" style={{ textAlign: "center" }}>
                Check Curriculum to schedule the next lesson.
              </Copy>
            </View>
          )}
        </Screen>
      </>
    );
  }

  if (lessons.error && !lesson) {
    return (
      <>
        <Stack.Screen options={{ title: "Attendance" }} />
        <Screen>
          <ResourceState loading={false} error={lessons.error} retry={() => void lessons.refresh()} />
        </Screen>
      </>
    );
  }

  return <AttendanceRoster key={lessonId} lesson={lesson!} role={user?.role} />;
}

function AttendanceRoster({ lesson, role }: { lesson: LessonListItem; role?: string | null }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const today = new Date().toISOString().slice(0, 10);
  const canManage = canManageAttendance(role);
  const canEdit = canEditSession(role, lesson.scheduledDate, today);
  const future = isLessonInFuture(lesson.scheduledDate, today);

  const enrollments = useResource<EnrollmentLite[]>("/api/enrollments?isActive=true");
  const attendance = useResource<AttendanceRecordRow[]>(`/api/attendance?lessonId=${encodeURIComponent(lesson.id)}`);
  const { roster, offRoll } = splitRollCall(enrollments.data ?? []);
  const rosterIds = roster.map((e) => e.studentId);

  const serverDraft: AttendanceDraft = {};
  for (const record of attendance.data ?? []) {
    serverDraft[record.studentId] = { status: record.status, ...(record.notes ? { notes: record.notes } : {}) };
  }
  const draft = useAttendanceDraft(lesson.id);
  const touchedRef = useRef(false);
  useEffect(() => {
    if (touchedRef.current) return;
    if (Object.keys(serverDraft).length === 0) return;
    setAttendanceDraft(lesson.id, serverDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance.data, lesson.id]);

  // Who is async can change while this roll call is open (a servant switches a student
  // on another device). Re-check on a timer and on return to the app, drop any draft
  // marks for a student who has become async, and say so.
  const [notice, setNotice] = useState<string | null>(null);
  const asyncIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!enrollments.data) return;
    const split = splitRollCall(enrollments.data);
    const current = new Set(split.offRoll.map((e) => e.studentId));
    const previous = asyncIdsRef.current;
    asyncIdsRef.current = current;
    const { draft: cleaned, dropped } = dropAsyncMarks(getAttendanceDraft(lesson.id), [...current]);
    if (dropped.length) setAttendanceDraft(lesson.id, cleaned);
    const nameOf = (id: string) => enrollments.data!.find((e) => e.studentId === id)?.student.name ?? "A student";
    const becameAsync = previous ? [...current].filter((id) => !previous.has(id)) : dropped;
    const leftAsync = previous ? [...previous].filter((id) => !current.has(id)) : [];
    const message = rollCallChangeNotice({
      becameAsync: becameAsync.map(nameOf),
      markedDropped: dropped.map(nameOf),
      leftAsync: leftAsync.map(nameOf),
    });
    if (message) {
      setNotice(message);
      feedback("warning");
    }
  }, [enrollments.data, lesson.id]);

  const refreshEnrollments = enrollments.refresh;
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refreshEnrollments();
    }, 30_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshEnrollments();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refreshEnrollments]);

  const [query, setQuery] = useState("");
  const visibleRoster = searchRoster(
    roster.map((e) => ({ ...e, name: e.student.name })),
    query,
  );

  const totals = statusTotals(draft, rosterIds);
  const resolved = allResolved(draft, rosterIds);
  const dirty = draftChanged(serverDraft, draft, rosterIds);
  const action = useAction();
  const canSave = canEdit && resolved && dirty && !action.busy;

  const offline = enrollments.error === "Could not reach the server. Check your connection and try again.";

  function setMark(studentId: string, status: AttendanceStatus) {
    touchedRef.current = true;
    setAttendanceDraft(lesson.id, { ...draft, [studentId]: { status, notes: draft[studentId]?.notes } });
  }

  function editNote(studentId: string, name: string) {
    if (!canEdit) return;
    const current = draft[studentId]?.notes ?? "";
    Alert.prompt(
      `Note for ${name}`,
      undefined,
      (text) => {
        touchedRef.current = true;
        setAttendanceDraft(lesson.id, {
          ...draft,
          [studentId]: { status: draft[studentId]?.status ?? "PRESENT", notes: text?.trim() || undefined },
        });
      },
      "plain-text",
      current,
    );
  }

  function save() {
    if (!canSave) return;
    void action.run(async () => {
      // Check who is async right before sending: if the roll call changed under this
      // draft, show what changed instead of saving a roster that no longer matches.
      const fresh = splitRollCall(await request<EnrollmentLite[]>("/api/enrollments?isActive=true"));
      const onRoll = new Set(rosterIds);
      if (fresh.offRoll.some((e) => onRoll.has(e.studentId)) || fresh.roster.some((e) => !onRoll.has(e.studentId))) {
        await enrollments.refresh();
        feedback("warning");
        return;
      }
      await request("/api/attendance/batch", "POST", { lessonId: lesson.id, records: buildBatchRecords(draft, rosterIds) });
      setNotice(null);
      await attendance.refresh();
      feedback("success");
    });
  }

  function resetAttendance() {
    confirmAction(
      "Reset attendance",
      "This permanently deletes every attendance record for this lesson. This can't be undone.",
      () => {
        void (async () => {
          try {
            await request(`/api/lessons/${encodeURIComponent(lesson.id)}/reset-attendance`, "POST");
            touchedRef.current = false;
            setAttendanceDraft(lesson.id, {});
            await attendance.refresh();
          } catch (error) {
            Alert.alert("Unable to reset", error instanceof Error ? error.message : "Please try again.");
          }
        })();
      },
      true,
    );
  }

  const saveLabel = !canManage
    ? "Read-only access"
    : future
      ? "Opens on the lesson date"
      : action.busy
        ? "Saving…"
        : !resolved
          ? `Mark ${totals.remaining} more to save`
          : !dirty
            ? "Attendance saved"
            : "Save";

  const dateLabel = new Date(`${lesson.scheduledDate.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: "Attendance",
          headerRight: canManage
            ? () => (
                <MenuView
                  title="Attendance"
                  actions={[{ id: "reset", title: "Reset attendance", attributes: { destructive: true } }]}
                  onPressAction={({ nativeEvent }) => {
                    if (nativeEvent.event === "reset") resetAttendance();
                  }}
                >
                  <Pressable accessibilityRole="button" accessibilityLabel="More options" hitSlop={8} style={{ padding: 6 }}>
                    <Icon ios="ellipsis.circle" android="more_horiz" size={22} color={colors.text} />
                  </Pressable>
                </MenuView>
              )
            : undefined,
        }}
      />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="stacked"
        hideWhenScrolling={false}
        placeholder="Find a student"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
      />
      <Screen
        bottom={insets.bottom + 170}
        refreshing={enrollments.loading || attendance.loading}
        onRefresh={() => {
          void enrollments.refresh();
          void attendance.refresh();
        }}
      >
        <Copy kind="caption">
          Lesson {lesson.lessonNumber} · {dateLabel}
          {lesson.examSection ? ` · ${lesson.examSection.displayName}` : ""}
        </Copy>
        {offline && (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.danger}>
              You're offline
            </Copy>
            <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
          </View>
        )}
        <ResourceState
          loading={enrollments.loading}
          error={offline ? undefined : enrollments.error || attendance.error}
          retry={() => {
            void enrollments.refresh();
            void attendance.refresh();
          }}
        />

        {!canManage && (
          <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.hover }}>
            <Copy kind="caption">You have read-only access. Attendance can only be changed by an administrator.</Copy>
          </View>
        )}
        {canManage && future && (
          <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.hover }}>
            <Copy kind="caption">This lesson hasn't happened yet — attendance opens on {dateLabel}.</Copy>
          </View>
        )}
        {notice && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 16, backgroundColor: colors.warningSoft, gap: 8 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>This roll call changed</Copy>
            <Copy kind="caption">{notice}</Copy>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss roll call change"
              onPress={() => setNotice(null)}
              hitSlop={8}
              style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}
            >
              <Copy style={{ color: colors.primary, fontWeight: "600" }}>Dismiss</Copy>
            </Pressable>
          </View>
        )}

        {!!roster.length && (
          <>
            <View style={{ gap: 6 }}>
              <Copy kind="body">
                <Copy style={{ fontWeight: "700" }}>{totals.marked}</Copy> of {roster.length} marked
              </Copy>
              <View style={{ height: 5, borderRadius: 2.5, backgroundColor: colors.border, overflow: "hidden" }}>
                <View
                  style={{
                    width: `${roster.length ? (totals.marked / roster.length) * 100 : 0}%`,
                    height: "100%",
                    borderRadius: 2.5,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
            </View>
            {/* NativeActionButton (@expo/ui's SwiftUI Host) only ever renders at a
                nonzero width when it's the sole child of a column — every other
                screen in this codebase already follows that convention. Placed
                inline in a row next to another flexible sibling, it silently
                collapses to zero width (confirmed live on simulator, not a guess). */}
            <Button
              label="Rest present"
              secondary
              disabled={!canEdit}
              onPress={() => {
                touchedRef.current = true;
                setAttendanceDraft(lesson.id, restPresent(draft, rosterIds));
              }}
            />

            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <StatusCount label="Present" value={totals.present} color={colors.success} />
              <StatusCount label="Late" value={totals.late} color={colors.warning} />
              <StatusCount label="Absent" value={totals.absent} color={colors.danger} />
              <StatusCount label="Excused" value={totals.excused} color={colors.info} />
            </View>

            <View style={{ backgroundColor: colors.surface, borderRadius: 24, overflow: "hidden" }}>
              {!visibleRoster.length && (
                <View style={{ padding: 18 }}>
                  <Copy kind="caption">No students match "{query.trim()}".</Copy>
                </View>
              )}
              {visibleRoster.map((entry, index) => (
                <RosterRow
                  key={entry.studentId}
                  name={entry.student.name}
                  yearLevel={entry.yearLevel}
                  mark={draft[entry.studentId]}
                  canEdit={canEdit}
                  divider={index < visibleRoster.length - 1}
                  onSetStatus={(status) => setMark(entry.studentId, status)}
                  onEditNote={() => editNote(entry.studentId, entry.student.name)}
                />
              ))}
            </View>
          </>
        )}

        {enrollments.data && !roster.length && (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Copy kind="heading">{offRoll.length ? "No one on this roll call" : "No active students yet"}</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              {offRoll.length
                ? "Every active student is async, and async students are assessed on their Sunday School rotation."
                : "Once students are enrolled, you can take attendance here."}
            </Copy>
          </View>
        )}

        {!!offRoll.length && (
          <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.hover }}>
            <Copy kind="caption">{offRollCallNote(offRoll.map((e) => e.student.name))}</Copy>
          </View>
        )}
      </Screen>

      {!!roster.length && (
        <View style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 18 }}>
          <GlassChrome interactive style={{ borderRadius: 26, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 14 }}>
              <Copy kind="caption" color={colors.success} style={{ fontWeight: "600" }}>
                {totals.present} present
              </Copy>
              <Copy kind="caption" color={colors.warning} style={{ fontWeight: "600" }}>
                {totals.late} late
              </Copy>
              <Copy kind="caption">{totals.remaining} left</Copy>
            </View>
            {/* Button must be the GlassChrome's sole stacked child — see the
                Rest-present comment above for why a row sibling collapses it. */}
            <Button testID="save-attendance" label={saveLabel} disabled={!canSave} onPress={save} />
          </GlassChrome>
        </View>
      )}
    </>
  );
}

function StatusCount({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }} accessible accessibilityLabel={`${value} ${label}`}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Copy kind="caption">{label}</Copy>
    </View>
  );
}

function RosterRow({
  name,
  yearLevel,
  mark,
  canEdit,
  divider,
  onSetStatus,
  onEditNote,
}: {
  name: string;
  yearLevel: string | null;
  mark?: { status: AttendanceStatus; notes?: string };
  canEdit: boolean;
  divider: boolean;
  onSetStatus: (status: AttendanceStatus) => void;
  onEditNote: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  const fillFor = (status: AttendanceStatus) => {
    if (status === "PRESENT") return isDark ? colors.successStrong : colors.success;
    if (status === "LATE") return isDark ? colors.warningStrong : colors.warning;
    if (status === "ABSENT") return colors.danger;
    return colors.info;
  };
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 64, paddingVertical: 8, paddingLeft: 16, paddingRight: 12 },
        divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mark?.notes ? `${name}, note: ${mark.notes}` : `Add note for ${name}`}
        onPress={onEditNote}
        disabled={!canEdit}
        style={{ flex: 1, minWidth: 0, gap: 1 }}
      >
        <Copy numberOfLines={1} style={{ fontSize: 16, fontWeight: "500" }}>
          {name}
        </Copy>
        <Copy kind="caption" numberOfLines={1}>
          {yearLevelLabel(yearLevel)}
          {mark?.notes ? ` · ${mark.notes}` : ""}
        </Copy>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {STATUS_META.map((status) => {
          const selected = mark?.status === status.value;
          const fill = fillFor(status.value);
          return (
            <Pressable
              key={status.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !canEdit }}
              accessibilityLabel={`${name}: ${status.label}`}
              disabled={!canEdit}
              onPress={() => { if (!selected) feedback("selection"); onSetStatus(status.value); }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: selected ? fill : colors.hover,
                opacity: canEdit ? 1 : 0.5,
              }}
            >
              <Icon
                ios={statusIcon(status.value)}
                android="check"
                size={18}
                color={selected ? "#FFFFFF" : colors.muted}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function statusIcon(status: AttendanceStatus) {
  if (status === "PRESENT") return "checkmark" as const;
  if (status === "LATE") return "clock" as const;
  if (status === "ABSENT") return "xmark" as const;
  return "shield" as const;
}
