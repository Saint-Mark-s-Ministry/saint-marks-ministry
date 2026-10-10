import { useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, View } from "react-native";
import { Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { MenuView } from "@expo/ui/community/menu";
import { Button, Copy, Icon, InitialsAvatar, ListSurface, Screen, StatusPill, styles } from "@/components/ui";
import { ResourceState, confirmAction } from "@/components/forms";
import { request, useResource, invalidateResourceCache } from "@/data/resources";
import { api } from "@/data/auth-provider";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { isAdminLike } from "@/data/prep-home";
import { canManageAttendance } from "@/data/prep-attendance";
import {
  daysLeft,
  formatConfessionPeriod,
  getConfessionPeriods,
  getConfessionPeriodStatus,
  getStudentStart,
  groupByFather,
  periodClosed,
  segmentCounts,
  segmentFor,
  type ConfessionPeriod,
  type ConfessionPeriodStatus,
  type ConfessionSegment,
} from "@/data/confession";

type AcademicYear = { id: string; name: string; startDate: string; endDate: string; isActive: boolean };
type Enrollment = {
  studentId: string;
  isActive: boolean;
  enrolledAt: string;
  attendanceStartDate?: string | null;
  academicYearId: string;
  student: { id: string; name: string };
  fatherOfConfession?: { id: string; name: string } | null;
};
type Slip = { id: string; studentId: string; periodStart: string; imageUrl: string };
type FatherOption = { id: string; name: string };

const SEGMENT_LABEL: Record<ConfessionSegment, string> = { due: "Due", received: "Received", missing: "Missed" };

export default function PrepConfession() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = isAdminLike(user?.role);
  const canUpload = canManageAttendance(user?.role);

  const [segment, setSegment] = useState<ConfessionSegment>("due");
  const [fatherId, setFatherId] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<Enrollment | null>(null);
  const [viewingSlip, setViewingSlip] = useState<Slip | null>(null);

  const years = useResource<AcademicYear[]>(canView ? "/api/academic-years" : null);
  const enrollments = useResource<Enrollment[]>(canView ? "/api/enrollments?status=ACTIVE&isActive=true" : null);
  const slips = useResource<Slip[]>(canView ? "/api/slips?type=CONFESSION" : null);
  const fathers = useResource<FatherOption[]>(canView ? "/api/fathers-of-confession" : null);

  const offline = enrollments.error === "Could not reach the server. Check your connection and try again.";
  const loading = years.loading || enrollments.loading || slips.loading;

  const activeYear = years.data?.find((y) => y.isActive);
  const periods = activeYear ? getConfessionPeriods(activeYear) : [];
  const now = new Date();
  const currentPeriod: ConfessionPeriod | undefined = periods.find((p) => p.start <= now && now < p.end) ?? periods[periods.length - 1];
  const closed = currentPeriod ? periodClosed(currentPeriod, now) : false;

  const rows = (enrollments.data ?? []).map((e) => {
    const start = getStudentStart({
      attendanceStartDate: e.attendanceStartDate,
      academicYearStart: activeYear?.startDate,
      enrolledAt: e.enrolledAt,
    });
    const hasSlip = currentPeriod
      ? (slips.data ?? []).some((s) => s.studentId === e.studentId && new Date(s.periodStart).getTime() === currentPeriod.start.getTime())
      : false;
    const status: ConfessionPeriodStatus = currentPeriod ? getConfessionPeriodStatus(currentPeriod, start, hasSlip) : "na";
    const slip = (slips.data ?? []).find((s) => s.studentId === e.studentId && currentPeriod && new Date(s.periodStart).getTime() === currentPeriod.start.getTime());
    return { enrollment: e, status, slip };
  });

  const counts = segmentCounts(rows.map((r) => r.status));
  const received = counts.received;
  const total = counts.due + counts.received + counts.missing;

  const fatherFiltered = fatherId ? rows.filter((r) => r.enrollment.fatherOfConfession?.id === fatherId) : rows;
  const segmentRows = fatherFiltered.filter((r) => segmentFor(r.status) === segment);
  const groups = groupByFather(segmentRows.map((r) => ({ ...r, fatherName: r.enrollment.fatherOfConfession?.name ?? null })));

  return (
    <>
      <Stack.Screen
        options={{
          title: "Confession",
          headerRight: () => (
            <MenuView
              title="Filter by father of confession"
              actions={[
                { id: "", title: "All fathers", state: (fatherId === null ? "on" : "off") as "on" | "off" },
                ...(fathers.data ?? []).map((f) => ({
                  id: f.id,
                  title: f.name,
                  state: (fatherId === f.id ? "on" : "off") as "on" | "off",
                })),
              ]}
              onPressAction={({ nativeEvent }) => setFatherId(nativeEvent.event || null)}
            >
              <Pressable accessibilityRole="button" accessibilityLabel="Filter by father of confession" hitSlop={8} style={{ padding: 6 }}>
                <Icon ios="line.3.horizontal.decrease.circle" android="filter_list" size={22} color={colors.text} />
              </Pressable>
            </MenuView>
          ),
        }}
      />
      <Screen
        refreshing={loading}
        onRefresh={() => {
          void years.refresh();
          void enrollments.refresh();
          void slips.refresh();
          void fathers.refresh();
        }}
      >
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>
              Nothing to show here yet
            </Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              The confession tracker is for Servants Prep administrators.
            </Copy>
          </View>
        )}

        {canView && (
          <>
            <Copy kind="caption">Father of confession sign-offs</Copy>

            {offline && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.danger}>
                  You're offline
                </Copy>
                <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
              </View>
            )}
            <ResourceState
              loading={loading}
              error={offline ? undefined : years.error || enrollments.error || slips.error}
              retry={() => {
                void years.refresh();
                void enrollments.refresh();
                void slips.refresh();
              }}
            />

            {currentPeriod && activeYear && (
              <View style={{ backgroundColor: colors.surface, borderRadius: 26, padding: 18, gap: 10 }}>
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  <Copy style={{ fontFamily: "Newsreader_500Medium", fontSize: 24, fontWeight: "500" }}>
                    {formatConfessionPeriod(currentPeriod)}
                  </Copy>
                  <Copy kind="caption" color={closed ? colors.danger : colors.warning} style={{ fontWeight: "600" }}>
                    {closed ? "Closed" : `${daysLeft(currentPeriod, now)} days left`}
                  </Copy>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}>
                  <View
                    style={{
                      width: `${total ? (received / total) * 100 : 0}%`,
                      height: "100%",
                      borderRadius: 3,
                      backgroundColor: colors.success,
                    }}
                  />
                </View>
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  <Copy kind="caption">
                    {received} of {total} slips received
                  </Copy>
                  <Copy kind="caption">
                    Closes{" "}
                    {new Date(currentPeriod.end.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                  </Copy>
                </View>
              </View>
            )}

            {!currentPeriod && activeYear && <Copy kind="caption">No confession period for today's date.</Copy>}

            {!!currentPeriod && (
              <SegmentedControl
                values={(["due", "received", "missing"] as const).map((s) => `${SEGMENT_LABEL[s]} ${counts[s]}`)}
                selectedIndex={(["due", "received", "missing"] as const).indexOf(segment)}
                onChange={({ nativeEvent }) =>
                  setSegment((["due", "received", "missing"] as const)[nativeEvent.selectedSegmentIndex] ?? "due")
                }
                style={{ width: "100%", minHeight: 36 }}
              />
            )}

            {enrollments.data && !groups.length && (
              <View style={{ paddingVertical: 18, alignItems: "center" }}>
                <Copy kind="caption">No students match this filter.</Copy>
              </View>
            )}

            {groups.map(({ father, rows }) => (
              <View key={father} style={{ gap: 10 }}>
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  <Copy style={{ fontSize: 17, fontWeight: "600" }}>{father}</Copy>
                  <Copy kind="caption">{rows.length}</Copy>
                </View>
                <ListSurface>
                  {rows.map((row, index) => (
                    <StudentRow
                      key={row.enrollment.studentId}
                      enrollment={row.enrollment}
                      status={row.status}
                      slip={row.slip}
                      divider={index < rows.length - 1}
                      canUpload={canUpload}
                      onUpload={() => setUploadTarget(row.enrollment)}
                      onViewSlip={row.slip ? () => setViewingSlip(row.slip!) : undefined}
                    />
                  ))}
                </ListSurface>
              </View>
            ))}
          </>
        )}
      </Screen>

      {uploadTarget && currentPeriod && (
        <UploadSheet
          enrollment={uploadTarget}
          period={currentPeriod}
          closed={closed}
          existingSlip={rows.find((r) => r.enrollment.studentId === uploadTarget.studentId)?.slip}
          onClose={() => setUploadTarget(null)}
          onUploaded={() => {
            setUploadTarget(null);
            invalidateResourceCache();
            void slips.refresh();
          }}
        />
      )}

      <SlipViewer
        slip={viewingSlip}
        canManage={canUpload}
        onClose={() => setViewingSlip(null)}
        onDeleted={() => {
          setViewingSlip(null);
          void slips.refresh();
        }}
      />
    </>
  );
}

