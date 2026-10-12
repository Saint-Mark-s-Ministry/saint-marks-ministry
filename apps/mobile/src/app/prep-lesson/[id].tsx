import { useState, type ReactNode } from "react";
import { Alert, Linking, Modal, Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { MenuView } from "@expo/ui/community/menu";
import { Button, Copy, Icon, Screen, StatusPill, styles } from "@/components/ui";
import { Field, ResourceState, confirmAction, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { isAdminLike } from "@/data/prep-home";
import { canManageCurriculum, isSafeResourceUrl, speakerSuggestions, type LessonListItem } from "@/data/prep-curriculum";
import { LessonFormSheet } from "@/components/lesson-form-sheet";

type Resource = { id: string; title: string; url: string; type: string | null };
type LessonDetail = LessonListItem & {
  subtitle: string | null;
  description: string | null;
  resources: Resource[];
  creator?: { name: string } | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_CLASS: "No class",
};

export default function PrepLessonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = isAdminLike(user?.role);
  const canManage = canManageCurriculum(user?.role);

  const lessonsRes = useResource<LessonDetail[]>(canView ? "/api/lessons" : null);
  const lesson = lessonsRes.data?.find((l) => l.id === id);
  const total = lessonsRes.data?.length ?? 0;

  const [editing, setEditing] = useState(false);
  const [addingResource, setAddingResource] = useState(false);

  const offline = lessonsRes.error === "Could not reach the server. Check your connection and try again.";

  function deleteLesson() {
    confirmAction(
      "Delete this lesson?",
      "This permanently deletes the lesson and its resources. Attendance already recorded for it is not affected. This can't be undone.",
      () => {
        void (async () => {
          try {
            await request(`/api/lessons/${encodeURIComponent(id)}`, "DELETE");
            router.back();
          } catch (error) {
            Alert.alert("Unable to delete", error instanceof Error ? error.message : "Please try again.");
          }
        })();
      },
      true,
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: lesson ? `Lesson ${lesson.lessonNumber}` : "Lesson",
          headerRight: canManage
            ? () => (
                <MenuView
                  title="Lesson options"
                  actions={[
                    { id: "edit", title: "Edit lesson" },
                    { id: "delete", title: "Delete lesson", attributes: { destructive: true } },
                  ]}
                  onPressAction={({ nativeEvent }) => {
                    if (nativeEvent.event === "edit") setEditing(true);
                    if (nativeEvent.event === "delete") deleteLesson();
                  }}
                >
                  <Pressable accessibilityRole="button" accessibilityLabel="Lesson options" hitSlop={8} style={{ padding: 6 }}>
                    <Icon ios="ellipsis.circle" android="more_horiz" size={22} color={colors.text} />
                  </Pressable>
                </MenuView>
              )
            : undefined,
        }}
      />
      <LessonDetailBody lesson={lesson} offline={offline} lessonsRes={lessonsRes} canView={canView} canManage={canManage} total={total} onAddResource={() => setAddingResource(true)} />

      {editing && lesson && (
        <LessonFormSheet
          initial={{
            id: lesson.id,
            title: lesson.title ?? "",
            subtitle: lesson.subtitle ?? "",
            examSectionId: lesson.examSection?.id ?? "",
            scheduledDate: new Date(lesson.scheduledDate),
            speaker: lesson.speaker ?? "",
            isExamDay: !!lesson.isExamDay,
            description: lesson.description ?? "",
          }}
          speakerSuggestions={speakerSuggestions(lessonsRes.data ?? [])}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void lessonsRes.refresh();
          }}
        />
      )}

      {addingResource && lesson && (
        <AddResourceSheet lessonId={lesson.id} onClose={() => setAddingResource(false)} onSaved={() => { setAddingResource(false); void lessonsRes.refresh(); }} />
      )}
    </>
  );
}

