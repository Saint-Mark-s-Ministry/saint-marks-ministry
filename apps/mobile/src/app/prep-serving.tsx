import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Linking, View } from "react-native";
import { router, Stack, type Href } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { RotationAssignment, RotationProgressResponse } from "@stmark/contracts";
import { Button, Copy, Icon, ListSurface, Screen, SectionTitle, StatusPill } from "@/components/ui";
import { ResourceState, Toggle } from "@/components/forms";
import { servingClassSummary } from "@/data/class-lessons";
import { ApiError } from "@/data/api-client";
import { api, useAuth } from "@/data/auth-provider";
import { invalidateResourceCache, useResource } from "@/data/resources";
import { savedLabel } from "@/data/prep-lessons";
import {
  ROTATION_WEEKS,
  canViewOwnRotation,
  formNote,
  formStatus,
  isImageFile,
  progressLabel,
  progressSegments,
  resolveMimeType,
  rotationRange,
  rotationSignature,
  uploadBlocker,
  uploadBlockerMessage,
  uploadErrorMessage,
  validateRotationFile,
  type FormStatusTone,
} from "@/data/rotation-forms";
import { serifDisplay, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const REVALIDATE_MS = 15_000;

/**
 * The student's four-week rotation forms: one card per rotation with a single
 * review status, approved progress out of ten grade levels, and (on the current
 * card) printing, photo/PDF selection, confirmation, and upload.
 *
 * Nothing here advances the student. They stay in the assigned class until a
 * reviewer approves four signed weeks; this screen only reads that outcome.
 */
export default function PrepRotation() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewOwnRotation(user?.role);
  const progress = useResource<RotationProgressResponse>(
    canView && user ? `/api/sunday-school/progress?studentId=${encodeURIComponent(user.id)}` : null,
  );
  const [pulling, setPulling] = useState(false);
  const now = new Date();

  // A reviewer's decision can land while the app is open: revalidate on
  // foreground and on a short timer, without a pull-to-refresh spinner.
  const refresh = progress.refresh;
  useEffect(() => {
    if (!canView) return;
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, REVALIDATE_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [canView, refresh]);

  // When the class or approved count changes, everything cached about the
  // student's lessons is stale: mark it so the next view refetches.
  const signature = progress.data ? rotationSignature(progress.data) : null;
  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    if (!signature) return;
    if (lastSignature.current !== null && lastSignature.current !== signature) invalidateResourceCache();
    lastSignature.current = signature;
  }, [signature]);

  const offline = progress.error === OFFLINE;
  const data = progress.data;

  return (
    <>
      {/* The large heading below carries the title; an empty bar title avoids repeating it. */}
      <Stack.Screen options={{ title: "" }} />
      <Screen
        refreshing={progress.loading || pulling}
        onRefresh={() => {
          setPulling(true);
          void progress.refresh().finally(() => setPulling(false));
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
              <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>Rotations</Copy>
              <Copy kind="caption">Four signed weeks at each grade, from Pre-K through eighth grade</Copy>
            </View>

            {progress.stale && (
              <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.warning}>
                  {offline ? "You're offline" : "Couldn't refresh"} · showing saved details
                </Copy>
                <Copy kind="caption">
                  {progress.updatedAt ? savedLabel(progress.updatedAt, now) : "Saved earlier"}. Pull down to refresh.
                </Copy>
              </View>
            )}

            {!progress.stale && (
              <ResourceState loading={progress.loading} error={progress.error} retry={() => void progress.refresh()} />
            )}

            {data && <ServingClassCard summary={servingClassSummary(data)} />}

            {data && <ProgressCard completed={data.completedRotations} required={data.requiredRotations} allMet={data.graduation.allMet} />}

            {data && !data.assignments.length && (
              <ListSurface style={{ padding: 16, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }}>No serving assignment yet</Copy>
                <Copy kind="caption">
                  A Servants Prep servant assigns your Sunday School class. Ask them if you expected one.
                </Copy>
              </ListSurface>
            )}

            {data?.assignments.map((assignment) => (
              <RotationCard
                key={assignment.assignmentId}
                assignment={assignment}
                now={now}
                onChanged={() => void progress.refresh()}
              />
            ))}
          </>
        )}
      </Screen>
    </>
  );
}

