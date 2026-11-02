import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, useWindowDimensions, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import type {
  SundaySchoolDashboard,
  SundaySchoolMeetingMark,
  SundaySchoolServantsMeeting,
  SundaySchoolServantsMeetingSaveResponse,
  SundaySchoolServantsMeetingsResponse,
} from "@stmark/contracts";
import { Copy, Icon, InitialsAvatar, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { feedback } from "@/data/haptics";
import { endpoint, query, request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useChurchToday } from "@/data/use-liturgical";
import { pickerDateFor } from "@/data/liturgical";
import {
  SERVANTS_MEETINGS_PATH,
  MAX_MEETING_TITLE,
  afterCreate,
  attendanceGate,
  buildSaveBody,
  checkNewMeeting,
  meetingDateLabel,
  meetingDay,
  meetingFailure,
  meetingTitleLabel,
  progressLabel,
  reconcileMarks,
  servantsMeetingGroups,
  unmarkedCount,
  type MeetingMarks,
} from "@/data/servants-meetings";
import { MinistryTintProvider, sansRegular, useAppTheme } from "@/theme";

export default function ServantsMeetings() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <MeetingsScreen />
    </MinistryTintProvider>
  );
}

type Notice = { tone: "ok" | "warn" | "error"; text: string };

function MeetingsScreen() {
  const params = useLocalSearchParams<{ ageGroupId?: string; meetingId?: string }>();
  const { colors } = useAppTheme();
  const { user, viewingAs } = useAuth();
  const today = useChurchToday();
  // At the largest text sizes a row stacks its name above its controls rather than squeezing both.
  const { fontScale, width: windowWidth } = useWindowDimensions();
  // The pickers (native menus) size to their content, so they are given the screen's real content width.
  const [contentWidth, setContentWidth] = useState(0);
  const pickerWidth = contentWidth || windowWidth - 44;
  const large = fontScale >= 1.5;

  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const groups = useMemo(() => servantsMeetingGroups(dashboard.data), [dashboard.data]);
  const [groupId, setGroupId] = useState(params.ageGroupId ?? "");
  const group = groups.find((item) => item.id === groupId) ?? groups[0];
  const [meetingId, setMeetingId] = useState<string | undefined>(params.meetingId);

  // The answer depends on who asks, so it is cached per signed-in (or viewed) account.
  const scope = user ? `servants-meetings:${viewingAs ? `${viewingAs.originalId}>` : ""}${user.id}` : undefined;
  const resource = useResource<SundaySchoolServantsMeetingsResponse>(
    group ? `${SERVANTS_MEETINGS_PATH}?${query({ ageGroupId: group.id, meetingId })}` : null,
    scope,
  );
  const data = resource.data;
  const meeting = data?.meeting ?? null;
  const roster = useMemo(() => data?.roster ?? [], [data?.roster]);

  const [draft, setDraft] = useState<{ meetingId: string; marks: MeetingMarks }>({ meetingId: "", marks: {} });
  const marks = draft.meetingId === meeting?.id ? draft.marks : {};
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState(today);
  const [newTitle, setNewTitle] = useState("");

  // After a refresh, a mark stays only for someone still on the roster; anyone new starts unmarked.
  useEffect(() => {
    setDraft((current) =>
      current.meetingId && current.meetingId === data?.meeting?.id
        ? { ...current, marks: reconcileMarks(current.marks, roster) }
        : current,
    );
  }, [data?.meeting?.id, roster]);

  const gate = meeting
    ? attendanceGate({ canManageAttendance: !!data?.canManageAttendance, day: meetingDay(meeting), today, previewing: !!viewingAs })
    : "view-only";
  const editable = gate === "editable";
  const unmarked = unmarkedCount(roster, marks);
  const canCreate = !!data?.canCreate && !viewingAs;
  const denied = resource.errorStatus === 403;

  function chooseGroup(id: string) {
    setGroupId(id);
    setMeetingId(undefined);
    setDraft({ meetingId: "", marks: {} });
    setNotice(null);
    setAdding(false);
  }
  function chooseMeeting(id: string) {
    setMeetingId(id);
    setDraft({ meetingId: "", marks: {} });
    setNotice(null);
  }
  function mark(personId: string, status: SundaySchoolMeetingMark) {
    if (!editable || !meeting || busy) return;
    if (marks[personId] !== status) feedback("selection");
    setDraft({ meetingId: meeting.id, marks: { ...marks, [personId]: status } });
  }

  async function reloadAfterFailure(kind: ReturnType<typeof meetingFailure>["kind"]) {
    if (kind === "missing") setMeetingId(undefined);
    await resource.refresh();
  }

  async function create() {
    if (!group || busy) return;
    const check = checkNewMeeting({ ageGroupId: group.id, date: newDate, title: newTitle });
    if (!check.ok) return setNotice({ tone: "error", text: check.error });
    setBusy(true);
    setNotice(null);
    try {
      // POST is an upsert on group + year + date: doing it again for the same day opens the existing meeting.
      const created = await request<SundaySchoolServantsMeeting>(SERVANTS_MEETINGS_PATH, "POST", check.body);
      feedback("success");
      setAdding(false);
      setNewTitle("");
      if (afterCreate(created, today) === "open") {
        setNotice({ tone: "ok", text: "Meeting ready for attendance." });
        setDraft({ meetingId: "", marks: {} });
        if (created.id !== meetingId) setMeetingId(created.id);
        else await resource.refresh();
      } else {
        setNotice({
          tone: "ok",
          text: `Meeting planned for ${meetingDateLabel(meetingDay(created))}. It appears here on the meeting date, and attendance opens that day.`,
        });
        await resource.refresh();
      }
    } catch (error) {
      feedback("error");
      const failure = meetingFailure(error);
      setNotice({ tone: "error", text: failure.message });
      if (failure.reload) void reloadAfterFailure(failure.kind);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!meeting || !editable || busy) return;
    const body = buildSaveBody(meeting.id, roster, marks);
    if (!body) return setNotice({ tone: "error", text: "Mark every servant present or absent before saving." });
    setBusy(true);
    setNotice(null);
    try {
      const result = await request<SundaySchoolServantsMeetingSaveResponse>(SERVANTS_MEETINGS_PATH, "PUT", body);
      feedback("success");
      setDraft({ meetingId: "", marks: {} });
      setNotice({ tone: "ok", text: "Meeting attendance saved." });
      // A scheduled date becomes a real meeting on its first save; follow its new ID.
      if (result.meetingId && result.meetingId !== meeting.id) setMeetingId(result.meetingId);
      else await resource.refresh();
    } catch (error) {
      feedback("error");
      const failure = meetingFailure(error);
      setNotice({ tone: "error", text: failure.message });
      if (failure.reload) void reloadAfterFailure(failure.kind);
    } finally {
      setBusy(false);
    }
  }

  const groupActions: MenuAction[] = groups.map(
    (item) => ({ id: item.id, title: item.name, state: item.id === group?.id ? "on" : "off" }) as MenuAction,
  );
  const meetingActions: MenuAction[] = (data?.meetings ?? []).map(
    (item) => ({ id: item.id, title: meetingTitleLabel(item), state: item.id === meeting?.id ? "on" : "off" }) as MenuAction,
  );

  const loadingGroups = dashboard.loading;
  const loading = !!group && resource.loading;

  return (
    <>
      <Stack.Screen options={{ title: "Servants meetings" }} />
      <Screen
        refreshing={resource.refreshing || dashboard.refreshing}
        onRefresh={() => void Promise.all([dashboard.refresh(), resource.refresh()])}
        bottom={editable && roster.length ? 150 : 32}
      >
        <View style={{ height: 0, alignSelf: "stretch" }} onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)} />
        {!!group && <Copy kind="caption">{group.name}{data?.schedule ? ` · ${data.schedule}` : ""}</Copy>}

        {loadingGroups && <ActivityIndicator accessibilityLabel="Loading your school groups" color={colors.primary} />}

        {!loadingGroups && dashboard.error && (
          <ErrorCard text="Could not load your school groups." onRetry={() => void dashboard.refresh()} />
        )}

        {!loadingGroups && !dashboard.error && !group && (
          <Empty
            title="No servants meetings"
            text="Servants meetings are available for your assigned school groups. Ask your coordinator if your assignment is missing."
          />
        )}

        {groups.length > 1 && group && (
          <MenuView
            title="School group"
            actions={groupActions}
            style={{ alignSelf: "stretch" }}
            onPressAction={({ nativeEvent }) => chooseGroup(nativeEvent.event)}
          >
            <Picker label="School group" value={group.name} width={pickerWidth} />
          </MenuView>
        )}

        {/* When access itself is gone the error card below says so; a second card would only repeat it. */}
        {!!notice && !(denied && !data) && <NoticeCard notice={notice} />}

        {loading && <ActivityIndicator accessibilityLabel="Loading meetings" color={colors.primary} />}

        {!!group && resource.error && !data && (
          <ErrorCard
            text={denied ? "You don't have access to this group's meetings." : resource.error}
            onRetry={denied ? undefined : () => void resource.refresh()}
          />
        )}

        {!!data && (
          <>
            <View style={[styles.row, { justifyContent: "space-between", gap: 10, flexWrap: "wrap" }]}>
              <Copy kind="heading">Meetings</Copy>
              {canCreate && !adding && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add meeting"
                  disabled={busy}
                  onPress={() => {
                    setNewDate(today);
                    setNotice(null);
                    setAdding(true);
                  }}
                  style={({ pressed }) => [
                    styles.pill,
                    { minHeight: 44, backgroundColor: pressed ? colors.primarySoft : colors.hover, opacity: busy ? 0.4 : 1 },
                  ]}
                >
                  <Icon ios="plus" android="add" size={16} color={colors.primary} />
                  <Copy color={colors.primary} style={{ fontWeight: "600" }}>Add meeting</Copy>
                </Pressable>
              )}
            </View>

            {adding && canCreate && (
              <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border }}>
                <View style={[styles.row, { justifyContent: "space-between", gap: 10, flexWrap: "wrap" }]}>
                  <Copy style={{ fontWeight: "600" }}>Meeting date</Copy>
                  {/* A later date is allowed: it plans the meeting, and attendance opens on that day. */}
                  <DateTimePicker
                    value={pickerDateFor(newDate)}
                    mode="date"
                    display="compact"
                    style={{ width: 150, height: 36 }}
                    timeZoneName="UTC"
                    accentColor={colors.primary}
                    onValueChange={(_, chosen) => setNewDate(chosen.toISOString().slice(0, 10))}
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Copy style={{ fontWeight: "600" }}>Title (optional)</Copy>
                  <TextInput
                    accessibilityLabel="Meeting title (optional)"
                    placeholder="e.g. Service planning"
                    placeholderTextColor={colors.muted}
                    value={newTitle}
                    onChangeText={setNewTitle}
                    maxLength={MAX_MEETING_TITLE}
                    editable={!busy}
                    returnKeyType="done"
                    style={{
                      minHeight: 48,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      fontFamily: sansRegular,
                      fontSize: 16,
                      color: colors.text,
                    }}
                  />
                </View>
                <View style={[styles.row, { gap: 10 }]}>
                  <ActionButton label={busy ? "Adding…" : "Create meeting"} primary disabled={busy} onPress={() => void create()} />
                  <ActionButton label="Cancel" disabled={busy} onPress={() => setAdding(false)} />
                </View>
              </View>
            )}

            {data.meetings.length === 0 ? (
              <Copy kind="caption">No meetings have taken place yet.</Copy>
            ) : (
              <MenuView title="Meeting" actions={meetingActions} style={{ alignSelf: "stretch" }} onPressAction={({ nativeEvent }) => chooseMeeting(nativeEvent.event)}>
                <Picker label="Meeting" value={meeting ? meetingTitleLabel(meeting) : "Choose a meeting"} width={pickerWidth} />
              </MenuView>
            )}

            {!!meeting && (
              <>
                {gate === "not-yet" && (
                  <Banner title="Attendance opens on the meeting date" text="You can plan a meeting ahead; marks are recorded on or after its day." />
                )}
                {gate === "view-only" && (
                  <Banner
                    title="View only"
                    text={viewingAs ? "Viewing as another account is read-only." : "Only your coordinator, a priest or a Super Admin records this meeting's attendance."}
                  />
                )}

                <Copy kind="caption" accessibilityLabel={progressLabel(roster, marks)}>{progressLabel(roster, marks)}</Copy>

                {roster.length === 0 ? (
                  <Empty title="No servants" text="No active servants are assigned to this school group yet." />
                ) : (
                  <ListSurface>
                    {roster.map((person, index) => {
                      const status = marks[person.id] ?? person.status;
                      return (
                        <View key={person.id}>
                          <View
                            style={{
                              flexDirection: large ? "column" : "row",
                              alignItems: large ? "flex-start" : "center",
                              gap: large ? 8 : 12,
                              paddingHorizontal: 16,
                              paddingVertical: 10,
                              minHeight: 64,
                            }}
                          >
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: large ? undefined : 1, minWidth: 0, alignSelf: "stretch" }}>
                              {/* Decorative: its initials outgrow the circle at the largest sizes, and the name is right there. */}
                              {!large && (
                                <View style={{ flexShrink: 0 }}>
                                  <InitialsAvatar name={person.name} size={36} variant="accent" />
                                </View>
                              )}
                              <Copy numberOfLines={3} style={{ flex: 1, minWidth: 0 }}>{person.name}</Copy>
                            </View>
                            {editable ? (
                              <View style={{ flexDirection: "row", gap: 6 }}>
                                <Toggle
                                  ios="checkmark"
                                  android="check"
                                  label={`Present, ${person.name}`}
                                  selected={status === "PRESENT"}
                                  color={colors.success}
                                  disabled={busy}
                                  onPress={() => mark(person.id, "PRESENT")}
                                />
                                <Toggle
                                  ios="xmark"
                                  android="close"
                                  label={`Absent, ${person.name}`}
                                  selected={status === "ABSENT"}
                                  color={colors.danger}
                                  disabled={busy}
                                  onPress={() => mark(person.id, "ABSENT")}
                                />
                              </View>
                            ) : (
                              <StatusPill
                                label={status === "PRESENT" ? "Present" : status === "ABSENT" ? "Absent" : "Not recorded"}
                                color={status === "PRESENT" ? colors.success : status === "ABSENT" ? colors.danger : colors.muted}
                                soft={status === "PRESENT" ? colors.successSoft : status === "ABSENT" ? colors.dangerSoft : colors.hover}
                              />
                            )}
                          </View>
                          {index < roster.length - 1 && <View style={{ height: 0.5, marginLeft: 64, backgroundColor: colors.border }} />}
                        </View>
                      );
                    })}
                  </ListSurface>
                )}
              </>
            )}
          </>
        )}
      </Screen>

      {editable && roster.length > 0 && (
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
            padding: 14,
            gap: 10,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <View accessibilityLiveRegion="polite">
            <Copy kind="caption" maxFontSizeMultiplier={1.3}>
              {unmarked > 0
                ? `${unmarked} not recorded · mark every servant present or absent to save`
                : "Everyone is marked. Save to record this meeting."}
            </Copy>
          </View>
          <ActionButton
            label={busy ? "Saving…" : "Save meeting attendance"}
            primary
            disabled={busy || unmarked > 0}
            onPress={() => void save()}
          />
        </View>
      )}
    </>
  );
}

