import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { MenuView } from "@expo/ui/community/menu";
import type {
  AttendanceStatus,
  SundaySchoolSessionAttendance,
} from "@stmark/contracts";
import {
  getChildFullName,
  isSessionDateToday,
  organizeAttendanceRoster,
  type AttendanceRosterNameOrder,
} from "@stmark/domain";
import { GlassChrome } from "@/components/chrome";
import { Copy, Icon, ConnectionBadge, Screen, styles } from "@/components/ui";
import { useAuth } from "@/data/auth-provider";
import { attendanceKey, usePortal, meetingDate } from "@/data/portal-provider";
import { rosterProgress, restPresent, sameMarks, shiftWeek } from "@/data/attendance-draft";
import { useAppTheme } from "@/theme";
import { validDate } from "@/data/ministry";
import { MinistryTintProvider } from "@/theme";

const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "Absent" },
  // Sunday School attendance is no longer Excused (app/api/sunday-school/attendance/batch's
  // own policy — confirmed by its test, "rejects Excused because Sunday School attendance
  // is no longer excused"). The ticket's own artboard still shows a 4th Excused button, but
  // selecting and saving it would 400 against the real route, so it isn't built here.
];

function weekOfLabel(date: string) {
  return `Week of ${new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

export default function Attendance() {
  const { classId, date } = useLocalSearchParams<{ classId: string; date?: string }>();
  const { classes } = usePortal();
  const cls = classes.find((item) => item.id === classId);
  if (!cls)
    return (
      <MinistryTintProvider ministry="sundaySchool">
        <Screen>
          <Copy kind="heading">Class not found</Copy>
          <Copy>Choose a class from the Classes tab.</Copy>
        </Screen>
      </MinistryTintProvider>
    );
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <AttendanceRoster key={`${cls.id}:${date ?? ""}`} classId={cls.id} initialDate={date} />
    </MinistryTintProvider>
  );
}

function AttendanceRoster({ classId, initialDate }: { classId: string; initialDate?: string }) {
  const {
    classes,
    attendance,
    drafts,
    setDraft,
    saveAttendance,
    loadAttendance,
  } = usePortal();
  const { user } = useAuth();
  const cls = classes.find((item) => item.id === classId)!;
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(() => initialDate && validDate(initialDate) && initialDate <= new Date().toISOString().slice(0, 10) ? initialDate : meetingDate(cls));
  const [loaded, setLoaded] = useState<{
    date: string;
    value: SundaySchoolSessionAttendance;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [nameOrder, setNameOrder] = useState<AttendanceRosterNameOrder>("last");
  const [showPhotos, setShowPhotos] = useState(false);
  const [groupByGender, setGroupByGender] = useState(false);
  const [query, setQuery] = useState("");
  const [lastWeekSummary, setLastWeekSummary] = useState<{ present: number; total: number } | null>(null);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    setLoaded(null);
    void loadAttendance(classId, date)
      .then((value) => {
        if (active) setLoaded({ date, value });
      })
      .catch((error) => {
        if (active)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load attendance.",
          );
      });
    return () => {
      active = false;
    };
  }, [classId, date, loadAttendance, retry]);

  // Recent attendance context: a quick read of last week's session, purely
  // informational — failures here are silent, since the main roster above
  // already has its own error handling and this is a nice-to-have add-on.
  useEffect(() => {
    let active = true;
    setLastWeekSummary(null);
    void loadAttendance(classId, shiftWeek(date, -1))
      .then((value) => {
        if (!active) return;
        const marked = value.roster.filter((c) => c.attendance);
        if (!marked.length) return;
        const present = marked.filter((c) => c.attendance!.status === "PRESENT" || c.attendance!.status === "LATE").length;
        setLastWeekSummary({ present, total: marked.length });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [classId, date, loadAttendance]);

  const current = loaded?.date === date ? loaded.value : null;
  const key = attendanceKey(classId, date);
  const roster = useMemo(() => current?.roster ?? [], [current?.roster]);
  const q = query.trim().toLowerCase();
  const searchedRoster = useMemo(
    () => (q ? roster.filter((c) => getChildFullName(c).toLowerCase().includes(q)) : roster),
    [roster, q],
  );
  const rosterGroups = useMemo(
    () => organizeAttendanceRoster(searchedRoster, { nameOrder, groupByGender }),
    [groupByGender, nameOrder, searchedRoster],
  );
  const serverMarks = Object.fromEntries(
    roster.flatMap((child) =>
      child.attendance ? [[child.id, child.attendance.status]] : [],
    ),
  );
  const saved = Object.keys(serverMarks).length ? attendance[key] : undefined;
  const marks = drafts[key] ?? serverMarks;
  const ids = roster.map((child) => child.id);
  const progress = rosterProgress(ids, marks);
  const dirty = !sameMarks(ids, marks, serverMarks);
  const canEdit = !!current && !!cls.canServe && !saving && isSessionDateToday(date);
  const canSave = canEdit && progress.complete && dirty;

  // A note typed this session, kept local to this device and separate from the
  // shared cross-screen `drafts` — persisted so an interruption (app killed,
  // not just backgrounded) doesn't lose a note the way an in-memory-only
  // value would. Cleared once a save actually lands.
  const notesDraftKey = user?.id ? `stmark.attendance-notes.${user.id}.${key}` : null;
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!notesDraftKey) return;
    let active = true;
    SecureStore.getItemAsync(notesDraftKey)
      .then((raw) => {
        if (!active || !raw) return;
        try {
          setNotesDraft(JSON.parse(raw));
        } catch {
          /* a corrupt draft is just dropped */
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [notesDraftKey]);
  useEffect(() => {
    if (!notesDraftKey) return;
    const timeout = setTimeout(() => {
      if (Object.keys(notesDraft).length) void SecureStore.setItemAsync(notesDraftKey, JSON.stringify(notesDraft));
      else void SecureStore.deleteItemAsync(notesDraftKey).catch(() => undefined);
    }, 400);
    return () => clearTimeout(timeout);
  }, [notesDraftKey, notesDraft]);

  function editNote(childId: string, name: string) {
    if (!canEdit) return;
    const current = notesDraft[childId] ?? roster.find((c) => c.id === childId)?.attendance?.notes ?? "";
    Alert.prompt(
      `Note for ${name}`,
      undefined,
      (text) => setNotesDraft((prev) => ({ ...prev, [childId]: text?.trim() ?? "" })),
      "plain-text",
      current,
    );
  }

  const saveLabel = saving
    ? "Saving…"
    : !cls.canServe
      ? "Read-only access"
      : !isSessionDateToday(date)
        ? "Past attendance is read-only"
      : saved && !dirty
        ? "Attendance saved"
        : "Save";

  async function save() {
    if (!current || !canSave) return;
    setSaving(true);
    try {
      const confirmed = await saveAttendance(classId, date, current, marks, notesDraft);
      setLoaded({ date, value: confirmed });
      if (notesDraftKey) {
        setNotesDraft({});
        await SecureStore.deleteItemAsync(notesDraftKey).catch(() => undefined);
      }
    } catch (error) {
      Alert.alert(
        "Unable to save",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const totals = {
    present: ids.filter((id) => marks[id] === "PRESENT").length,
    late: ids.filter((id) => marks[id] === "LATE").length,
    absent: ids.filter((id) => marks[id] === "ABSENT").length,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: "",
          // A two-line compact title (class + week) doesn't leave room for a
          // large title underneath — this is a work/action screen, not a
          // top-level content destination. Matches Servants Prep's own
          // attendance screen, which already established this exact pattern.
          headerLargeTitle: false,
          gestureEnabled: true,
          headerTitle: () => (
            <View style={{ alignItems: "center" }}>
              <Copy style={{ fontWeight: "600", fontSize: 17 }}>{cls.name}</Copy>
              <Copy kind="caption">{weekOfLabel(date)}</Copy>
            </View>
          ),
          headerRight: () => (
            <MenuView
              title="Roster"
              actions={[
                { id: "photos", title: "Include photos", state: showPhotos ? "on" : "off" },
                { id: "gender", title: "Group by gender", state: groupByGender ? "on" : "off" },
              ]}
              onPressAction={({ nativeEvent }) => {
                if (nativeEvent.event === "photos") setShowPhotos((v) => !v);
                if (nativeEvent.event === "gender") setGroupByGender((v) => !v);
              }}
            >
              <Pressable accessibilityRole="button" accessibilityLabel="More options" hitSlop={8} style={{ padding: 6 }}>
                <Icon ios="ellipsis.circle" android="more_horiz" size={22} color={colors.text} />
              </Pressable>
            </MenuView>
          ),
        }}
      />
      <Stack.SearchBar
        autoCapitalize="none"
        placement="automatic"
        placeholder="Find a child"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
      />
      <Screen bottom={160 + insets.bottom}>
        <ConnectionBadge />

        <GlassChrome style={{ borderRadius: 20, padding: 6 }}>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous week"
              disabled={saving}
              onPress={() => setDate(shiftWeek(date, -1))}
              style={{ padding: 12, minHeight: 48 }}
            >
              <Icon ios="chevron.left" android="chevron_left" size={20} />
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Copy kind="caption">CLASS DATE</Copy>
              <Copy style={{ fontWeight: "600", textAlign: "center" }}>
                {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
              </Copy>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next week"
              accessibilityState={{
                disabled: saving || date >= meetingDate(cls),
              }}
              disabled={saving || date >= meetingDate(cls)}
              onPress={() => setDate(shiftWeek(date, 1))}
              style={{
                padding: 12,
                minHeight: 48,
                opacity: date >= meetingDate(cls) ? 0.3 : 1,
              }}
            >
              <Icon ios="chevron.right" android="chevron_right" size={20} />
            </Pressable>
          </View>
        </GlassChrome>
        {!isSessionDateToday(date) && (
          <Copy kind="caption" color={colors.warning}>
            Attendance can only be changed on the session date.
          </Copy>
        )}
        {lastWeekSummary && (
          <Copy kind="caption">
            Last week: {lastWeekSummary.present} of {lastWeekSummary.total} present
          </Copy>
        )}

        {!current && !loadError && (
          <ActivityIndicator
            accessibilityLabel="Loading class roster"
            color={colors.primary}
          />
        )}
        {loadError && (
          <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 18, padding: 16, gap: 10 }}>
            <Copy color={colors.danger}>{loadError}</Copy>
            <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}>
              <Copy style={{ fontWeight: "600" }} color={colors.primary}>Retry</Copy>
            </Pressable>
          </View>
        )}
        {current && !roster.length && (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <Copy>No active children in this class.</Copy>
          </View>
        )}

        {!!roster.length && (
          <>
            <View style={[styles.row, { gap: 10 }]}>
              <Copy style={{ flex: 1 }}>
                <Copy style={{ fontWeight: "700" }}>{progress.marked}</Copy> of {roster.length} marked
              </Copy>
              <Copy kind="caption">Sort</Copy>
              <SegmentedControl
                values={["First", "Last"]}
                selectedIndex={nameOrder === "first" ? 0 : 1}
                onChange={({ nativeEvent }) => setNameOrder(nativeEvent.selectedSegmentIndex === 0 ? "first" : "last")}
                style={{ width: 130, minHeight: 32 }}
              />
            </View>

            <View style={[styles.row, { justifyContent: "space-around" }]}>
              <StatusCount label="Present" value={totals.present} color={colors.success} />
              <StatusCount label="Late" value={totals.late} color={colors.warning} />
              <StatusCount label="Absent" value={totals.absent} color={colors.danger} />
            </View>

            {searchedRoster.length === 0 && (
              <Copy kind="caption">No children match "{query.trim()}".</Copy>
            )}

            {rosterGroups.map((group) => (
              <View key={group.key} style={{ gap: 8 }}>
                {group.label && (
                  <View style={[styles.row, { justifyContent: "space-between" }]}>
                    <Copy kind="heading">{group.label}</Copy>
                    <Copy kind="caption">{group.entries.length}</Copy>
                  </View>
                )}
                <View style={{ backgroundColor: colors.surface, borderRadius: 24, overflow: "hidden" }}>
                  {group.entries.map((child, index) => (
                    <RosterRow
                      key={child.id}
                      name={getChildFullName(child)}
                      note={notesDraft[child.id] ?? child.attendance?.notes ?? undefined}
                      photo={showPhotos ? child.profileImageUrl : null}
                      initials={(child.firstName[0] ?? "") + (child.lastName[0] ?? "")}
                      status={marks[child.id]}
                      canEdit={canEdit}
                      divider={index < group.entries.length - 1}
                      onSetStatus={(status) => setDraft(classId, date, { ...marks, [child.id]: status })}
                      onEditNote={() => editNote(child.id, getChildFullName(child))}
                    />
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
      </Screen>

      {!!roster.length && (
        <View style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 18 }}>
          <GlassChrome interactive style={{ borderRadius: 32, padding: 8, paddingLeft: 18 }}>
            <View style={[styles.row, { gap: 10 }]}>
              <View style={{ flex: 1 }} accessibilityLiveRegion="polite">
                <Copy kind="caption">{roster.length - progress.marked} children left</Copy>
              </View>
              <BarButton
                label="Mark rest present"
                disabled={!canEdit}
                onPress={() => setDraft(classId, date, restPresent(ids, marks))}
              />
              <BarButton label={saveLabel} primary disabled={!canSave} onPress={() => void save()} />
            </View>
          </GlassChrome>
        </View>
      )}
    </View>
  );
}

function StatusCount({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }} accessible accessibilityLabel={`${value} ${label}`}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Copy kind="caption">{label}</Copy>
      <Copy kind="caption" style={{ fontWeight: "600" }}>{value}</Copy>
    </View>
  );
}

// The shared Button component (an @expo/ui SwiftUI Host) only ever renders at
// a nonzero width when it's the sole child of a column — confirmed live on
// simulator, and already documented this way on prep-attendance.tsx. Placed
// as a row sibling (two buttons side by side, as this bottom bar needs), it
// silently collapses to zero width, so this bar uses a plain Pressable instead.
function BarButton({
  label,
  onPress,
  disabled = false,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={({ pressed }) => ({
        height: 48,
        paddingHorizontal: 16,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary ? colors.primary : colors.hover,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
      onPress={onPress}
    >
      <Copy style={{ fontWeight: "600" }} color={primary ? colors.onAction : colors.text} numberOfLines={1}>
        {label}
      </Copy>
    </Pressable>
  );
}

function RosterRow({
  name,
  note,
  photo,
  initials,
  status,
  canEdit,
  divider,
  onSetStatus,
  onEditNote,
}: {
  name: string;
  note?: string;
  photo: string | null;
  initials: string;
  status?: AttendanceStatus;
  canEdit: boolean;
  divider: boolean;
  onSetStatus: (status: AttendanceStatus) => void;
  onEditNote: () => void;
}) {
  const { colors } = useAppTheme();
  const fillFor = (value: AttendanceStatus) => {
    if (value === "PRESENT") return colors.success;
    if (value === "LATE") return colors.warning;
    return colors.danger;
  };
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 62, paddingVertical: 8, paddingLeft: 16, paddingRight: 12 },
        divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
      ]}
    >
      {/* Always shown (an initials fallback when there's no photo, or "Include
          photos" is off) — matching the Roster screen's own row convention,
          rather than the artboard's photo-less row, so a row never loses its
          visual anchor. */}
      {photo ? (
        <Image source={{ uri: photo }} accessibilityLabel={`${name} profile photo`} style={{ width: 36, height: 36, borderRadius: 18 }} />
      ) : (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600" }}>{initials}</Copy>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={note ? `${name}, note: ${note}` : `Add note for ${name}`}
        onPress={onEditNote}
        disabled={!canEdit}
        style={{ flex: 1, minWidth: 0, gap: 1 }}
      >
        <Copy numberOfLines={1} style={{ fontSize: 16, fontWeight: "500" }}>{name}</Copy>
        {/* Only rendered when there's something to show — an empty caption still
            takes a line of height, pushing the name off-center against its row. */}
        {!!note && <Copy kind="caption" numberOfLines={1}>{note}</Copy>}
      </Pressable>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {STATUSES.map((item) => {
          const selected = status === item.value;
          const fill = fillFor(item.value);
          return (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !canEdit }}
              accessibilityLabel={`${name}: ${item.label}`}
              disabled={!canEdit}
              onPress={() => onSetStatus(item.value)}
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
              <Icon ios={statusIcon(item.value)} android="check" size={18} color={selected ? "#FFFFFF" : colors.muted} />
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
  return "xmark" as const;
}
