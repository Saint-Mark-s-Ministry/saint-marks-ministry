import { useEffect, useRef, useState } from "react";
import { AppState, Modal, Pressable, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Button, Copy, Icon, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { Choice, Field, ResourceState, Toggle } from "@/components/forms";
import { RotationEvidence } from "@/components/rotation-evidence";
import { ApiError } from "@/data/api-client";
import { api, useAuth } from "@/data/auth-provider";
import { invalidateResourceCache, useResource } from "@/data/resources";
import {
  SORT_OPTIONS,
  assignmentFormStatus,
  buildReviewBody,
  canReviewRotationForms,
  canSeeAsyncRotations,
  decisionBlocker,
  levelName,
  nextRotationLevel,
  orderReviewQueue,
  progressCurrentLabel,
  queueSignature,
  reviewBlocker,
  reviewErrorMessage,
  reviewOutcomeMessage,
  rotationPlace,
  sortAssignments,
  studentProgress,
  type AssignmentSort,
  type PrepRotationAssignmentRow,
  type ReviewDecision,
  type RotationFormReviewRow,
  type RotationReviewResult,
} from "@/data/async-rotations";
import { formStatus, progressSegments, rotationRange, type FormStatusTone } from "@/data/rotation-forms";
import { useAppTheme, type ThemeColors } from "@/theme";

const TABS = ["Assignments", "Rotation forms", "Progress"] as const;
const REVALIDATE_MS = 15_000;

function toneColors(tone: FormStatusTone, colors: ThemeColors) {
  if (tone === "success") return { color: colors.success, soft: colors.successSoft };
  if (tone === "danger") return { color: colors.danger, soft: colors.dangerSoft };
  if (tone === "warning") return { color: colors.warning, soft: colors.warningSoft };
  return { color: colors.text2, soft: colors.hover };
}

/**
 * Async students for a Servants Prep servant: Assignments, Rotation forms, and
 * Progress, opening on Rotation forms. Students upload their own signed forms
 * from their Sunday School screen; they arrive here for a human to approve or
 * return. This screen never uploads on a student's behalf and never advances
 * anyone itself: the review endpoint does, and the screen shows its answer.
 */
export default function PrepAsyncStudents() {
  const { user } = useAuth();
  const { colors, isDark } = useAppTheme();
  const canView = canSeeAsyncRotations(user?.role);
  const canReview = canReviewRotationForms(user?.role);
  const [tab, setTab] = useState(1);
  const [sortBy, setSortBy] = useState<AssignmentSort>("name");
  const [reviewing, setReviewing] = useState<RotationFormReviewRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const assignments = useResource<PrepRotationAssignmentRow[]>(canView ? "/api/sunday-school/assignments" : null);
  const forms = useResource<RotationFormReviewRow[]>(canView ? "/api/sunday-school/rotation-forms" : null);
  const refreshAssignments = assignments.refresh;
  const refreshForms = forms.refresh;

  // A decision can land from another servant or a student's upload: revalidate
  // on foreground and on a short timer, without a pull-to-refresh spinner.
  useEffect(() => {
    if (!canView) return;
    const tick = () => {
      void refreshAssignments();
      void refreshForms();
    };
    const interval = setInterval(() => {
      if (AppState.currentState === "active") tick();
    }, REVALIDATE_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [canView, refreshAssignments, refreshForms]);

  // If the queue changes underneath us, anything cached about classes and
  // lessons may be stale too.
  const signature = forms.data ? queueSignature(forms.data) : null;
  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    if (signature === null) return;
    if (lastSignature.current !== null && lastSignature.current !== signature) invalidateResourceCache();
    lastSignature.current = signature;
  }, [signature]);

  async function refreshAll() {
    invalidateResourceCache();
    await Promise.all([refreshAssignments(), refreshForms()]);
  }

  const loading = assignments.loading || forms.loading;
  const error = tab === 1 ? forms.error : assignments.error;

  return (
    <>
      <Stack.Screen options={{ title: "Async students" }} />
      <Screen
        refreshing={loading || pulling}
        onRefresh={() => {
          setPulling(true);
          void refreshAll().finally(() => setPulling(false));
        }}
      >
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Async students is for Servants Prep servants.</Copy>
          </View>
        )}

        {canView && (
          <>
            <View style={{ paddingHorizontal: 4, gap: 2 }}>
              <Copy kind="caption">Four signed weeks at each of ten grades</Copy>
            </View>

            <SegmentedControl
              values={[...TABS]}
              selectedIndex={tab}
              appearance={isDark ? "dark" : "light"}
              tintColor={colors.primary}
              onChange={({ nativeEvent }) => setTab(nativeEvent.selectedSegmentIndex)}
              style={{ width: "100%", minHeight: 36 }}
            />

            {notice && (
              <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.successSoft, gap: 4 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.success}>{notice}</Copy>
              </View>
            )}

            <ResourceState
              loading={tab === 1 ? forms.loading : assignments.loading}
              error={error}
              retry={() => void refreshAll()}
            />

            {tab === 0 && assignments.data && (
              <AssignmentsTab rows={assignments.data} sortBy={sortBy} onSort={setSortBy} />
            )}
            {tab === 1 && forms.data && (
              <FormsTab
                forms={forms.data}
                viewer={{ id: user?.id, role: user?.role }}
                canReview={canReview}
                onReview={(form) => {
                  setNotice(null);
                  setReviewing(form);
                }}
              />
            )}
            {tab === 2 && assignments.data && <ProgressTab rows={assignments.data} />}
          </>
        )}
      </Screen>

      {reviewing && (
        <ReviewSheet
          form={reviewing}
          onClose={() => setReviewing(null)}
          onDone={async (message) => {
            setReviewing(null);
            setNotice(message);
            await refreshAll();
          }}
          onStale={async () => {
            setReviewing(null);
            await refreshAll();
          }}
        />
      )}
    </>
  );
}

