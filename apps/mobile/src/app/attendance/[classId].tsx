import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  AttendanceStatus,
  SundaySchoolSessionAttendance,
} from "@stmark/contracts";
import {
  getChildFullName,
  getLevelDisplayName,
  isSessionDateToday,
  organizeAttendanceRoster,
  type AttendanceRosterNameOrder,
} from "@stmark/domain";
import { GlassChrome } from "@/components/chrome";
import {
  Button,
  Card,
  Copy,
  Icon,
  ConnectionBadge,
  Screen,
  readableDate,
  styles,
} from "@/components/ui";
import { attendanceKey, usePortal, meetingDate } from "@/data/portal-provider";
import { rosterProgress, sameMarks, shiftWeek } from "@/data/attendance-draft";
import { useAppTheme } from "@/theme";
import { validDate } from "@/data/ministry";
import { Choice, Toggle } from "@/components/forms";

const statuses: { value: AttendanceStatus; label: string; short: string }[] = [
  { value: "PRESENT", label: "Present", short: "Present" },
  { value: "LATE", label: "Late", short: "Late" },
  { value: "ABSENT", label: "Absent", short: "Absent" },
  { value: "EXCUSED", label: "Excused", short: "Excused" },
];

export default function Attendance() {
  const { classId, date } = useLocalSearchParams<{ classId: string; date?: string }>();
  const { classes } = usePortal();
  const cls = classes.find((item) => item.id === classId);
  if (!cls)
    return (
      <Screen>
        <Copy kind="heading">Class not found</Copy>
        <Copy>Choose a class from the Classes tab.</Copy>
      </Screen>
    );
  return <AttendanceRoster key={`${cls.id}:${date ?? ""}`} classId={cls.id} initialDate={date} />;
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
  const [showPhotos, setShowPhotos] = useState(true);
  const [groupByGender, setGroupByGender] = useState(false);
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
  const current = loaded?.date === date ? loaded.value : null;
  const key = attendanceKey(classId, date);
  const roster = useMemo(() => current?.roster ?? [], [current?.roster]);
  const rosterGroups = useMemo(
    () => organizeAttendanceRoster(roster, { nameOrder, groupByGender }),
    [groupByGender, nameOrder, roster],
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
  const saveLabel = saving
    ? "Saving…"
    : !cls.canServe
      ? "Read-only access"
      : !isSessionDateToday(date)
        ? "Past attendance is read-only"
      : saved && !dirty
        ? "Attendance saved"
        : "Save attendance";

  async function save() {
    if (!current || !canSave) return;
    setSaving(true);
    try {
      const confirmed = await saveAttendance(classId, date, current, marks);
      setLoaded({ date, value: confirmed });
    } catch (error) {
      Alert.alert(
        "Unable to save",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: cls.name, gestureEnabled: true }} />
      <Screen bottom={160 + insets.bottom}>
        <ConnectionBadge />
        <View style={{ gap: 6 }}>
          <Copy kind="title">
            {cls.canServe ? "Take attendance" : "Class attendance"}
          </Copy>
          <Copy color={colors.muted}>
            {getLevelDisplayName(cls.level)} · {roster.length} children
          </Copy>
        </View>
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
                {readableDate(date)}
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
        {!current && !loadError && (
          <ActivityIndicator
            accessibilityLabel="Loading class roster"
            color={colors.primary}
          />
        )}
        {loadError && (
          <Card>
            <Copy color={colors.danger}>{loadError}</Copy>
            <Button
              secondary
              label="Retry"
              onPress={() => setRetry((value) => value + 1)}
            />
          </Card>
        )}
        {current && !roster.length && (
          <Card>
            <Copy>No active children in this class.</Copy>
          </Card>
        )}
        {!!roster.length && (
          <Card>
            <Copy kind="heading">Roster organization</Copy>
            <Choice
              label="Alphabetize by"
              value={nameOrder}
              onChange={(value) => setNameOrder(value as AttendanceRosterNameOrder)}
              options={[
                { value: "last", label: "Last name" },
                { value: "first", label: "First name" },
              ]}
            />
            <Toggle label="Include photos" value={showPhotos} onChange={setShowPhotos} />
            <Toggle
              label="Group roster by gender"
              value={groupByGender}
              onChange={setGroupByGender}
            />
          </Card>
        )}
        <View style={{ gap: 12 }}>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <Copy kind="heading">Class roster</Copy>
            <Copy kind="caption">
              {progress.marked} of {roster.length} marked
            </Copy>
          </View>
          <Button
            label="Mark all present"
            secondary
            disabled={!canEdit || !roster.length}
            onPress={() =>
              setDraft(
                classId,
                date,
                Object.fromEntries(ids.map((id) => [id, "PRESENT" as const])),
              )
            }
          />
          {rosterGroups.map((group) => (
            <View key={group.key} style={{ gap: 12 }}>
              {group.label && (
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  <Copy kind="heading">{group.label}</Copy>
                  <Copy kind="caption">{group.entries.length}</Copy>
                </View>
              )}
              {group.entries.map((child) => (
            <Card key={child.id} style={{ padding: 16, gap: 13 }}>
              <View style={styles.row}>
                {showPhotos && (child.profileImageUrl ? (
                  <Image
                    source={{ uri: child.profileImageUrl }}
                    accessibilityLabel={`${getChildFullName(child)} profile photo`}
                    style={{ width: 40, height: 40, borderRadius: 20 }}
                  />
                ) : (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: colors.primarySoft,
                      borderRadius: 20,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Copy color={colors.primary} style={{ fontWeight: "600" }}>
                      {(child.firstName[0] ?? "") + (child.lastName[0] ?? "")}
                    </Copy>
                  </View>
                ))}
                <View style={{ flex: 1 }}>
                  <Copy style={{ fontWeight: "600" }}>
                    {getChildFullName(child)}
                  </Copy>
                </View>
                {marks[child.id] && (
                  <Icon
                    ios="checkmark.circle.fill"
                    android="check_circle"
                    color={colors.success}
                    size={19}
                  />
                )}
              </View>
              <View style={{ flexDirection: "row", gap: 5, flexWrap: "wrap" }}>
                {statuses.map((status) => {
                  const selected = marks[child.id] === status.value;
                  const color =
                    status.value === "ABSENT"
                      ? colors.danger
                      : status.value === "LATE"
                        ? colors.warning
                        : status.value === "PRESENT"
                          ? colors.success
                          : colors.primary;
                  const background =
                    status.value === "ABSENT"
                      ? colors.dangerSoft
                      : status.value === "LATE"
                        ? colors.warningSoft
                        : status.value === "PRESENT"
                          ? colors.successSoft
                          : colors.primarySoft;
                  return (
                    <Pressable
                      key={status.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: !canEdit }}
                      disabled={!canEdit}
                      accessibilityLabel={`${getChildFullName(child)}: ${status.label}`}
                      onPress={() =>
                        setDraft(classId, date, {
                          ...marks,
                          [child.id]: status.value,
                        })
                      }
                      style={{
                        flexGrow: 1,
                        flexBasis: "22%",
                        minHeight: 44,
                        paddingVertical: 11,
                        paddingHorizontal: 5,
                        borderRadius: 10,
                        borderWidth: 1,
                        backgroundColor: selected ? background : colors.surface,
                        borderColor: selected ? color : colors.border,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Copy
                        kind="caption"
                        color={selected ? color : colors.muted}
                        style={{ fontWeight: selected ? "700" : "400" }}
                      >
                        {status.short}
                      </Copy>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
              ))}
            </View>
          ))}
        </View>
        <Copy kind="caption">
          Tap Save attendance to record your changes. Unsaved changes stay on
          this device until you sign out or reload.
        </Copy>
      </Screen>
      <View
        style={{
          position: "absolute",
          bottom: insets.bottom + 12,
          left: 18,
          right: 18,
          maxWidth: 680,
          alignSelf: "center",
        }}
      >
        <GlassChrome style={{ padding: 14, borderRadius: 26, gap: 10 }}>
          <View accessibilityLiveRegion="polite">
            <Copy
              kind="caption"
              style={{ textAlign: "center" }}
              color={saved && !dirty ? colors.success : colors.muted}
            >
              {saved && !dirty
                ? `${progress.present} here · ${saved.savedAt ? `Saved at ${new Date(saved.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Loaded from database"}`
                : progress.complete
                  ? `${progress.present} here · Ready to save`
                  : `Mark ${roster.length - progress.marked} more to save`}
            </Copy>
          </View>
          <Button
            testID="save-attendance"
            label={saveLabel}
            disabled={!canSave}
            onPress={() => void save()}
          />
        </GlassChrome>
      </View>
    </View>
  );
}