function Picker({ label, value, width }: { label: string; value: string; width: number }) {
  const { colors } = useAppTheme();
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={[
        styles.row,
        { gap: 10, width, minHeight: 52, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Copy kind="caption">{label}</Copy>
        <Copy numberOfLines={2} style={{ fontWeight: "600" }}>{value}</Copy>
      </View>
      <Icon ios="chevron.up.chevron.down" android="unfold_more" size={14} color={colors.muted} />
    </View>
  );
}

function NoticeCard({ notice }: { notice: Notice }) {
  const { colors } = useAppTheme();
  const tone =
    notice.tone === "error"
      ? { bg: colors.dangerSoft, fg: colors.danger }
      : notice.tone === "warn"
        ? { bg: colors.warningSoft, fg: colors.warning }
        : { bg: colors.successSoft, fg: colors.success };
  return (
    <View
      accessibilityRole={notice.tone === "error" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: tone.bg, borderRadius: 18, padding: 14 }}
    >
      <Copy color={tone.fg}>{notice.text}</Copy>
    </View>
  );
}

function Banner({ title, text }: { title: string; text: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ padding: 14, borderRadius: 18, backgroundColor: colors.hover, gap: 2 }}>
      <Copy style={{ fontWeight: "600" }}>{title}</Copy>
      <Copy kind="caption">{text}</Copy>
    </View>
  );
}

