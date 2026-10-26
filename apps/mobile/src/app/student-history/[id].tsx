import { useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import {
  Button,
  Card,
  Copy,
  Icon,
  InitialsAvatar,
  ListSurface,
  readableDate,
  RowLink,
  Screen,
  SectionTitle,
  StatusPill,
  styles,
} from "@/components/ui";
import {
  ATTENDANCE_LABEL,
  ATTENDANCE_TONE,
  CALL_OUTCOME_LABEL,
  CONFIDENTIAL_NOTES_NOTE,
  HISTORY_PROBLEM_MESSAGE,
  HISTORY_TABS,
  PROGRAM_BOUNDARY_NOTE,
  VISITATION_LABEL,
  attendanceSpoken,
  countRows,
  lastVisit,
  parseStudentHistoryParams,
  rateLabel,
  rateTone,
  visitationDate,
  visitationTone,
  type HistoryTab,
  type StudentHistory,
  type Tone,
} from "@/data/student-history";
import { useStudentHistory } from "@/data/use-student-history";
import { useLargeType } from "@/components/attendance-history-parts";
import { MinistryTintProvider, serifHero, useAppTheme } from "@/theme";

/**
 * Attendance, notes and visitations for one saved child, read-only. It is
 * presented as a sheet over whatever screen opened it; that screen stays
 * mounted underneath, so closing the sheet leaves its filters, scroll position,
 * selected class and date, and unsaved marks untouched.
 *
 * The child is identified by `id` and `program` in the route, never by the name
 * shown. Guardian and family contacts, and confidential pastoral notes, are not
 * part of this sheet; the child's profile has the contacts, behind its own
 * access check.
 */
export default function StudentHistorySheet() {
  const params = useLocalSearchParams<{ id?: string; program?: string; name?: string }>();
  const target = parseStudentHistoryParams(params);
  const { history, problem, loading, retry } = useStudentHistory(target);
  const [tab, setTab] = useState<HistoryTab>("attendance");
  const { colors } = useAppTheme();
  const name = history?.name ?? target?.name ?? "Student";

  return (
    <MinistryTintProvider ministry="sundaySchool">
      <Stack.Screen
        options={{
          title: "History",
          headerRight:
            Platform.OS === "android"
              ? () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close history"
                    onPress={() => router.back()}
                    style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
                  >
                    <Icon ios="xmark" android="close" />
                  </Pressable>
                )
              : undefined,
        }}
      />
      {Platform.OS === "ios" && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button accessibilityLabel="Close history" icon="xmark" onPress={() => router.back()} />
        </Stack.Toolbar>
      )}
      <Screen refreshing={false} onRefresh={target ? () => void retry() : undefined}>
        <Header name={name} history={history} />

        {!target && <Problem message="This student can't be opened." />}

        {!!target && loading && (
          <View accessibilityRole="progressbar" accessibilityLabel="Loading student history" style={{ paddingVertical: 28, alignItems: "center", gap: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <Copy kind="caption">Loading student history…</Copy>
          </View>
        )}

        {!!target && !!problem && (
          <Problem message={HISTORY_PROBLEM_MESSAGE[problem]} onRetry={problem === "denied" || problem === "gone" ? undefined : () => void retry()} />
        )}

        {!!history && (
          <>
            <Summary history={history} />
            <SegmentedControl
              values={HISTORY_TABS.map((item) => item.label)}
              selectedIndex={HISTORY_TABS.findIndex((item) => item.id === tab)}
              onChange={({ nativeEvent }) => setTab(HISTORY_TABS[nativeEvent.selectedSegmentIndex]?.id ?? "attendance")}
              style={{ width: "100%", minHeight: 36 }}
            />
            {tab === "attendance" && <AttendanceTab history={history} />}
            {tab === "notes" && <NotesTab history={history} />}
            {tab === "visitations" && <VisitationsTab history={history} />}

            <RowLinkToProfile id={history.id} />
            <Copy kind="caption" style={{ paddingHorizontal: 8 }}>
              {PROGRAM_BOUNDARY_NOTE}
            </Copy>
          </>
        )}
      </Screen>
    </MinistryTintProvider>
  );
}

function toneColors(tone: Tone, colors: ReturnType<typeof useAppTheme>["colors"]) {
  if (tone === "success") return { color: colors.success, soft: colors.successSoft };
  if (tone === "warning") return { color: colors.warning, soft: colors.warningSoft };
  if (tone === "danger") return { color: colors.danger, soft: colors.dangerSoft };
  return { color: colors.muted, soft: colors.hover };
}

function Header({ name, history }: { name: string; history?: StudentHistory }) {
  const { colors } = useAppTheme();
  const large = useLargeType();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
      {history?.photoUrl ? (
        <Image
          source={{ uri: history.photoUrl }}
          accessibilityIgnoresInvertColors
          accessibilityLabel={`${name} profile photo`}
          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.hover, flexShrink: 0 }}
        />
      ) : (
        // Decorative: at the largest text sizes the initials outgrow the circle, so leave it out.
        !large && (
          <View style={{ width: 56, height: 56, flexShrink: 0 }}>
            <InitialsAvatar name={name} size={56} variant="accent" />
          </View>
        )
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Copy accessibilityLabel={name} style={{ ...serifHero, fontSize: 24, lineHeight: 28 }}>
          {name}
        </Copy>
        {!!history && <Copy kind="caption">{history.subtitle}</Copy>}
        {!!history && (history.isServantsPrepStudent || history.priority?.value) && (
          <View style={[styles.row, { gap: 6, flexWrap: "wrap" }]}>
            {history.isServantsPrepStudent && (
              <View style={[styles.pill, { backgroundColor: colors.primarySoft }]}>
                <Copy kind="caption" color={colors.primary} style={{ fontWeight: "600" }}>
                  SP Student
                </Copy>
              </View>
            )}
            {history.priority?.value && <StatusPill label="Priority visit" color={colors.warning} soft={colors.warningSoft} />}
          </View>
        )}
      </View>
    </View>
  );
}