function StudentRow({
  enrollment,
  status,
  divider,
  canUpload,
  onUpload,
  onViewSlip,
}: {
  enrollment: Enrollment;
  status: ConfessionPeriodStatus;
  slip?: Slip;
  divider: boolean;
  canUpload: boolean;
  onUpload: () => void;
  onViewSlip?: () => void;
}) {
  const { colors } = useAppTheme();
  const tone = status === "slip" || status === "registration" ? colors.success : status === "missing" ? colors.danger : colors.warning;
  const soft = status === "slip" || status === "registration" ? colors.successSoft : status === "missing" ? colors.dangerSoft : colors.warningSoft;
  const label = status === "slip" ? "Received" : status === "registration" ? "Registration" : status === "missing" ? "Missed" : "Due";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${enrollment.student.name}, ${label}`}
      onPress={onViewSlip}
      disabled={!onViewSlip}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, paddingVertical: 8, paddingHorizontal: 16 },
        divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
        { backgroundColor: pressed && onViewSlip ? colors.hover : "transparent" },
      ]}
    >
      <InitialsAvatar name={enrollment.student.name} size={34} variant="neutral" />
      <Copy numberOfLines={1} style={{ flex: 1, fontSize: 17, fontWeight: "500" }}>
        {enrollment.student.name}
      </Copy>
      <StatusPill label={label} color={tone} soft={soft} />
      {canUpload && status !== "registration" && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Upload slip for ${enrollment.student.name}`}
          hitSlop={6}
          onPress={onUpload}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
        >
          <Icon ios="square.and.arrow.up" android="upload" size={17} color={colors.text2} />
        </Pressable>
      )}
    </Pressable>
  );
}

