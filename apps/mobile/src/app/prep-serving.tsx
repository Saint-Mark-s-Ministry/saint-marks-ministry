import { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { Button, Copy, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { ApiError } from "@/data/api-client";
import { useAuth } from "@/data/auth-provider";
import { request, useResource } from "@/data/resources";
import { savedLabel } from "@/data/prep-lessons";
import { serifDisplay, useAppTheme } from "@/theme";
import {
  canViewOwnServing,
  currentWeekOf,
  gradeLabel,
  logPill,
  normalizeCode,
  stintSegments,
  submitBlocker,
  submitErrorMessage,
  validateCode,
  weeksDone,
  type Assignment,
  type ServingLog,
  type StintSegment,
} from "@/data/prep-serving";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

export default function PrepServingCode() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewOwnServing(user?.role);
  const assignments = useResource<Assignment[]>(canView ? "/api/sunday-school/assignments?isActive=true" : null);
  const logs = useResource<ServingLog[]>(canView ? "/api/sunday-school/logs" : null);

  // The code stays in component state, so a failed or interrupted submit keeps what the student typed.
  const [code, setCode] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A ref, not just state, so a second tap before the first request finishes can't send the code twice.
  const inFlight = useRef(false);

  const now = new Date();
  const assignment = assignments.data?.[0] ?? null;
  const myLogs = (logs.data ?? []).filter((l) => assignment && l.assignmentId === assignment.id);
  const blocker = assignment ? submitBlocker(assignment, myLogs, now) : submitBlocker(null, [], now);
  const weekLabel = currentWeekOf(now).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  async function submit() {
    if (inFlight.current || busy || !assignment) return;
    const problem = validateCode(code);
    if (problem) {
      setSuccess(null);
      setInlineError(problem);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setInlineError(null);
    setSuccess(null);
    try {
      // weekOf is local Sunday midnight, the same value the web student page sends.
      await request("/api/sunday-school/logs", "POST", { code: normalizeCode(code), weekOf: currentWeekOf(new Date()).toISOString() });
      setCode("");
      setSuccess(`Logged for the week of ${weekLabel}. Thanks for serving.`);
      void logs.refresh();
    } catch (error) {
      // The server's own text isn't shown, and the code is kept so the student can correct it.
      const status = error instanceof ApiError ? error.status : null;
      setInlineError(submitErrorMessage(status, error instanceof ApiError ? error.message : undefined));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const stale = assignments.stale || logs.stale;
  const offline = assignments.error === OFFLINE || logs.error === OFFLINE;

  return (
    <>
      {/* The large heading below carries the title; an empty bar title avoids repeating it. */}
      <Stack.Screen options={{ title: "" }} />
      <Screen
        refreshing={assignments.loading || assignments.refreshing || logs.refreshing}
        onRefresh={() => {
          void assignments.refresh();
          void logs.refresh();
        }}
      >
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>This page is for students.</Copy>
          </View>
        )}

        {canView && (
          <>
            <View style={{ paddingHorizontal: 4, gap: 2 }}>
              <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>Serving code</Copy>
              <Copy kind="caption">Log your weekly Sunday School serving</Copy>
            </View>

            {stale && (
              <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.warning}>
                  {offline ? "You're offline" : "Couldn't refresh"} · showing saved details
                </Copy>
                <Copy kind="caption">
                  {logs.updatedAt ? savedLabel(logs.updatedAt, now) : "Saved earlier"}. Pull down to refresh before you submit.
                </Copy>
              </View>
            )}

            {!stale && <ResourceState loading={assignments.loading} error={assignments.error} retry={() => void assignments.refresh()} />}

            {assignments.data && (
              <>
                {assignment && <StintCard assignment={assignment} logs={myLogs} now={now} />}

                {!assignment && (
                  <Notice
                    title="No active serving stint"
                    body="You don't have an active Sunday School serving stint, so there's nothing to log. Ask your servant if you think this is wrong."
                  />
                )}

                {assignment && blocker.kind !== "ready" && <Notice title={blocker.kind === "already-logged" ? "Already logged" : "Not open for logging"} body={blocker.message} />}

                {assignment && blocker.kind === "ready" && (
                  <View style={{ gap: 10 }}>
                    <Copy style={{ fontSize: 17, fontWeight: "600" }}>Attendance code</Copy>
                    <ListSurface>
                      <View style={{ padding: 16, gap: 12 }}>
                        <Copy kind="caption">Week of {weekLabel}. Your servant gives you this week's code.</Copy>
                        <TextInput
                          accessibilityLabel="Attendance code"
                          accessibilityHint="Type the code your servant gave you, then press Submit."
                          value={code}
                          onChangeText={(value) => {
                            setCode(value);
                            if (inlineError) setInlineError(null);
                          }}
                          editable={!busy}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          autoComplete="off"
                          placeholder="G2-A7X3"
                          placeholderTextColor={colors.muted}
                          returnKeyType="done"
                          onSubmitEditing={() => void submit()}
                          style={{
                            minHeight: 56,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: inlineError ? colors.danger : colors.border,
                            backgroundColor: colors.background,
                            color: colors.text,
                            paddingHorizontal: 16,
                            fontSize: 22,
                            letterSpacing: 2,
                            textAlign: "center",
                            fontVariant: ["tabular-nums"],
                          }}
                        />
                        {inlineError && (
                          <View accessibilityLiveRegion="polite">
                            <Copy kind="caption" color={colors.danger}>{inlineError}</Copy>
                          </View>
                        )}
                        {success && (
                          <View accessibilityLiveRegion="polite">
                            <Copy kind="caption" color={colors.success}>{success}</Copy>
                          </View>
                        )}
                        <Button label={busy ? "Submitting…" : "Submit attendance code"} disabled={busy || !code.trim()} onPress={() => void submit()} />
                      </View>
                    </ListSurface>
                  </View>
                )}

                <View style={{ gap: 10 }}>
                  <Copy style={{ fontSize: 17, fontWeight: "600" }}>History</Copy>
                  {!myLogs.length && <Copy kind="caption">No weeks logged yet.</Copy>}
                  {!!myLogs.length && (
                    <ListSurface>
                      {[...myLogs]
                        .sort((a, b) => b.weekNumber - a.weekNumber)
                        .map((log, index, all) => (
                          <HistoryRow key={log.id} log={log} last={index === all.length - 1} />
                        ))}
                    </ListSurface>
                  )}
                </View>
              </>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function StintCard({ assignment, logs, now }: { assignment: Assignment; logs: ServingLog[]; now: Date }) {
  const { colors } = useAppTheme();
  const segments = stintSegments(assignment, logs, now);
  const done = weeksDone(segments);
  return (
    <ListSurface>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Copy style={{ fontSize: 15, fontWeight: "600" }}>Serving stint</Copy>
          <Copy kind="caption">{done} of {assignment.totalWeeks} weeks</Copy>
        </View>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={`Serving stint: ${done} of ${assignment.totalWeeks} weeks logged`} accessibilityValue={{ min: 0, max: assignment.totalWeeks, now: done }} style={{ flexDirection: "row", gap: 6 }}>
          {segments.map((segment) => (
            <View key={segment.weekNumber} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: segmentColor(segment, colors) }} />
          ))}
        </View>
        <Copy kind="caption">
          {gradeLabel(assignment.grade)}
          {assignment.academicYear ? ` · ${assignment.academicYear.name}` : ""}. Your code comes from your class servant.
        </Copy>
        <Copy kind="caption">{legend(segments)}</Copy>
      </View>
    </ListSurface>
  );
}

function segmentColor(segment: StintSegment, colors: ReturnType<typeof useAppTheme>["colors"]) {
  if (segment.state === "done") return colors.success;
  if (segment.state === "rejected") return colors.danger;
  if (segment.state === "missed") return colors.warning;
  if (segment.state === "current") return colors.primary;
  return colors.hover;
}

// Words for each state, so the bar never relies on color alone.
function legend(segments: StintSegment[]) {
  const count = (state: StintSegment["state"]) => segments.filter((s) => s.state === state).length;
  const parts = [
    [count("done"), "logged"],
    [count("current"), "this week"],
    [count("missed"), "missed"],
    [count("rejected"), "not accepted"],
    [count("upcoming"), "to come"],
  ] as const;
  return parts.filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`).join(" · ");
}

function HistoryRow({ log, last }: { log: ServingLog; last: boolean }) {
  const { colors } = useAppTheme();
  const pill = logPill(log.status);
  const tone = pill.tone === "success" ? colors.success : pill.tone === "warning" ? colors.warning : colors.danger;
  const soft = pill.tone === "success" ? colors.successSoft : pill.tone === "warning" ? colors.warningSoft : colors.dangerSoft;
  const when = new Date(log.weekOf).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 }, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontWeight: "500" }}>Week of {when}</Copy>
        <Copy kind="caption">
          {log.status === "REJECTED" ? "Not accepted. Ask your servant what to do next." : log.status === "EXCUSED" ? "Excused by your servant" : "Code accepted"}
        </Copy>
      </View>
      <StatusPill label={pill.label} color={tone} soft={soft} />
    </View>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.hover, gap: 6 }}>
      <Copy style={{ fontWeight: "600" }}>{title}</Copy>
      <Copy kind="caption">{body}</Copy>
    </View>
  );
}
