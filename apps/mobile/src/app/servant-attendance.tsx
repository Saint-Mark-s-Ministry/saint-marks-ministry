import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { getTodayDateInputValue } from "@stmark/domain";
import type { SundaySchoolServantAttendanceResponse } from "@stmark/contracts";
import { Copy, Icon, InitialsAvatar, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { ResourceState, confirmAction, useAction } from "@/components/forms";
import { endpoint, query, request, useResource } from "@/data/resources";
import { usePortal, meetingDate } from "@/data/portal-provider";
import { useAuth } from "@/data/auth-provider";
import { shiftWeek } from "@/data/attendance-draft";
import { shortMonthDay } from "@/data/sunday-school-classes";
import {
  assignmentChangedMessage,
  editLockReason,
  missingServantsLabel,
  restPresentServants,
  rosterChangedSinceDraft,
  servantProgress,
  type ServantMarks,
} from "@/data/sunday-school-servant-attendance";
import { MinistryTintProvider, serifDisplay, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

export default function ServantAttendance() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <ServantAttendanceScreen />
    </MinistryTintProvider>
  );
}

function ServantAttendanceScreen() {
  const params = useLocalSearchParams<{ classId?: string }>();
  const { colors } = useAppTheme();
  const { classes } = usePortal();
  const { user } = useAuth();

  const allowed = useMemo(
    () => classes.filter((c) => c.canViewServantAttendance || c.canTakeServantAttendance),
    [classes],
  );
  const [classId, setClassId] = useState(params.classId ?? allowed[0]?.id ?? "");
  const cls = allowed.find((c) => c.id === classId);
  const [date, setDate] = useState(() => (cls ? meetingDate(cls) : getTodayDateInputValue()));

  useEffect(() => {
    if (!allowed.length || allowed.some((c) => c.id === classId)) return;
    setClassId(allowed[0].id);
    setDate(meetingDate(allowed[0]));
  }, [allowed, classId]);

  function chooseClass(next: typeof allowed[number]) {
    setClassId(next.id);
    setDate(meetingDate(next));
  }

  const resource = useResource<SundaySchoolServantAttendanceResponse>(
    cls ? `${endpoint("servant-attendance")}?${query({ classId, date })}` : null,
  );
  const offline = resource.error === OFFLINE;
  const roster = resource.data?.roster ?? [];
  const rosterIds = roster.map((p) => p.userId);

  const draftKey = user ? `stmark.servant-attendance.${user.id}.${classId}:${date}` : null;
  const [marks, setMarks] = useState<ServantMarks>({});
  const [draftReady, setDraftReady] = useState(false);
  const [rosterChangedWarning, setRosterChangedWarning] = useState(false);
  const action = useAction();

  // Load order: start from the server's own saved marks, then overlay a
  // persisted local draft if this exact class+date has one — the draft
  // recovery the acceptance criteria ask for, surviving backgrounding or
  // navigating away mid-edit (the old screen's own comment said the
  // opposite: "lost when leaving this screen").
  useEffect(() => {
    let active = true;
    setDraftReady(false);
    setRosterChangedWarning(false);
    const serverMarks: ServantMarks = Object.fromEntries(
      roster.flatMap((p) => (p.attendance ? [[p.userId, p.attendance.status]] : [])),
    );
    (async () => {
      let draft: { marks: ServantMarks; rosterIds: string[] } | null = null;
      if (draftKey) {
        try {
          const raw = await SecureStore.getItemAsync(draftKey);
          if (raw) draft = JSON.parse(raw);
        } catch {
          /* a corrupt draft is discarded, not fatal */
        }
      }
      if (!active) return;
      if (draft) {
        setMarks({ ...serverMarks, ...draft.marks });
        if (rosterIds.length && rosterChangedSinceDraft(draft.rosterIds, rosterIds)) setRosterChangedWarning(true);
      } else {
        setMarks(serverMarks);
      }
      setDraftReady(true);
    })();
    return () => {
      active = false;
    };
    // Only the identity of the loaded resource matters here, not its full
    // reference (resource.data changes shape every refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, resource.data?.session?.id, roster.length]);

  useEffect(() => {
    if (!draftKey || !draftReady) return;
    void SecureStore.setItemAsync(draftKey, JSON.stringify({ marks, rosterIds }), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }).catch(() => undefined);
    // rosterIds is derived from roster each render; only its content, not identity, matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, marks, draftReady]);

  function clearDraft() {
    if (draftKey) void SecureStore.deleteItemAsync(draftKey).catch(() => undefined);
  }

  const today = getTodayDateInputValue();
  const lock = editLockReason(!!resource.data?.canEdit, !!cls?.canTakeServantAttendance, date === today);
  const progress = servantProgress(rosterIds, marks);
  const missing = missingServantsLabel(progress);

  const classActions: MenuAction[] = allowed.map(
    (c) => ({ id: c.id, title: c.name, state: c.id === classId ? "on" : "off" }) as MenuAction,
  );

  function setMark(userId: string, status: ServantMarks[string]) {
    void Haptics.selectionAsync().catch(() => undefined);
    setMarks((m) => ({ ...m, [userId]: status }));
  }

  function save() {
    void action.run(async () => {
      try {
        await request(endpoint("servant-attendance/batch"), "POST", {
          classId,
          date,
          records: rosterIds.map((id) => ({ servantId: id, status: marks[id] })),
        });
        clearDraft();
        await resource.refresh();
      } catch (error) {
        if (error instanceof Error && /active roster/i.test(error.message)) {
          throw new Error(assignmentChangedMessage([]));
        }
        throw error;
      }
    }, "Attendance saved");
  }

  return (
    <>
      {/* The serif heading below carries the title, so the native large title stays off. */}
      <Stack.Screen options={{ title: "", headerLargeTitle: false }} />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()} bottom={lock.locked ? 32 : 110}>
        <View style={{ paddingHorizontal: 4, gap: 2 }}>
          <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>Servant attendance</Copy>
          <Copy kind="caption">
            {cls?.name ?? "No class"} · week of {shortMonthDay(date)}
          </Copy>
        </View>

        {!allowed.length && (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Copy kind="heading">Not available for this account</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              No classes with servant attendance access are assigned to this account.
            </Copy>
          </View>
        )}

        {!!allowed.length && (
          <>
            {allowed.length > 1 &&
              (allowed.length <= 2 ? (
                <SegmentedControl
                  values={allowed.map((c) => c.name)}
                  selectedIndex={Math.max(0, allowed.findIndex((c) => c.id === classId))}
                  onChange={({ nativeEvent }) => chooseClass(allowed[nativeEvent.selectedSegmentIndex])}
                  style={{ width: "100%", minHeight: 36 }}
                />
              ) : (
                <MenuView
                  title="Class"
                  actions={classActions}
                  onPressAction={({ nativeEvent }) => {
                    const next = allowed.find((c) => c.id === nativeEvent.event);
                    if (next) chooseClass(next);
                  }}
                >
                  <FilterChip label={cls?.name ?? "Choose a class"} />
                </MenuView>
              ))}

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: colors.surface,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 6,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous week"
                hitSlop={6}
                onPress={() => setDate((d) => shiftWeek(d, -1))}
                style={({ pressed }) => [styles.row, { width: 40, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.hover : "transparent" }]}
              >
                <Icon ios="chevron.left" android="chevron_left" size={16} color={colors.text} />
              </Pressable>
              <Copy style={{ fontWeight: "600" }}>{shortMonthDay(date)}</Copy>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next week"
                hitSlop={6}
                disabled={date >= today}
                onPress={() => setDate((d) => shiftWeek(d, 1))}
                style={({ pressed }) => [{ width: 40, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.hover : "transparent", opacity: date >= today ? 0.3 : 1 }]}
              >
                <Icon ios="chevron.right" android="chevron_right" size={16} color={colors.text} />
              </Pressable>
            </View>

            {lock.locked && (
              <View style={{ padding: 14, borderRadius: 18, backgroundColor: colors.hover, gap: 2 }}>
                <Copy style={{ fontWeight: "600" }}>{lock.reason === "permission" ? "View only" : "Viewing a past week"}</Copy>
                <Copy kind="caption">{lock.message}</Copy>
              </View>
            )}

            {rosterChangedWarning && !lock.locked && (
              <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 2 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.warning}>Assignments changed</Copy>
                <Copy kind="caption">This class's servants changed since your last unsaved draft. Review the marks below before saving.</Copy>
              </View>
            )}

            {offline && resource.stale && (
              <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
                <Copy kind="caption">Showing the last roster we had. Pull down to try again once you're back online.</Copy>
              </View>
            )}
            {!resource.stale && (
              <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />
            )}

            {resource.data && !roster.length && (
              <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
                <Copy kind="heading">No servants assigned</Copy>
                <Copy kind="caption" style={{ textAlign: "center" }}>
                  No active servants are assigned directly to this class.
                </Copy>
              </View>
            )}

            {!!roster.length && (
              <View style={{ gap: 10 }}>
                <View style={[styles.row, { gap: 14, paddingHorizontal: 4 }]}>
                  <StatusCount label="Present" value={progress.present} color={colors.success} />
                  <StatusCount label="Absent" value={progress.absent} color={colors.danger} />
                </View>
                <ListSurface>
                  {roster.map((p, index, arr) => (
                    <View key={p.userId}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 64 }}>
                        <InitialsAvatar name={p.name} size={36} variant="accent" />
                        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                          <Copy numberOfLines={1}>{p.name}</Copy>
                          <Copy kind="caption" numberOfLines={1}>{p.authority === "COORDINATOR" ? "Coordinator" : "Servant"}</Copy>
                        </View>
                        {!lock.locked ? (
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            <StatusToggle
                              ios="checkmark"
                              android="check"
                              label={`Present, ${p.name}`}
                              selected={marks[p.userId] === "PRESENT"}
                              color={colors.success}
                              onPress={() => setMark(p.userId, "PRESENT")}
                            />
                            <StatusToggle
                              ios="xmark"
                              android="close"
                              label={`Absent, ${p.name}`}
                              selected={marks[p.userId] === "ABSENT"}
                              color={colors.danger}
                              onPress={() => setMark(p.userId, "ABSENT")}
                            />
                          </View>
                        ) : (
                          <StatusPill
                            label={p.attendance?.status === "PRESENT" ? "Present" : p.attendance?.status === "ABSENT" ? "Absent" : "Not recorded"}
                            color={p.attendance?.status === "PRESENT" ? colors.success : p.attendance?.status === "ABSENT" ? colors.danger : colors.muted}
                            soft={p.attendance?.status === "PRESENT" ? colors.successSoft : p.attendance?.status === "ABSENT" ? colors.dangerSoft : colors.hover}
                          />
                        )}
                      </View>
                      {index < arr.length - 1 && <View style={{ height: 0.5, marginLeft: 64, backgroundColor: colors.border }} />}
                    </View>
                  ))}
                </ListSurface>
              </View>
            )}
          </>
        )}
      </Screen>

      {!lock.locked && !!roster.length && (
        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 24,
            backgroundColor: colors.surface,
            borderRadius: 26,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Copy kind="caption" numberOfLines={1} style={{ minWidth: 0, flexShrink: 1, flexGrow: 0 }}>{missing ?? "All marked"}</Copy>
          <BarButton
            label="Mark rest"
            accessibilityLabel="Mark the rest present"
            disabled={action.busy || progress.complete}
            onPress={() => confirmAction("Mark the rest present?", "Servants already marked keep their status.", () => setMarks((m) => restPresentServants(rosterIds, m)))}
          />
          <BarButton
            primary
            label={action.busy ? "Saving…" : "Save"}
            disabled={action.busy || !progress.complete}
            onPress={save}
          />
        </View>
      )}
    </>
  );
}