function LessonDetailBody({
  lesson,
  offline,
  lessonsRes,
  canView,
  canManage,
  total,
  onAddResource,
}: {
  lesson?: LessonDetail;
  offline: boolean;
  lessonsRes: ReturnType<typeof useResource<LessonDetail[]>>;
  canView: boolean;
  canManage: boolean;
  total: number;
  onAddResource: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Screen bottom={100} refreshing={lessonsRes.loading} onRefresh={() => void lessonsRes.refresh()}>
      {!canView && (
        <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
          <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
          <Copy kind="caption" style={{ textAlign: "center" }}>Lesson details are for Servants Prep administrators.</Copy>
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
          <ResourceState loading={lessonsRes.loading} error={offline ? undefined : lessonsRes.error} retry={() => void lessonsRes.refresh()} />

          {!lessonsRes.loading && !lesson && lessonsRes.data && (
            <View style={{ paddingVertical: 32, alignItems: "center", gap: 6 }}>
              <Copy kind="heading">Lesson not found</Copy>
              <Copy kind="caption" style={{ textAlign: "center" }}>It may have been deleted or moved. Go back and refresh the list.</Copy>
            </View>
          )}

          {lesson && (
            <>
              <View style={{ backgroundColor: colors.surface, borderRadius: 26, padding: 18, gap: 8 }}>
                <View style={[styles.row, { gap: 6, flexWrap: "wrap" }]}>
                  <View style={[styles.pill, { backgroundColor: colors.hover }]}>
                    <Copy kind="caption">Lesson {lesson.lessonNumber} of {total}</Copy>
                  </View>
                  {lesson.examSection && (
                    <View style={[styles.pill, { backgroundColor: colors.hover }]}>
                      <Copy kind="caption">{lesson.examSection.displayName}</Copy>
                    </View>
                  )}
                </View>
                <Copy style={{ fontFamily: "Newsreader_500Medium", fontSize: 26, lineHeight: 30, fontWeight: "500" }}>
                  {lesson.title || "[Topic title]"}
                </Copy>
                {!!lesson.subtitle && <Copy kind="caption">{lesson.subtitle}</Copy>}
              </View>

              <View style={{ backgroundColor: colors.surface, borderRadius: 24, overflow: "hidden" }}>
                <FieldRow
                  label="Date"
                  value={`${new Date(lesson.scheduledDate).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · ${new Date(lesson.scheduledDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                />
                <FieldRow label="Speaker" value={lesson.speaker || "Not assigned"} muted={!lesson.speaker} />
                <FieldRow
                  label="Status"
                  value={<StatusPill label={STATUS_LABEL[lesson.status] ?? lesson.status} color={colors.text2} soft={colors.hover} />}
                  last
                />
              </View>

              <Copy kind="caption">
                {lesson.creator?.name ? `Added by ${lesson.creator.name} · ` : ""}
                Updated {new Date(lesson.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </Copy>

              {!!lesson.description && (
                <View style={{ gap: 10 }}>
                  <Copy style={{ fontSize: 17, fontWeight: "600" }}>Description</Copy>
                  <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 16 }}>
                    <Copy>{lesson.description}</Copy>
                  </View>
                </View>
              )}

              <View style={{ gap: 10 }}>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>Resources</Copy>
                <View style={{ backgroundColor: colors.surface, borderRadius: 24, overflow: "hidden" }}>
                  {!lesson.resources.length && (
                    <View style={{ padding: 16 }}>
                      <Copy kind="caption">No resources attached yet.</Copy>
                    </View>
                  )}
                  {lesson.resources.map((r, index) => (
                    <Pressable
                      key={r.id}
                      accessibilityRole="link"
                      onPress={() => void Linking.openURL(r.url).catch(() => Alert.alert("Unable to open", "This link couldn't be opened."))}
                      style={({ pressed }) => [
                        styles.compactRow,
                        (index < lesson.resources.length - 1 || canManage) && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                        { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                      ]}
                    >
                      <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}>
                        <Icon ios="doc.text" android="description" size={16} color={colors.text2} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Copy numberOfLines={1} style={{ fontWeight: "500" }}>{r.title}</Copy>
                        <Copy kind="caption" numberOfLines={1}>{r.url}</Copy>
                      </View>
                      <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
                    </Pressable>
                  ))}
                  {canManage && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={onAddResource}
                      style={({ pressed }) => [styles.compactRow, { backgroundColor: pressed ? colors.primarySoft : "transparent" }]}
                    >
                      <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft }}>
                        <Icon ios="plus" android="add" size={16} color={colors.primary} />
                      </View>
                      <Copy style={{ fontWeight: "500", color: colors.primary }}>Add resource</Copy>
                    </Pressable>
                  )}
                </View>
              </View>

              {!lesson.isExamDay && (
                <Button
                  label="Take attendance"
                  onPress={() => router.push({ pathname: "/prep-attendance", params: { lessonId: lesson.id } })}
                />
              )}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function FieldRow({ label, value, muted = false, last = false }: { label: string; value: string | ReactNode; muted?: boolean; last?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={[{ padding: 10, paddingHorizontal: 16 }, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <Copy kind="caption">{label}</Copy>
      {typeof value === "string" ? <Copy style={{ marginTop: 2, color: muted ? colors.muted : colors.text }}>{value}</Copy> : <View style={{ marginTop: 4, alignSelf: "flex-start" }}>{value}</View>}
    </View>
  );
}

function AddResourceSheet({ lessonId, onClose, onSaved }: { lessonId: string; onClose: () => void; onSaved: () => void }) {
  const { colors } = useAppTheme();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const action = useAction();

  function submit() {
    if (!title.trim() || !url.trim()) {
      Alert.alert("Missing information", "Give the resource a title and a link.");
      return;
    }
    if (!isSafeResourceUrl(url)) {
      Alert.alert("Invalid link", "Links must start with http:// or https://.");
      return;
    }
    void action.run(async () => {
      await request(`/api/lessons/${encodeURIComponent(lessonId)}`, "PATCH", {
        resources: [{ title: title.trim(), url: url.trim() }],
      });
      onSaved();
    });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 24, gap: 14 }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            disabled={action.busy}
            onPress={onClose}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>Add resource</Copy>
          <View style={{ width: 40 }} />
        </View>
        <Field label="Title" value={title} onChange={setTitle} placeholder="Slides, handout, link…" disabled={action.busy} />
        <Field label="Link" value={url} onChange={setUrl} placeholder="https://…" keyboardType="default" disabled={action.busy} />
        <Button label={action.busy ? "Adding…" : "Add resource"} disabled={action.busy} onPress={submit} />
      </View>
    </Modal>
  );
}
