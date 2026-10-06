import { useState } from "react";
import { Alert, Image, Modal, Pressable, Share, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { MenuView } from "@expo/ui/community/menu";
import { Button, Copy, Icon, InitialsAvatar, Screen, StatusPill, styles } from "@/components/ui";
import { ResourceState, confirmAction, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { api } from "@/data/auth-provider";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { canViewStudentRoster } from "@/data/prep-students";
import { canManageEnrollments, ssProgressSummary, ssWeekStates, type SSLog } from "@/data/prep-roster";

const YEAR_LABELS: Record<string, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2" };

type Enrollment = {
  studentId: string;
  status: "ACTIVE" | "GRADUATED" | "WITHDRAWN";
  yearLevel: string;
  isAsyncStudent: boolean;
  student: { id: string; name: string };
};
type LessonItem = { id: string; lessonNumber: number; scheduledDate: string; status: string; isExamDay?: boolean };
type AttendanceRecord = { lessonId: string; status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" };
type Slip = { id: string; imageUrl: string; attendanceRecords: { lesson: { id: string; lessonNumber: number } }[] };
type SSAssignment = { id: string; grade: string; totalWeeks: number; startDate: string; logs: SSLog[] };

export default function PrepAsyncStudentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = canViewStudentRoster(user?.role);
  const canManage = canManageEnrollments(user?.role);

  const enrollments = useResource<Enrollment[]>(canView ? "/api/enrollments" : null);
  const enrollment = enrollments.data?.find((e) => e.studentId === id);
  const lessonsRes = useResource<LessonItem[]>(canView ? "/api/lessons?excludeExamDays=true" : null);
  const attendanceRes = useResource<AttendanceRecord[]>(canView ? `/api/attendance?studentId=${encodeURIComponent(id)}` : null);
  const slipsRes = useResource<Slip[]>(canView ? `/api/slips?type=ATTENDANCE&studentId=${encodeURIComponent(id)}` : null);
  const ssRes = useResource<SSAssignment[]>(canView ? `/api/sunday-school/assignments?studentId=${encodeURIComponent(id)}` : null);

  const [uploadTargets, setUploadTargets] = useState<LessonItem[] | null>(null);

  const offline = lessonsRes.error === "Could not reach the server. Check your connection and try again.";

  const attendanceByLesson = new Map((attendanceRes.data ?? []).map((r) => [r.lessonId, r.status]));
  const slipByLesson = new Map<string, Slip>();
  for (const slip of slipsRes.data ?? []) {
    for (const rec of slip.attendanceRecords) slipByLesson.set(rec.lesson.id, slip);
  }
  const pastLessons = [...(lessonsRes.data ?? [])]
    .filter((l) => new Date(l.scheduledDate) <= new Date())
    .sort((a, b) => a.lessonNumber - b.lessonNumber);
  const outstanding = pastLessons.filter((l) => !slipByLesson.has(l.id) && attendanceByLesson.get(l.id) !== "PRESENT" && attendanceByLesson.get(l.id) !== "LATE");

  function printSlip() {
    const lines = outstanding.map((l) => `Lesson ${l.lessonNumber} — ${new Date(l.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    void Share.share({
      message: `${enrollment?.student.name ?? "Student"} — outstanding attendance slips\n\n${lines.length ? lines.join("\n") : "None — all caught up."}`,
    }).catch(() => undefined);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: enrollment?.student.name ?? "Async student",
          headerRight: () => (
            <View style={[styles.row, { gap: 4 }]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Print slip" hitSlop={8} onPress={printSlip} style={{ padding: 6 }}>
                <Icon ios="square.and.arrow.up" android="share" size={20} color={colors.text} />
              </Pressable>
              {canManage && (
                <MenuView
                  title="More"
                  actions={[{ id: "withdraw", title: "Withdraw student", attributes: { destructive: true } }]}
                  onPressAction={({ nativeEvent }) => {
                    if (nativeEvent.event === "withdraw") {
                      confirmAction(
                        `Withdraw ${enrollment?.student.name}?`,
                        "This marks the student inactive. They can be reactivated later from Roster.",
                        () => {
                          void (async () => {
                            try {
                              await request(`/api/enrollments/${encodeURIComponent(enrollment!.studentId)}`, "PATCH", { status: "WITHDRAWN" });
                              router.back();
                            } catch (error) {
                              Alert.alert("Unable to withdraw", error instanceof Error ? error.message : "Please try again.");
                            }
                          })();
                        },
                        true,
                      );
                    }
                  }}
                >
                  <Pressable accessibilityRole="button" accessibilityLabel="More" hitSlop={8} style={{ padding: 6 }}>
                    <Icon ios="ellipsis.circle" android="more_horiz" size={22} color={colors.text} />
                  </Pressable>
                </MenuView>
              )}
            </View>
          ),
        }}
      />
      <Screen
        refreshing={enrollments.loading || lessonsRes.loading}
        onRefresh={() => { void enrollments.refresh(); void lessonsRes.refresh(); void attendanceRes.refresh(); void slipsRes.refresh(); void ssRes.refresh(); }}
      >
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Async student detail is for Servants Prep administrators and mentors.</Copy>
          </View>
        )}

        {canView && (
          <>
            {offline && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.danger}>You're offline</Copy>
                <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
              </View>
            )}
            <ResourceState
              loading={enrollments.loading || lessonsRes.loading}
              error={offline ? undefined : enrollments.error || lessonsRes.error}
              retry={() => { void enrollments.refresh(); void lessonsRes.refresh(); }}
            />

            {enrollment && (
              <>
                <View style={{ alignItems: "center", gap: 8, paddingTop: 4 }}>
                  <InitialsAvatar name={enrollment.student.name} size={76} />
                  <Copy style={{ fontFamily: "Newsreader_500Medium", fontSize: 28, lineHeight: 32, fontWeight: "500" }}>{enrollment.student.name}</Copy>
                  <Copy kind="caption">{YEAR_LABELS[enrollment.yearLevel] ?? enrollment.yearLevel} · async student</Copy>
                  <View style={[styles.row, { gap: 6 }]}>
                    <StatusPill label="Async" color={colors.info} soft={colors.infoSoft} />
                    <StatusPill
                      label={enrollment.status === "ACTIVE" ? "Active" : enrollment.status === "GRADUATED" ? "Graduated" : "Withdrawn"}
                      color={enrollment.status === "ACTIVE" ? colors.success : colors.muted}
                      soft={enrollment.status === "ACTIVE" ? colors.successSoft : colors.hover}
                    />
                  </View>
                </View>

                <Copy style={{ fontSize: 17, fontWeight: "600" }}>Attendance slips</Copy>
                <View style={{ backgroundColor: colors.surface, borderRadius: 24, overflow: "hidden" }}>
                  {!pastLessons.length && (
                    <View style={{ padding: 16 }}>
                      <Copy kind="caption">No lessons have happened yet.</Copy>
                    </View>
                  )}
                  {pastLessons.map((lesson, index) => {
                    const status = attendanceByLesson.get(lesson.id);
                    const slip = slipByLesson.get(lesson.id);
                    const covered = status === "PRESENT" || status === "LATE" || !!slip;
                    const dateLabel = new Date(lesson.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    return (
                      <View
                        key={lesson.id}
                        style={[
                          { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, paddingVertical: 8, paddingHorizontal: 16 },
                          index < pastLessons.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                        ]}
                      >
                        <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: covered ? colors.successSoft : colors.warningSoft }}>
                          <Icon ios={covered ? "checkmark" : "clock"} android={covered ? "check" : "schedule"} size={16} color={covered ? colors.success : colors.warning} />
                        </View>
                        <View style={{ flex: 1, gap: 1 }}>
                          <Copy style={{ fontWeight: "500" }}>Lesson {lesson.lessonNumber} · {dateLabel}</Copy>
                          <Copy kind="caption">{slip ? "On a slip" : covered ? "Marked present" : "Not logged yet"}</Copy>
                        </View>
                        {!covered && canManage && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Upload slip covering lesson ${lesson.lessonNumber}`}
                            onPress={() => setUploadTargets([lesson])}
                            style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: colors.hover, alignItems: "center", justifyContent: "center" }}
                          >
                            <Copy style={{ fontSize: 14, fontWeight: "600" }}>Upload</Copy>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
                {!!outstanding.length && canManage && (
                  <Button label={`Upload slip for ${outstanding.length} outstanding`} secondary onPress={() => setUploadTargets(outstanding)} />
                )}

                <Copy style={{ fontSize: 17, fontWeight: "600" }}>Serving</Copy>
                {!ssRes.data?.length && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 16 }}>
                    <Copy kind="caption">No Sunday School serving stint assigned.</Copy>
                  </View>
                )}
                {(ssRes.data ?? []).map((a) => {
                  const states = ssWeekStates(a.logs, a.totalWeeks);
                  const summary = ssProgressSummary(a.logs, a.totalWeeks);
                  return (
                    <View key={a.id} style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 16, gap: 10 }}>
                      <View style={[styles.row, { justifyContent: "space-between" }]}>
                        <Copy style={{ fontWeight: "600" }}>Sunday School · {a.grade.replace(/_/g, " ")}</Copy>
                        <Copy kind="caption">{summary.present} of {summary.of}</Copy>
                      </View>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {states.map((state, i) => (
                          <View
                            key={i}
                            style={{
                              flexGrow: 1,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor:
                                state === "present" ? colors.success : state === "excused" ? colors.warning : state === "absent" ? colors.danger : colors.border,
                            }}
                          />
                        ))}
                      </View>
                      <Copy kind="caption">
                        Started {new Date(a.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Copy>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}
      </Screen>

      {uploadTargets && enrollment && (
        <AttendanceUploadSheet
          studentId={enrollment.studentId}
          lessons={uploadTargets}
          onClose={() => setUploadTargets(null)}
          onUploaded={() => {
            setUploadTargets(null);
            void attendanceRes.refresh();
            void slipsRes.refresh();
          }}
        />
      )}
    </>
  );
}

function AttendanceUploadSheet({ studentId, lessons, onClose, onUploaded }: { studentId: string; lessons: LessonItem[]; onClose: () => void; onUploaded: () => void }) {
  const { colors } = useAppTheme();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionMessage("Photo access is needed to choose the slip.");
      return;
    }
    setPermissionMessage(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setAsset(result.assets[0]);
  }
  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPermissionMessage("Camera access is needed to photograph the slip.");
      return;
    }
    setPermissionMessage(null);
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setAsset(result.assets[0]);
  }

  async function upload() {
    if (!asset || !api) return;
    setUploading(true);
    setUploadError(null);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const form = new FormData();
      form.append("file", blob, asset.fileName ?? "slip.jpg");
      form.append("studentId", studentId);
      form.append("type", "ATTENDANCE");
      form.append("lessonIds", JSON.stringify(lessons.map((l) => l.id)));
      await api.request("/api/slips", { method: "POST", body: form });
      onUploaded();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to upload. Please try again.");
    } finally {
      setUploading(false);
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
            onPress={onClose}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>Upload slip</Copy>
          <View style={{ width: 40 }} />
        </View>

        <Copy kind="caption">
          Covers {lessons.length === 1 ? "Lesson " + lessons[0].lessonNumber : `${lessons.length} lessons`}: {lessons.map((l) => l.lessonNumber).join(", ")}
        </Copy>

        {!!permissionMessage && (
          <Copy kind="caption" color={colors.warning}>{permissionMessage}</Copy>
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

        {!!uploadError && <Copy kind="caption" color={colors.danger}>{uploadError}</Copy>}

        <Button label={uploading ? "Uploading…" : "Upload"} disabled={!asset || uploading} onPress={() => void upload()} />
      </View>
    </Modal>
  );
}