function FilterChip({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: pressed ? colors.hover : colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 36 },
      ]}
    >
      <Copy kind="caption" style={{ fontWeight: "600" }}>{label}</Copy>
      <Icon ios="chevron.up.chevron.down" android="unfold_more" size={12} color={colors.muted} />
    </Pressable>
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

function StatusToggle({
  ios,
  android,
  label,
  selected,
  color,
  onPress,
}: {
  ios: Parameters<typeof Icon>[0]["ios"];
  android: Parameters<typeof Icon>[0]["android"];
  label: string;
  selected: boolean;
  color: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? color : colors.hover,
      }}
    >
      <Icon ios={ios} android={android} size={18} color={selected ? "#FFFFFF" : colors.muted} />
    </Pressable>
  );
}

// The shared Button component (an @expo/ui SwiftUI Host) only ever renders at
// a nonzero width when it's the sole child of a column — confirmed on every
// attendance-style bottom bar in this rebuild — so this bar uses a plain
// Pressable instead, same as the child-attendance screen's own BarButton.
function BarButton({ label, accessibilityLabel, onPress, disabled = false, primary = false }: { label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: 0,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
        backgroundColor: primary ? colors.primary : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Copy numberOfLines={1} style={{ fontWeight: "600" }} color={primary ? "#FFFFFF" : colors.text}>{label}</Copy>
    </Pressable>
  );
}