function AssignmentsTab({
  rows,
  sortBy,
  onSort,
}: {
  rows: PrepRotationAssignmentRow[];
  sortBy: AssignmentSort;
  onSort: (value: AssignmentSort) => void;
}) {
  const { colors } = useAppTheme();
  const sorted = sortAssignments(rows, sortBy);
  return (
    <View style={{ gap: 12 }}>
      {/* Available to everyone who can see the list, including read-only viewers. */}
      <Choice
        label="Sort by"
        value={sortBy}
        onChange={(value) => onSort(value as AssignmentSort)}
        options={SORT_OPTIONS}
      />
      <Copy kind="caption">{rows.length} rotation{rows.length === 1 ? "" : "s"}</Copy>
      {!sorted.length && (
        <ListSurface style={{ padding: 16 }}>
          <Copy>No Sunday School assignments yet.</Copy>
        </ListSurface>
      )}
      {sorted.map((row) => {
        const status = assignmentFormStatus(row);
        const tone = toneColors(status.tone, colors);
        return (
          <ListSurface key={row.id} style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>{row.student.name}</Copy>
                <Copy kind="caption">{row.student.email}</Copy>
              </View>
              <StatusPill label={status.label} color={tone.color} soft={tone.soft} />
            </View>
            <View style={[styles.row, { gap: 6, flexWrap: "wrap" }]}>
              <StatusPill label={rotationPlace(row)} color={colors.text2} soft={colors.hover} />
              <StatusPill
                label={row.isActive ? "Current" : "Past"}
                color={row.isActive ? colors.info : colors.muted}
                soft={row.isActive ? colors.infoSoft : colors.hover}
              />
            </View>
            <Copy kind="caption">
              {row.academicYear?.name ?? "—"} · {rotationRange(row.startDate, row.totalWeeks)}
            </Copy>
          </ListSurface>
        );
      })}
    </View>
  );
}

function FormsTab({
  forms,
  viewer,
  canReview,
  onReview,
}: {
  forms: RotationFormReviewRow[];
  viewer: { id?: string | null; role?: string | null };
  canReview: boolean;
  onReview: (form: RotationFormReviewRow) => void;
}) {
  const { colors } = useAppTheme();
  const ordered = orderReviewQueue(forms);
  return (
    <View style={{ gap: 12 }}>
      <ListSurface style={{ padding: 16, gap: 6 }}>
        <Copy style={{ fontWeight: "600" }}>Review signed forms</Copy>
        <Copy kind="caption">
          Students upload their signed four-week form from their own Sunday School screen. It appears here for you to
          approve or return for correction. Uploading never marks prep lessons Present.
        </Copy>
        {!canReview && (
          <Copy kind="caption" color={colors.warning}>You have read-only access. Servants Prep servants and Super Admins review forms.</Copy>
        )}
      </ListSurface>

      {!ordered.length && (
        <ListSurface style={{ padding: 16 }}>
          <Copy>
            No student submissions yet. Students upload their signed four-week form from Sunday School in their portal; it
            will appear here for review.
          </Copy>
        </ListSurface>
      )}

      {ordered.map((form) => {
        const status = formStatus(form);
        const tone = toneColors(status.tone, colors);
        const blocker = reviewBlocker(form, viewer);
        return (
          <ListSurface key={form.id} style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>{form.assignment.student.name}</Copy>
                <Copy kind="caption">
                  {form.assignment.class?.name ?? levelName(form.assignment.grade)} · {rotationRange(form.assignment.startDate)}
                </Copy>
              </View>
              <StatusPill label={status.label} color={tone.color} soft={tone.soft} />
            </View>
            {form.reviewNotes && (
              <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.hover, gap: 4 }}>
                <Copy kind="caption">Review notes</Copy>
                <Copy>{form.reviewNotes}</Copy>
              </View>
            )}
            <RotationEvidence fileUrl={form.fileUrl} filename={form.filename} label="Signed form" height={180} />
            {blocker.kind === "ready" && (
              <Button label="Review" onPress={() => onReview(form)} />
            )}
            {blocker.kind === "own-form" && <Copy kind="caption" color={colors.warning}>{blocker.message}</Copy>}
          </ListSurface>
        );
      })}
    </View>
  );
}