function ServingClassCard({ summary }: { summary: ReturnType<typeof servingClassSummary> }) {
  const { colors } = useAppTheme();
  return (
    <ListSurface style={{ padding: 16, gap: 10 }}>
      <Copy kind="caption">Your serving class</Copy>
      {summary.kind === "assigned" && (
        <Copy accessibilityLabel={`Your serving class: ${summary.name}`} style={{ fontSize: 22, fontWeight: "600" }}>
          {summary.name}
        </Copy>
      )}
      {summary.kind === "complete" && (
        <>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>All ten rotations complete</Copy>
          <Copy kind="caption">You have no new class assignment.</Copy>
        </>
      )}
      {summary.kind === "unassigned" && (
        <>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>No serving class assigned</Copy>
          <Copy kind="caption" color={colors.text2}>
            Ask a Servants Prep servant to link your active serving assignment to a Sunday School class.
          </Copy>
        </>
      )}
      {summary.kind === "assigned" && (
        <Button secondary label="Class lessons" onPress={() => router.push("/prep-class-lessons" as Href)} />
      )}
    </ListSurface>
  );
}

function ProgressCard({ completed, required, allMet }: { completed: number; required: number; allMet: boolean }) {
  const { colors } = useAppTheme();
  const label = progressLabel(completed, required);
  return (
    <ListSurface style={{ padding: 16, gap: 12 }}>
      <Copy style={{ fontSize: 15, fontWeight: "600" }}>Rotation progress</Copy>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Rotation progress: ${label}`}
        accessibilityValue={{ min: 0, max: required, now: completed }}
        style={{ flexDirection: "row", gap: 4 }}
      >
        {progressSegments(completed, required).map((done, index) => (
          <View
            key={index}
            style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: done ? colors.success : colors.hover }}
          />
        ))}
      </View>
      <Copy kind="caption">
        {label}.{" "}
        {allMet
          ? "You have completed all ten grade rotations."
          : "Stay in your assigned class until all four weeks are signed and your form is approved."}
      </Copy>
    </ListSurface>
  );
}

function toneColors(tone: FormStatusTone, colors: ReturnType<typeof useAppTheme>["colors"]) {
  if (tone === "success") return { color: colors.success, soft: colors.successSoft };
  if (tone === "danger") return { color: colors.danger, soft: colors.dangerSoft };
  if (tone === "warning") return { color: colors.warning, soft: colors.warningSoft };
  return { color: colors.text2, soft: colors.hover };
}

type PickedFile = { uri: string; name: string; mimeType: string | null; size: number | null; source: "camera" | "library" | "file" };

function RotationCard({
  assignment,
  now,
  onChanged,
}: {
  assignment: RotationAssignment;
  now: Date;
  onChanged: () => void;
}) {
  const { colors } = useAppTheme();
  const form = assignment.rotationForm;
  const status = formStatus(form);
  const tone = toneColors(status.tone, colors);
  const blocker = uploadBlocker(assignment, now);
  const isCurrent = assignment.isActive && blocker.kind !== "approved";
  const className = assignment.class?.name ?? assignment.gradeDisplayName ?? assignment.grade;
  const note = formNote(form);

  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={assignment.isActive ? "Current rotation" : "Past rotation"} />
      <ListSurface style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Copy style={{ fontSize: 20, fontWeight: "600" }}>{className}</Copy>
            <Copy kind="caption">{assignment.academicYear.name}</Copy>
          </View>
          <StatusPill label={status.label} color={tone.color} soft={tone.soft} />
        </View>

        <Copy kind="caption">
          Four-week rotation: {rotationRange(assignment.startDate, assignment.totalWeeks || ROTATION_WEEKS)}
        </Copy>

        {form && (
          <View style={{ gap: 8 }}>
            <SubmittedEvidence form={form} />
            {note && <Copy>{note}</Copy>}
            {form.reviewNotes && (
              <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.hover, gap: 4 }}>
                <Copy kind="caption">Reviewer note</Copy>
                <Copy>{form.reviewNotes}</Copy>
              </View>
            )}
          </View>
        )}

        {isCurrent && <UploadSection assignment={assignment} now={now} onUploaded={onChanged} />}
      </ListSurface>
    </View>
  );
}

function SubmittedEvidence({ form }: { form: NonNullable<RotationAssignment["rotationForm"]> }) {
  const { colors } = useAppTheme();
  const image = isImageFile(null, form.filename);
  return (
    <View style={{ gap: 8 }}>
      <Copy kind="caption">Submitted form · {form.filename}</Copy>
      {image ? (
        <Image
          source={{ uri: form.fileUrl }}
          accessibilityLabel={`Submitted rotation form, ${form.filename}`}
          resizeMode="contain"
          style={{ width: "100%", height: 220, borderRadius: 12, backgroundColor: colors.hover }}
        />
      ) : (
        <Button
          secondary
          label="View submitted form"
          onPress={() => void Linking.openURL(form.fileUrl).catch(() => undefined)}
        />
      )}
    </View>
  );
}

function UploadSection({
  assignment,
  now,
  onUploaded,
}: {
  assignment: RotationAssignment;
  now: Date;
  onUploaded: () => void;
}) {
  const { colors } = useAppTheme();
  const blocker = uploadBlocker(assignment, now);
  const open = blocker.kind === "open";
  const blockedMessage = uploadBlockerMessage(blocker);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // A ref as well as state, so a second tap can't start a second upload.
  const inFlight = useRef(false);
  const hasForm = !!assignment.rotationForm;

  const accept = useCallback((picked: PickedFile) => {
    const problem = validateRotationFile(picked);
    setSuccess(null);
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setError(null);
    setFile(picked);
  }, []);

  // Camera capture, preview, retake and confirmation all stay inside this app:
  // the system camera sheet is presented in-process, never another application.
  async function takePhoto() {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      setPermission(
        permissionResult.canAskAgain === false
          ? "Camera access is off for this app. Turn it on in Settings to take a photo, or choose a photo or PDF instead."
          : "Camera access is needed to take a photo. You can also choose a photo or PDF.",
      );
      return;
    }
    setPermission(null);
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    accept({
      uri: asset.uri,
      name: asset.fileName ?? "rotation-form.jpg",
      mimeType: resolveMimeType(asset.mimeType, asset.fileName ?? "rotation-form.jpg"),
      size: asset.fileSize ?? null,
      source: "camera",
    });
  }

  async function choosePhoto() {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      setPermission(
        permissionResult.canAskAgain === false
          ? "Photo access is off for this app. Turn it on in Settings, or choose a PDF instead."
          : "Photo access is needed to choose a photo. You can also take a photo or choose a PDF.",
      );
      return;
    }
    setPermission(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    accept({
      uri: asset.uri,
      name: asset.fileName ?? "rotation-form.jpg",
      mimeType: resolveMimeType(asset.mimeType, asset.fileName ?? "rotation-form.jpg"),
      size: asset.fileSize ?? null,
      source: "library",
    });
  }

  async function chooseFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    accept({
      uri: asset.uri,
      name: asset.name,
      mimeType: resolveMimeType(asset.mimeType ?? null, asset.name),
      size: asset.size ?? null,
      source: "file",
    });
  }

  async function upload() {
    if (inFlight.current || busy || !file || !confirmed || !open || !api) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const picked = await fetch(file.uri);
      const blob = await picked.blob();
      // The size from the picker can be missing for camera photos; check the real bytes too.
      const problem = validateRotationFile({ mimeType: file.mimeType, size: blob.size, name: file.name });
      if (problem) {
        setError(problem);
        return;
      }
      const typed = new Blob([blob], { type: file.mimeType ?? "application/octet-stream" });
      const body = new FormData();
      body.append("assignmentId", assignment.assignmentId);
      (body as unknown as { append: (key: string, value: Blob, name?: string) => void }).append("file", typed, file.name);
      body.append("completedWeeks", String(ROTATION_WEEKS));
      await api.request("/api/sunday-school/rotation-forms", { method: "POST", body });
      invalidateResourceCache();
      setFile(null);
      setConfirmed(false);
      setSuccess("Rotation form submitted for review. You stay in this class until it's approved.");
      onUploaded();
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : null;
      setError(uploadErrorMessage(status, caught instanceof ApiError ? caught.message : undefined));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const controlsDisabled = !open || busy;
  return (
    <View style={{ gap: 12, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 12 }}>
      <Copy style={{ fontSize: 15, fontWeight: "600" }}>Signed rotation form</Copy>
      <Copy kind="caption">
        Complete all four weeks and have each week signed. Upload one photo or PDF of the completed form. Approval
        moves you to the next grade.
      </Copy>

      <Button secondary label="Print rotation form" onPress={() => router.push("/prep-attendance-slip" as Href)} />

      {blockedMessage && (
        <View accessibilityLiveRegion="polite" style={{ padding: 12, borderRadius: 12, backgroundColor: colors.hover }}>
          <Copy kind="caption">{blockedMessage}</Copy>
        </View>
      )}

      <Copy kind="caption">Photo or PDF, maximum 4.5 MB.</Copy>
      <View style={{ gap: 8 }}>
        <Button secondary label="Take photo" disabled={controlsDisabled} onPress={() => void takePhoto()} />
        <Button secondary label="Choose photo" disabled={controlsDisabled} onPress={() => void choosePhoto()} />
        <Button secondary label="Choose PDF or file" disabled={controlsDisabled} onPress={() => void chooseFile()} />
      </View>

      {permission && (
        <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <Copy kind="caption" color={colors.warning}>{permission}</Copy>
          <Button secondary label="Open Settings" onPress={() => void Linking.openSettings()} />
        </View>
      )}

      {file && (
        <View style={{ gap: 8 }}>
          <Copy kind="caption">Selected · {file.name}</Copy>
          {isImageFile(file.mimeType, file.name) ? (
            <Image
              source={{ uri: file.uri }}
              accessibilityLabel="Preview of the selected rotation form"
              resizeMode="contain"
              style={{ width: "100%", height: 260, borderRadius: 12, backgroundColor: colors.hover }}
            />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.hover }}>
              <Icon ios="doc.fill" android="description" size={22} color={colors.text} />
              <Copy style={{ flex: 1 }}>{file.name}</Copy>
            </View>
          )}
          {file.source === "camera" && (
            <Button secondary label="Retake photo" disabled={controlsDisabled} onPress={() => void takePhoto()} />
          )}
          <Button secondary label="Choose a different form" disabled={busy} onPress={() => { setFile(null); setConfirmed(false); }} />
        </View>
      )}

      <Toggle
        label="I completed all four weeks and each week is signed on this form."
        value={confirmed}
        onChange={setConfirmed}
        disabled={controlsDisabled}
      />

      {error && (
        <View accessibilityLiveRegion="polite">
          <Copy kind="caption" color={colors.danger}>{error}</Copy>
        </View>
      )}
      {success && (
        <View accessibilityLiveRegion="polite">
          <Copy kind="caption" color={colors.success}>{success}</Copy>
        </View>
      )}

      <Button
        label={busy ? "Uploading…" : hasForm ? "Replace rotation form" : "Upload rotation form"}
        disabled={controlsDisabled || !file || !confirmed}
        onPress={() => void upload()}
      />
      {busy && <ActivityIndicator accessibilityLabel="Uploading" />}
    </View>
  );
}