function SlipViewer({
  slip,
  canManage,
  onClose,
  onDeleted,
}: {
  slip: Slip | null;
  canManage: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  if (!slip) return null;
  const remove = () =>
    confirmAction(
      "Remove this slip?",
      "The student goes back to Due (or Missed, if the period has closed) and must have a new slip uploaded.",
      () => {
        void (async () => {
          try {
            await request(`/api/slips/${encodeURIComponent(slip.id)}`, "DELETE");
            onDeleted();
          } catch (error) {
            Alert.alert("Unable to remove", error instanceof Error ? error.message : "Please try again.");
          }
        })();
      },
      true,
    );
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <Image source={{ uri: slip.imageUrl }} style={{ width: "100%", height: "80%" }} resizeMode="contain" accessibilityLabel="Confession slip" />
        </Pressable>
        {canManage && (
          <View style={{ position: "absolute", left: 24, right: 24, bottom: 48 }}>
            <Button secondary label="Remove slip" onPress={remove} />
          </View>
        )}
      </View>
    </Modal>
  );
}

function UploadSheet({
  enrollment,
  period,
  closed,
  existingSlip,
  onClose,
  onUploaded,
}: {
  enrollment: Enrollment;
  period: ConfessionPeriod;
  closed: boolean;
  existingSlip?: Slip;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { colors } = useAppTheme();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPermissionMessage(
        permission.canAskAgain === false
          ? "Camera access is off for this app. Turn it on in Settings to take a photo."
          : "Camera access is needed to photograph the slip.",
      );
      return;
    }
    setPermissionMessage(null);
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setAsset(result.assets[0]);
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionMessage(
        permission.canAskAgain === false
          ? "Photo access is off for this app. Turn it on in Settings to choose a photo."
          : "Photo access is needed to choose the slip.",
      );
      return;
    }
    if (permission.accessPrivileges === "limited") {
      setPermissionMessage("You've given limited photo access — the slip may not appear below. Choose more photos in Settings if it's missing.");
    } else {
      setPermissionMessage(null);
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setAsset(result.assets[0]);
  }

  async function upload() {
    if (!asset || !api) return;
    setUploading(true);
    setUploadError(null);
    const abort = new AbortController();
    setController(abort);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const form = new FormData();
      form.append("file", blob, asset.fileName ?? "slip.jpg");
      form.append("studentId", enrollment.studentId);
      form.append("type", "CONFESSION");
      form.append("periodStart", period.start.toISOString());
      await api.request("/api/slips", { method: "POST", body: form, signal: abort.signal });
      onUploaded();
    } catch (error) {
      if (abort.signal.aborted) {
        setUploadError("Upload cancelled.");
      } else {
        setUploadError(error instanceof Error ? error.message : "Unable to upload. Please try again.");
      }
    } finally {
      setUploading(false);
      setController(null);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 24, gap: 16 }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            disabled={uploading}
            onPress={() => {
              if (uploading) return;
              onClose();
            }}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>Upload slip</Copy>
          <View style={{ width: 40 }} />
        </View>

        {closed ? (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.hover, gap: 6 }}>
            <Copy style={{ fontWeight: "600" }}>This period is closed</Copy>
            <Copy kind="caption">{formatConfessionPeriod(period)} ended. Slips can no longer be uploaded for it.</Copy>
          </View>
        ) : (
          <>
            {!!permissionMessage && (
              <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.warningSoft, gap: 8 }}>
                <Copy kind="caption" color={colors.warning}>
                  {permissionMessage}
                </Copy>
                <Button secondary label="Open Settings" onPress={() => void Linking.openSettings()} />
              </View>
            )}

            {asset ? (
              <View style={{ borderRadius: 24, overflow: "hidden" }}>
                <Image source={{ uri: asset.uri }} style={{ width: "100%", height: 220 }} resizeMode="cover" accessibilityLabel="Selected slip photo" />
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1.5,
                  borderStyle: "dashed",
                  borderColor: colors.borderStrong,
                  borderRadius: 24,
                  height: 150,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                }}
              >
                <Icon ios="square.and.arrow.up" android="upload" size={28} color={colors.muted} />
                <Copy kind="caption">Photo of the signed slip</Copy>
                <View style={[styles.row, { gap: 8 }]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void pickFromCamera()}
                    style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: colors.hover, alignItems: "center", justifyContent: "center" }}
                  >
                    <Copy style={{ fontSize: 14, fontWeight: "600" }}>Camera</Copy>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void pickFromLibrary()}
                    style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: colors.hover, alignItems: "center", justifyContent: "center" }}
                  >
                    <Copy style={{ fontSize: 14, fontWeight: "600" }}>Photos</Copy>
                  </Pressable>
                </View>
              </View>
            )}
            {!!asset && !uploading && (
              <Button secondary label="Choose a different photo" onPress={() => setAsset(null)} />
            )}

            <View style={{ backgroundColor: colors.surface, borderRadius: 22 }}>
              <FieldRow label="Student" value={enrollment.student.name} />
              <FieldRow label="Period" value={formatConfessionPeriod(period)} />
              <FieldRow label="Father of confession" value={enrollment.fatherOfConfession?.name ?? "Not assigned"} last />
            </View>

            <Copy kind="caption">
              {existingSlip
                ? "A slip is already on file for this period — uploading replaces it. You can replace it again until the period closes."
                : "This slip counts as soon as it's uploaded. You can replace it until the period closes."}
            </Copy>

            {!!uploadError && (
              <Copy kind="caption" color={colors.danger}>
                {uploadError}
              </Copy>
            )}

            {uploading ? (
              <View style={{ gap: 10 }}>
                <View style={[styles.row, { gap: 10, justifyContent: "center" }]}>
                  <ActivityIndicator color={colors.primary} />
                  <Copy kind="caption">Uploading…</Copy>
                </View>
                <Button secondary label="Cancel upload" onPress={() => controller?.abort()} />
              </View>
            ) : (
              <Button label="Upload" disabled={!asset} onPress={() => void upload()} />
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

function FieldRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={[{ flexDirection: "row", justifyContent: "space-between", padding: 13, paddingHorizontal: 16 }, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <Copy kind="caption">{label}</Copy>
      <Copy style={{ fontWeight: "500" }}>{value}</Copy>
    </View>
  );
}