function Summary({ history }: { history: StudentHistory }) {
  const { colors } = useAppTheme();
  const large = useLargeType();
  const last = lastVisit(history);
  const call = history.phoneCalls[0];
  const rate = history.attendance.rate;
  const tone = toneColors(rateTone(rate), colors);
  // At the largest Dynamic Type sizes three columns cannot hold a word each, so stack them.
  const stacked = large;
  const cell = (label: string, value: string, color?: string) => (
    <View style={{ flex: stacked ? undefined : 1, alignItems: stacked ? "flex-start" : "center", gap: 2 }}>
      <Copy kind="caption">{label}</Copy>
      <Copy style={{ fontWeight: "600", color: color ?? colors.text }}>{value}</Copy>
    </View>
  );
  return (
    <Card>
      <View
        accessible
        accessibilityLabel={`${attendanceSpoken(history)}. Last visit ${last ? readableDate(visitationDate(last)) : "none"}. Last call ${call ? readableDate(call.calledAt) : "none"}`}
        style={{ flexDirection: stacked ? "column" : "row", gap: 12, justifyContent: "space-between" }}
      >
        {cell("Attendance", rateLabel(rate), tone.color)}
        {cell("Last visit", last ? shortDate(visitationDate(last)) : "None")}
        {cell("Last call", call ? shortDate(call.calledAt) : "None")}
      </View>
    </Card>
  );
}