function ErrorCard({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colors.dangerSoft, borderRadius: 18, padding: 16, gap: 10 }}>
      <Copy color={colors.danger}>{text}</Copy>
      {onRetry && (
        <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={onRetry} style={{ minHeight: 44, justifyContent: "center" }}>
          <Copy style={{ fontWeight: "600" }} color={colors.primary}>Try again</Copy>
        </Pressable>
      )}
    </View>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
      <Copy kind="heading">{title}</Copy>
      <Copy kind="caption" style={{ textAlign: "center" }}>{text}</Copy>
    </View>
  );
}

function Toggle({
  ios,
  android,
  label,
  selected,
  color,
  disabled,
  onPress,
}: {
  ios: Parameters<typeof Icon>[0]["ios"];
  android: Parameters<typeof Icon>[0]["android"];
  label: string;
  selected: boolean;
  color: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? color : colors.hover,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon ios={ios} android={android} size={18} color={selected ? "#FFFFFF" : colors.muted} />
    </Pressable>
  );
}

// The shared Button (an @expo/ui Host) collapses to zero width as a row sibling, so this uses Pressable.
function ActionButton({ label, onPress, disabled = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 48,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary ? colors.primary : colors.hover,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
    >
      <Copy maxFontSizeMultiplier={1.3} style={{ fontWeight: "600", textAlign: "center" }} color={primary ? colors.onAction : colors.text}>
        {label}
      </Copy>
    </Pressable>
  );
}
