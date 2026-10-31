import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Alert, Image, Keyboard, Linking, Pressable, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { MenuView } from "@expo/ui/community/menu";
import type { AttendanceStatus, SundaySchoolChild } from "@stmark/contracts";
import {
  getChildFullName,
  organizeAttendanceRoster,
  type AttendanceRosterNameOrder,
} from "@stmark/domain";
import { GlassChrome } from "@/components/chrome";
import { feedback } from "@/data/haptics";
import { Copy, Icon, ConnectionBadge, Screen, styles } from "@/components/ui";
import { useAuth } from "@/data/auth-provider";
import { attendanceKey, usePortal, meetingDate } from "@/data/portal-provider";
import { historyTarget, useCanOpenStudentHistory, useOpenStudentHistory } from "@/components/student-history-parts";
import { SplitScreen, useSplitSelection } from "@/components/split-screen";
import { saveStatusText, shiftWeek, type AttendanceNoticeAction, type SavableStatus } from "@/data/attendance-draft";
import { useAttendanceEditor } from "@/data/use-attendance-editor";
import { AttendanceNotices, AttendanceSaveBar } from "@/components/attendance-save-area";
import { sansRegular, useAppTheme } from "@/theme";
import { validDate } from "@/data/ministry";
import { MinistryTintProvider } from "@/theme";
import { absenceContact, type AbsenceContact } from "@/data/sunday-school-roster";
import { smsUrl, telUrl } from "@/data/contact-book";
import { endpoint, useResource } from "@/data/resources";
import { individualAttendanceRoute } from "@/data/individual-attendance";

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
  const { classes, setDraft, loadAttendance } = usePortal();
  const { user, viewingAs } = useAuth();
  const cls = classes.find((item) => item.id === classId)!;
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(() => initialDate && validDate(initialDate) ? initialDate : meetingDate(cls));
  const [nameOrder, setNameOrder] = useState<AttendanceRosterNameOrder>("last");
  const [showPhotos, setShowPhotos] = useState(false);
  const [groupByGender, setGroupByGender] = useState(false);
  const [query, setQuery] = useState("");
  const [lastWeekSummary, setLastWeekSummary] = useState<{ present: number; total: number } | null>(null);
  // Follow-up for an absent child: call or text them directly (their own
  // number, else a parent's) rather than opening a call-log form. Contact
  // details come from the class's children list, which the server already
  // limits to servants of this class.
  const children = useResource<SundaySchoolChild[]>(
    `${endpoint("children")}?classId=${encodeURIComponent(classId)}&isActive=true`,
  );
  const contacts = useMemo(() => {
    if (!children.data) return undefined;
    return new Map<string, AbsenceContact>(
      children.data.map((child) => [child.id, absenceContact(child, child.family ?? null)]),
    );
  }, [children.data]);

  // Marks are kept on this device the moment they are tapped, then saved on their own (attendance-editor.ts).
  // Read-only access, and any View As preview, never write: the editor does not read, keep or send anything.
  const canEdit = !!cls.canServe && !viewingAs;
  const editor = useAttendanceEditor({ userId: user?.id ?? null, classId, date, canEdit });
  const { state, summary } = editor;

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

  // Marks not yet confirmed keep the "Attendance in progress" accessory alive after leaving this screen.
  // The portal hands out a new setDraft on every render, so it is read through a ref, not listed as a dependency.
  const setDraftRef = useRef(setDraft);
  setDraftRef.current = setDraft;
  useEffect(() => {
    if (state.phase === "ready") setDraftRef.current(classId, date, state.pending);
  }, [classId, date, state.phase, state.pending]);

  // Spoken once per change of where the marks are, not on every tap.
  const announced = useRef(summary.saveState);
  useEffect(() => {
    if (announced.current === summary.saveState) return;
    announced.current = summary.saveState;
    if (summary.saveState === "saved" || summary.saveState === "failed")
      AccessibilityInfo.announceForAccessibility(saveStatusText(summary.saveState, summary.pendingCount).title);
  }, [summary.saveState, summary.pendingCount]);

  const current = state.attendance;
  const loadError = state.phase === "error" ? state.loadError : null;
  const marks = state.marks;
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
  const ids = summary.rosterIds;
  // Editable for any week, not just today's session — the server no longer
  // enforces a same-day window either (app/api/sunday-school/sessions and
  // .../attendance/batch both dropped their own isSessionDateToday checks,
  // a deliberate policy change, not an oversight). Taps stay live during an
  // automatic save; only the explicit save holds them for its few seconds.
  const rowsEditable = canEdit && state.phase === "ready" && !state.finalizing;
  const busy = state.saving;

  // The note shown is what was typed here, else what the server holds.
  const noteFor = (childId: string) => state.notes[childId] ?? state.savedNotes[childId] ?? undefined;
  function editNote(childId: string, name: string) {
    if (!rowsEditable) return;
    Alert.prompt(
      `Note for ${name}`,
      undefined,
      (text) => editor.setNote(childId, text?.trim() ?? ""),
      "plain-text",
      noteFor(childId) ?? "",
    );
  }

  // The explicit save records everyone still unmarked as absent, so it says so first.
  function confirmAndSave() {
    if (!summary.canFinalize) return;
    const unmarked = summary.unmarkedCount;
    if (!unmarked) {
      void editor.save(true).then((saved) => feedback(saved ? "success" : "error"));
      return;
    }
    Alert.alert(
      `Mark ${unmarked} ${unmarked === 1 ? "child" : "children"} absent?`,
      `Saving records the ${unmarked} ${unmarked === 1 ? "child" : "children"} you haven't marked as absent.`,
      [
        { text: "Keep marking", style: "cancel" },
        { text: "Save attendance", onPress: () => void editor.save(true).then((saved) => feedback(saved ? "success" : "error")) },
      ],
    );
  }
  function onNotice(action: AttendanceNoticeAction) {
    if (action === "resume") void editor.resume();
    else if (action === "retry") void editor.retry();
    else editor.reload();
  }

  const totals = {
    present: ids.filter((id) => marks[id] === "PRESENT").length,
    late: ids.filter((id) => marks[id] === "LATE").length,
    absent: ids.filter((id) => marks[id] === "ABSENT").length,
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Take attendance",
          gestureEnabled: true,
          headerRight: () => (
            <MenuView
              title="Roster"
              actions={[
                { id: "photos", title: "Include photos", state: showPhotos ? "on" : "off" },
                { id: "gender", title: "Group by gender", state: groupByGender ? "on" : "off" },
                { id: "history", title: "Individual history", image: "clock.arrow.circlepath" },
              ]}
              onPressAction={({ nativeEvent }) => {
                if (nativeEvent.event === "photos") setShowPhotos((v) => !v);
                if (nativeEvent.event === "gender") setGroupByGender((v) => !v);
                // Pushed over this screen, which stays mounted: pending marks and notes are untouched.
                if (nativeEvent.event === "history") router.push(individualAttendanceRoute(classId));
              }}
            >
              <Pressable accessibilityRole="button" accessibilityLabel="More options" hitSlop={8} style={{ padding: 6 }}>
                <Icon ios="ellipsis.circle" android="more_horiz" size={22} color={colors.text} />
              </Pressable>
            </MenuView>
          ),
        }}
      />
      {/* Two panes on a wide window: this list and bottom bar on the left, the child's history beside it. */}
      <SplitScreen listMin={410}>
        <>
      <Screen bottom={24}>
        <Copy kind="caption">{cls.name} · {weekOfLabel(date)}</Copy>
        <ConnectionBadge />

        <GlassChrome style={{ borderRadius: 20, padding: 6 }}>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous week"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
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
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => setDate(shiftWeek(date, 1))}
              style={{ padding: 12, minHeight: 48 }}
            >
              <Icon ios="chevron.right" android="chevron_right" size={20} />
            </Pressable>
          </View>
        </GlassChrome>
        {lastWeekSummary && (
          <Copy kind="caption">
            Last week: {lastWeekSummary.present} of {lastWeekSummary.total} present
          </Copy>
        )}
        {/* Pushed over this screen, which stays mounted: pending marks and notes are untouched. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Individual history"
          onPress={() => router.push(individualAttendanceRoute(classId))}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 14,
            borderRadius: 16, backgroundColor: pressed ? colors.primarySoft : colors.hover, alignSelf: "flex-start",
          })}
        >
          <Icon ios="clock.arrow.circlepath" android="history" size={18} color={colors.primary} />
          <Copy color={colors.primary} style={{ fontWeight: "600" }}>Individual history</Copy>
        </Pressable>

        {viewingAs && (
          <Copy kind="caption">
            Viewing as {user?.name ?? "another person"}: attendance is read-only here.
          </Copy>
        )}
        {state.refreshing && <Copy kind="caption" accessibilityLabel="Refreshing the roster">Refreshing…</Copy>}
        <AttendanceNotices state={state} summary={summary} canEdit={canEdit} onAction={onNotice} />

        {!current && !loadError && (
          <ActivityIndicator
            accessibilityLabel="Loading class roster"
            color={colors.primary}
          />
        )}
        {loadError && (
          <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 18, padding: 16, gap: 10 }}>
            <Copy color={colors.danger}>{loadError}</Copy>
            <Pressable accessibilityRole="button" onPress={() => editor.reload()}>
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
                <Copy style={{ fontWeight: "700" }}>{summary.markedCount}</Copy> of {roster.length} marked
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

            {/* Automatic native search placement floats over the save actions
                on iOS 27. Keep roster search in the scrolling content. */}
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 8,
              backgroundColor: colors.surface, borderColor: colors.border,
              borderWidth: 1, borderRadius: 16, paddingHorizontal: 12,
            }}>
              <Icon ios="magnifyingglass" android="search" size={20} color={colors.muted} />
              <TextInput
                accessibilityLabel="Find a child"
                placeholder="Find a child"
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                style={{
                  flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 12,
                  fontFamily: sansRegular, fontSize: 16, color: colors.text,
                }}
              />
              {!!query && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear child search"
                  onPress={() => setQuery("")}
                  style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <Icon ios="xmark.circle.fill" android="cancel" size={20} color={colors.muted} />
                </Pressable>
              )}
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
                      note={noteFor(child.id)}
                      photo={showPhotos ? child.profileImageUrl : null}
                      initials={(child.firstName[0] ?? "") + (child.lastName[0] ?? "")}
                      status={marks[child.id]}
                      canEdit={rowsEditable}
                      divider={index < group.entries.length - 1}
                      onSetStatus={(status) => editor.mark(child.id, status as SavableStatus)}
                      onEditNote={() => editNote(child.id, getChildFullName(child))}
                      childId={child.id}
                      contact={contacts ? (contacts.get(child.id) ?? null) : undefined}
                    />
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
      </Screen>

      {/* A sibling of the scroll view reserves its actual height, so the last
          roster row stays above the actions. */}
      {!!roster.length && (
        <AttendanceSaveBar
          state={state}
          summary={summary}
          canEdit={canEdit}
          bottomInset={insets.bottom}
          onMarkRest={editor.markRestPresent}
          onSave={confirmAndSave}
        />
      )}

        </>
      </SplitScreen>
    </>
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
  childId,
  contact,
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
  childId: string;
  /** undefined while contact details load; null when there is no number at all. */
  contact: AbsenceContact | undefined;
}) {
  const { colors } = useAppTheme();
  const canOpenHistory = useCanOpenStudentHistory();
  const openHistory = useOpenStudentHistory();
  // Beside the history pane the list column is narrow: the decorative avatar gives its width to the name.
  const split = useSplitSelection();
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
      {!split && (photo ? (
        <Image source={{ uri: photo }} accessibilityLabel={`${name} profile photo`} style={{ width: 36, height: 36, borderRadius: 18 }} />
      ) : (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600" }}>{initials}</Copy>
        </View>
      ))}
      {canOpenHistory ? (
        // Two separate controls, apart from the Present/Late/Absent buttons: the
        // name opens the child's history, the line under it edits the note.
        // Opening history leaves this screen mounted, so unsaved marks stay put.
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-start" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name}, view attendance, notes and visitations`}
            onPress={() => openHistory(historyTarget(childId, name))}
            hitSlop={{ top: 6, bottom: 2, left: 4, right: 4 }}
            style={({ pressed }) => ({ maxWidth: "100%", opacity: pressed ? 0.6 : 1 })}
          >
            <Copy numberOfLines={1} color={colors.primary} style={{ fontSize: 16, fontWeight: "500" }}>{name}</Copy>
          </Pressable>
          {(!!note || canEdit) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={note ? `Note for ${name}: ${note}. Edit` : `Add note for ${name}`}
              onPress={onEditNote}
              disabled={!canEdit}
              hitSlop={{ top: 2, bottom: 6, left: 4, right: 4 }}
              style={{ maxWidth: "100%" }}
            >
              <Copy kind="caption" numberOfLines={1}>{note || "Add note"}</Copy>
            </Pressable>
          )}
        </View>
      ) : (
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
      )}
      {status === "ABSENT" && canEdit && <ContactButton name={name} childId={childId} contact={contact} />}
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
              onPress={() => { if (!selected) feedback("selection"); onSetStatus(item.value); }}
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