function ProgressTab({ rows }: { rows: PrepRotationAssignmentRow[] }) {
  const { colors } = useAppTheme();
  const progress = studentProgress(rows);
  return (
    <View style={{ gap: 12 }}>
      <Copy kind="caption">Ten grades, four signed and approved weeks per grade.</Copy>
      {!progress.length && (
        <ListSurface style={{ padding: 16 }}>
          <Copy>No rotations assigned yet.</Copy>
        </ListSurface>
      )}
      {progress.map((student) => (
        <ListSurface key={student.studentId} style={{ padding: 16, gap: 10 }}>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>{student.name}</Copy>
          <Copy kind="caption">{progressCurrentLabel(student)}</Copy>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${student.name}: ${student.completed} of ${student.required} grades approved`}
            accessibilityValue={{ min: 0, max: student.required, now: student.completed }}
            style={{ flexDirection: "row", gap: 4 }}
          >
            {progressSegments(student.completed, student.required).map((done, index) => (
              <View key={index} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: done ? colors.success : colors.hover }} />
            ))}
          </View>
          <Copy kind="caption">
            {student.allComplete
              ? "All ten grades approved. No new assignment."
              : `${student.completed} of ${student.required} grades approved`}
          </Copy>
        </ListSurface>
      ))}
    </View>
  );
}

function ReviewSheet({
  form,
  onClose,
  onDone,
  onStale,
}: {
  form: RotationFormReviewRow;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
  onStale: () => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const next = nextRotationLevel(form.level);

  async function submit(decision: ReviewDecision) {
    if (inFlight.current || busy || !api) return;
    const blocked = decisionBlocker(decision, { confirmed, notes });
    if (blocked) {
      setError(blocked);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.request<RotationReviewResult>(
        `/api/sunday-school/rotation-forms/${encodeURIComponent(form.id)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildReviewBody(decision, form, notes)),
        },
      );
      // Only now, with the server's answer in hand, does anything on screen change.
      await onDone(reviewOutcomeMessage(result));
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : null;
      const failure = reviewErrorMessage(status, caught instanceof ApiError ? caught.message : undefined);
      setError(failure.message);
      if (failure.refresh) await onStale();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={busy ? undefined : onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingTop: 24 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel review"
            disabled={busy}
            onPress={onClose}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>Review form</Copy>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 2 }}>
            <Copy style={{ fontSize: 20, fontWeight: "600" }}>{form.assignment.student.name}</Copy>
            <Copy kind="caption">
              {form.assignment.class?.name ?? levelName(form.assignment.grade)} · {rotationRange(form.assignment.startDate)}
            </Copy>
          </View>

          <RotationEvidence fileUrl={form.fileUrl} filename={form.filename} label="Signed form" height={300} />

          <Copy kind="caption">
            {next
              ? `Approving credits four weeks and moves the student to ${levelName(next)}. If this is their tenth grade, the rotation program finishes.`
              : "Approving credits four weeks."}{" "}
            Returning keeps them in this class.
          </Copy>

          <Toggle
            label="I verified that all four weeks were fully attended and signed."
            value={confirmed}
            onChange={setConfirmed}
            disabled={busy}
          />
          <Field
            label="Review notes (required when returning a form)"
            value={notes}
            onChange={setNotes}
            multiline
            disabled={busy}
          />

          {error && (
            <View accessibilityLiveRegion="polite" style={{ padding: 12, borderRadius: 12, backgroundColor: colors.dangerSoft }}>
              <Copy kind="caption" color={colors.danger}>{error}</Copy>
            </View>
          )}

          <Button
            label={busy ? "Saving…" : "Approve and advance"}
            disabled={busy || !confirmed}
            onPress={() => void submit("APPROVED")}
          />
          <Button
            secondary
            label="Return for correction"
            disabled={busy || !notes.trim()}
            onPress={() => void submit("REJECTED")}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