function shortDate(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function AttendanceTab({ history }: { history: StudentHistory }) {
  const { colors } = useAppTheme();
  const { records, counts } = history.attendance;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {countRows(counts).map((row) => (
          <View key={row.label} style={[styles.pill, { backgroundColor: colors.hover, gap: 6 }]}>
            <Copy kind="caption">{row.label}</Copy>
            <Copy kind="caption" color={colors.text} style={{ fontWeight: "600" }}>
              {row.value}
            </Copy>
          </View>
        ))}
      </View>
      <Copy kind="caption" style={{ paddingHorizontal: 4 }}>
        Saved marks in classes you can access. Late counts half; excused and unrecorded meetings are left out.
      </Copy>
      <ListSurface>
        {!records.length && (
          <View style={{ padding: 14 }}>
            <Copy kind="caption">No attendance recorded yet.</Copy>
          </View>
        )}
        {records.map((record, index, all) => {
          const tone = toneColors(ATTENDANCE_TONE[record.status], colors);
          return (
            <View
              key={record.id}
              accessible
              accessibilityLabel={`${readableDate(record.date)}, ${record.title || "class"}, ${ATTENDANCE_LABEL[record.status]}${record.notes ? `, note: ${record.notes}` : ""}`}
              style={[
                { padding: 14, gap: 6 },
                index < all.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Copy>{readableDate(record.date)}</Copy>
                  {!!record.title && <Copy kind="caption">{record.title}</Copy>}
                </View>
                <StatusPill label={ATTENDANCE_LABEL[record.status]} color={tone.color} soft={tone.soft} />
              </View>
              {!!record.notes && <Copy kind="caption" color={colors.text2}>{record.notes}</Copy>}
            </View>
          );
        })}
      </ListSurface>
    </View>
  );
}

function NotesTab({ history }: { history: StudentHistory }) {
  const { colors } = useAppTheme();
  const { general, entries } = history.notes;
  return (
    <View style={{ gap: 10 }}>
      {!!general && (
        <View style={{ gap: 8 }}>
          <SectionTitle title="General notes" />
          <ListSurface>
            <View style={{ padding: 14 }}>
              <Copy>{general}</Copy>
            </View>
          </ListSurface>
        </View>
      )}
      {entries.map((note) => (
        <Card key={note.id}>
          <Copy kind="caption">
            {note.author.name} · {readableDate(note.createdAt)}
          </Copy>
          <Copy>{note.content}</Copy>
        </Card>
      ))}
      {!general && !entries.length && (
        <ListSurface>
          <View style={{ padding: 14 }}>
            <Copy kind="caption">No notes recorded yet.</Copy>
          </View>
        </ListSurface>
      )}
      <Copy kind="caption" color={colors.muted} style={{ paddingHorizontal: 4 }}>
        {CONFIDENTIAL_NOTES_NOTE}
      </Copy>
    </View>
  );
}

function VisitationsTab({ history }: { history: StudentHistory }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 8 }}>
        <SectionTitle title="Visitation history" />
        <ListSurface>
          {!history.visitations.length && (
            <View style={{ padding: 14 }}>
              <Copy kind="caption">No visitations recorded yet.</Copy>
            </View>
          )}
          {history.visitations.map((visit, index, all) => {
            const tone = toneColors(visitationTone(visit.status), colors);
            return (
              <View
                key={visit.id}
                accessible
                accessibilityLabel={`${VISITATION_LABEL[visit.status]}, ${readableDate(visitationDate(visit))}${visit.recorder ? `, recorded by ${visit.recorder.name}` : ""}${visit.notes ? `, ${visit.notes}` : ""}`}
                style={[{ padding: 14, gap: 6 }, index < all.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Copy>{readableDate(visitationDate(visit))}</Copy>
                    {!!visit.recorder && <Copy kind="caption">Recorded by {visit.recorder.name}</Copy>}
                  </View>
                  <StatusPill label={VISITATION_LABEL[visit.status]} color={tone.color} soft={tone.soft} />
                </View>
                {!!visit.notes && <Copy kind="caption" color={colors.text2}>{visit.notes}</Copy>}
              </View>
            );
          })}
        </ListSurface>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle title="Phone calls" />
        <ListSurface>
          {!history.phoneCalls.length && (
            <View style={{ padding: 14 }}>
              <Copy kind="caption">No phone calls recorded yet.</Copy>
            </View>
          )}
          {history.phoneCalls.map((call, index, all) => (
            <View
              key={call.id}
              accessible
              accessibilityLabel={`${CALL_OUTCOME_LABEL[call.outcome]}, ${readableDate(call.calledAt)}, by ${call.callerName}${call.note ? `, ${call.note}` : ""}`}
              style={[{ padding: 14, gap: 6 }, index < all.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Copy>{readableDate(call.calledAt)}</Copy>
                  <Copy kind="caption">{call.callerName}</Copy>
                </View>
                <StatusPill
                  label={CALL_OUTCOME_LABEL[call.outcome]}
                  color={call.outcome === "CONNECTED" ? colors.success : colors.muted}
                  soft={call.outcome === "CONNECTED" ? colors.successSoft : colors.hover}
                />
              </View>
              {!!call.note && <Copy kind="caption" color={colors.text2}>{call.note}</Copy>}
            </View>
          ))}
        </ListSurface>
      </View>
    </View>
  );
}

/** The profile (contacts, editing) is its own screen with its own access check. */
function RowLinkToProfile({ id }: { id: string }) {
  return (
    <ListSurface>
      <RowLink
        title="Open full profile"
        subtitle="Contacts and details"
        onPress={() => {
          router.back();
          // Let the sheet finish dismissing before the next screen is pushed.
          setTimeout(() => router.push({ pathname: "/child/[id]", params: { id } }), 350);
        }}
      />
    </ListSurface>
  );
}

function Problem({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <View accessibilityRole="alert" accessible>
        <Copy>{message}</Copy>
      </View>
      {!!onRetry && <Button label="Try again" onPress={onRetry} />}
    </Card>
  );
}