/**
 * Shown on an absent child's row: opens a menu to call or text them. With no
 * number anywhere it says so and offers the profile, where one can be added.
 */
function ContactButton({ name, childId, contact }: { name: string; childId: string; contact: AbsenceContact | undefined }) {
  const { colors } = useAppTheme();
  const button = (
    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}>
      <Icon ios="phone" android="call" size={16} color={colors.text2} />
    </View>
  );

  if (!contact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Contact for ${name}`}
        onPress={() =>
          contact === undefined
            ? Alert.alert("Still loading", "Contact details are loading. Try again in a moment.")
            : Alert.alert(
                "No phone number",
                `There's no phone number on file for ${name} or their parents.`,
                [
                  { text: "Open profile", onPress: () => router.push({ pathname: "/child/[id]", params: { id: childId } }) },
                  { text: "OK", style: "cancel" },
                ],
              )
        }
      >
        {button}
      </Pressable>
    );
  }

  const owner = contact.relation === "child" ? contact.who : `${contact.who} (parent)`;
  return (
    <MenuView
      title={`Contact ${owner}`}
      actions={[
        { id: "call", title: `Call ${contact.phone}`, image: "phone" },
        { id: "text", title: `Text ${contact.phone}`, image: "message" },
      ]}
      onPressAction={({ nativeEvent }) => {
        const url = nativeEvent.event === "call" ? telUrl(contact.phone) : smsUrl(contact.phone);
        if (url) void Linking.openURL(url).catch(() => Alert.alert("Couldn't open", "This device can't place that call or text."));
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Call or text ${owner} about ${name}`}
        hitSlop={4}
      >
        {button}
      </Pressable>
    </MenuView>
  );
}

function statusIcon(status: AttendanceStatus) {
  if (status === "PRESENT") return "checkmark" as const;
  if (status === "LATE") return "clock" as const;
  return "xmark" as const;
}
