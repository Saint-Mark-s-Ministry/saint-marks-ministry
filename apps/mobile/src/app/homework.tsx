import { useEffect, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import type { SundaySchoolHomeworkDisplayStatus, SundaySchoolHomeworkResponse } from "@stmark/contracts";
import { Button, Copy, Icon, ListSurface, Screen, SectionTitle, StatusPill } from "@/components/ui";
import { Choice, Field, ResourceState, confirmAction, useAction } from "@/components/forms";
import { endpoint, query, request, useResource } from "@/data/resources";
import {
  completionLabel,
  completionTone,
  defaultWeekId,
  draftFromWeek,
  homeworkHistory,
  isHomeworkDraftDirty,
  validateHomeworkDraft,
  type HomeworkDraft,
} from "@/data/sunday-school-homework";
import { shortMonthDay } from "@/data/sunday-school-classes";
import { MinistryTintProvider, serifDisplay, useAppTheme, type ThemeColors } from "@/theme";

function toneColor(colors: ThemeColors, tone: "success" | "danger" | "neutral"): string {
  if (tone === "success") return colors.success;
  if (tone === "danger") return colors.danger;
  return colors.text2;
}
function toneSoft(colors: ThemeColors, tone: "success" | "danger" | "neutral"): string {
  if (tone === "success") return colors.successSoft;
  if (tone === "danger") return colors.dangerSoft;
  return colors.hover;
}

const OFFLINE = "Could not reach the server. Check your connection and try again.";
const MARK_OPTIONS: { value: SundaySchoolHomeworkDisplayStatus; label: string }[] = [
  { value: "COMPLETED", label: "Completed" },
  { value: "NOT_COMPLETED", label: "Not completed" },
  { value: "NOT_RECORDED", label: "Clear" },
];

export default function Homework() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <HomeworkScreen />
    </MinistryTintProvider>
  );
}

function HomeworkScreen() {
  const { colors } = useAppTheme();
  const today = new Date().toISOString().slice(0, 10);
  const [classId, setClassId] = useState("");
  const resource = useResource<SundaySchoolHomeworkResponse>(
    `${endpoint("homework")}?${query({ classId: classId || undefined, includeArchived: "true" })}`,
  );
  const offline = resource.error === OFFLINE;
  const data = resource.data;

  const classes = data?.classes ?? [];
  const weeks = (data?.weeks ?? []).filter((w) => !classId || w.class.id === classId);
  const [weekId, setWeekId] = useState("");
  const selectedWeek = weeks.find((w) => w.weeklyLessonId === weekId) ?? null;
  const selectedClass = classes.find((c) => c.id === classId);

  const [marks, setMarks] = useState<Record<string, SundaySchoolHomeworkDisplayStatus>>({});
  const [savingMarks, setSavingMarks] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  // Auto-select the first eligible class, same as the web page. Only the
  // count/identity of classes matters here, not a fresh array reference.
  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, classes.length]);

  // Land on the most relevant week whenever the class or its weeks change.
  useEffect(() => {
    if (!weeks.length) {
      setWeekId("");
      return;
    }
    if (weeks.some((w) => w.weeklyLessonId === weekId)) return;
    setWeekId(defaultWeekId(weeks, today) ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId, weeks.map((w) => w.weeklyLessonId).join(",")]);

  useEffect(() => {
    const next: Record<string, SundaySchoolHomeworkDisplayStatus> = {};
    for (const child of data?.roster ?? []) next[child.id] = "NOT_RECORDED";
    for (const completion of selectedWeek?.homework?.completions ?? []) next[completion.childId] = completion.status;
    setMarks(next);
  }, [data?.roster, selectedWeek]);

  async function saveMarks() {
    if (!selectedWeek?.homework) return;
    setSavingMarks(true);
    try {
      await request(`${endpoint("homework", selectedWeek.homework.id)}/completions`, "POST", {
        records: (data?.roster ?? []).map((child) => ({
          childId: child.id,
          status: marks[child.id] === "NOT_RECORDED" ? null : marks[child.id],
        })),
      });
      await resource.refresh();
    } finally {
      setSavingMarks(false);
    }
  }

  function archiveHomework() {
    if (!selectedWeek?.homework) return;
    confirmAction(
      "Archive this homework?",
      "Families will no longer see it, but its history will be kept.",
      () =>
        void (async () => {
          await request(endpoint("homework", selectedWeek!.homework!.id), "DELETE");
          await resource.refresh();
        })(),
    );
  }

  const history = homeworkHistory(data?.roster ?? [], weeks);

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        <View style={{ paddingHorizontal: 4, gap: 4 }}>
          <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>Homework</Copy>
          <Copy kind="caption">Publish Elementary homework and track completion through the school year</Copy>
        </View>

        {offline && resource.stale && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
            <Copy kind="caption">Showing the last homework we had. Pull down to try again.</Copy>
          </View>
        )}
        {!resource.stale && (
          <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />
        )}

        {data && !data.eligible && (
          <ListSurface style={{ padding: 16 }}>
            <Copy>Homework is available only to servants assigned to an Elementary class.</Copy>
          </ListSurface>
        )}

        {data?.eligible && (
          <>
            <Choice
              label="Class"
              value={classId}
              onChange={setClassId}
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Choice
              label="Assigned meeting"
              value={weekId}
              onChange={setWeekId}
              disabled={!weeks.length}
              options={weeks.map((w) => ({ value: w.weeklyLessonId, label: shortMonthDay(w.assignedDate) }))}
            />

            {!selectedWeek && (
              <ListSurface style={{ padding: 16 }}>
                <Copy kind="caption">No weekly lesson dates are available for this class.</Copy>
              </ListSurface>
            )}

            {selectedWeek && !selectedWeek.homework && (
              <View style={{ alignItems: "center", gap: 10, paddingVertical: 24 }}>
                <Icon ios="note.text" android="description" size={32} color={colors.muted} />
                <Copy style={{ fontWeight: "600" }}>No homework assigned</Copy>
                <Copy kind="caption">
                  Assigned {shortMonthDay(selectedWeek.assignedDate)} · due {shortMonthDay(selectedWeek.dueDate)}
                </Copy>
                {selectedClass?.canEdit && <Button label="Publish homework" onPress={() => setEditorOpen(true)} />}
              </View>
            )}

            {selectedWeek?.homework && (
              <ListSurface style={{ padding: 16, gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Copy style={{ fontSize: 20, fontWeight: "600", flex: 1 }}>{selectedWeek.homework.title}</Copy>
                  {selectedWeek.homework.archivedAt && <StatusPill label="Archived" color={colors.text2} soft={colors.hover} />}
                </View>
                <Copy kind="caption">
                  Assigned {shortMonthDay(selectedWeek.assignedDate)} · due {shortMonthDay(selectedWeek.dueDate)}
                </Copy>
                {selectedWeek.homework.instructions && <Copy>{selectedWeek.homework.instructions}</Copy>}
                {selectedWeek.homework.resources.map((r) => (
                  <Pressable key={r.id} accessibilityRole="link" onPress={() => void Linking.openURL(r.url)}>
                    <Copy color={colors.primary}>{r.title}</Copy>
                  </Pressable>
                ))}
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  <StatusPill label={`${selectedWeek.homework.summary.completed} completed`} color={colors.success} soft={colors.successSoft} />
                  <StatusPill label={`${selectedWeek.homework.summary.notCompleted} not completed`} color={colors.danger} soft={colors.dangerSoft} />
                  <StatusPill label={`${selectedWeek.homework.summary.notRecorded} not recorded`} color={colors.text2} soft={colors.hover} />
                </View>
                {selectedClass?.canEdit && (
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Button secondary label="Edit" onPress={() => setEditorOpen(true)} />
                    <Button secondary label="Archive" onPress={archiveHomework} />
                  </View>
                )}
              </ListSurface>
            )}

            {selectedWeek?.homework && (
              <View style={{ gap: 10 }}>
                <SectionTitle title="Completion roster" />
                <Copy kind="caption">Only assigned servants can change the official record.</Copy>
                <ListSurface>
                  {(data.roster ?? []).map((child, index, arr) => (
                    <View key={child.id}>
                      <View style={{ padding: 14, gap: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Copy style={{ fontWeight: "500", flex: 1 }}>{child.firstName} {child.lastName}</Copy>
                          <StatusPill
                            label={completionLabel(marks[child.id] ?? "NOT_RECORDED")}
                            color={toneColor(colors, completionTone(marks[child.id] ?? "NOT_RECORDED"))}
                            soft={toneSoft(colors, completionTone(marks[child.id] ?? "NOT_RECORDED"))}
                          />
                        </View>
                        <Choice
                          label="Status"
                          compact
                          value={marks[child.id] ?? "NOT_RECORDED"}
                          onChange={(v) => setMarks((m) => ({ ...m, [child.id]: v as SundaySchoolHomeworkDisplayStatus }))}
                          disabled={!selectedClass?.canEdit}
                          options={MARK_OPTIONS}
                        />
                      </View>
                      {index < arr.length - 1 && <View style={{ height: 0.5, backgroundColor: colors.border }} />}
                    </View>
                  ))}
                  {!data.roster.length && (
                    <View style={{ padding: 14 }}>
                      <Copy kind="caption">No children are currently assigned to this class.</Copy>
                    </View>
                  )}
                </ListSurface>
                {selectedClass?.canEdit && !!data.roster.length && (
                  <Button label={savingMarks ? "Saving…" : "Save completion"} disabled={savingMarks} onPress={() => void saveMarks()} />
                )}
              </View>
            )}

            <View style={{ gap: 10 }}>
              <SectionTitle title="School-year history" />
              <Copy kind="caption">Completion rate excludes weeks that have not been recorded.</Copy>
              <ListSurface>
                {history.map((child, index, arr) => (
                  <View key={child.id}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}>
                      <Copy style={{ fontWeight: "500", flex: 1 }}>{child.firstName} {child.lastName}</Copy>
                      <Copy kind="caption">
                        {child.completed} done · {child.notCompleted} not done · {child.rate === null ? "—" : `${child.rate}%`}
                      </Copy>
                    </View>
                    {index < arr.length - 1 && <View style={{ height: 0.5, backgroundColor: colors.border }} />}
                  </View>
                ))}
                {!history.length && (
                  <View style={{ padding: 14 }}>
                    <Copy kind="caption">No children are currently assigned to this class.</Copy>
                  </View>
                )}
              </ListSurface>
            </View>
          </>
        )}
      </Screen>

      {editorOpen && selectedWeek && (
        <HomeworkEditorSheet
          week={selectedWeek}
          onClose={() => setEditorOpen(false)}
          onSaved={async () => {
            setEditorOpen(false);
            await resource.refresh();
          }}
        />
      )}
    </>
  );
}

function HomeworkEditorSheet({
  week,
  onClose,
  onSaved,
}: {
  week: NonNullable<ReturnType<typeof useResource<SundaySchoolHomeworkResponse>>["data"]>["weeks"][number];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const original = draftFromWeek(week);
  const [draft, setDraft] = useState<HomeworkDraft>(original);
  const action = useAction();
  const isEdit = !!week.homework;

  function requestClose() {
    if (!isHomeworkDraftDirty(draft, original)) {
      onClose();
      return;
    }
    confirmAction("Discard changes?", "Your edits to this homework will be lost.", onClose, true);
  }

  function submit() {
    const error = validateHomeworkDraft(draft);
    if (error) {
      confirmAction("Can't save yet", error, () => {});
      return;
    }
    void action.run(async () => {
      await request(
        week.homework ? endpoint("homework", week.homework.id) : endpoint("homework"),
        week.homework ? "PATCH" : "POST",
        {
          weeklyLessonId: week.weeklyLessonId,
          title: draft.title,
          instructions: draft.instructions,
          resources: draft.links,
        },
      );
      await onSaved();
    }, isEdit ? "Homework updated" : "Homework published");
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={requestClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingTop: 24 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            disabled={action.busy}
            onPress={requestClose}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>{isEdit ? "Edit homework" : "Publish homework"}</Copy>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save"
            disabled={action.busy || !draft.title.trim()}
            onPress={submit}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: !draft.title.trim() ? 0.4 : 1 }}
          >
            <Icon ios="checkmark" android="check" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 14 }}>
          <Field
            label="Title"
            value={draft.title}
            onChange={(title) => setDraft((d) => ({ ...d, title }))}
            placeholder="Memory verse and worksheet"
            disabled={action.busy}
          />
          <Field
            label="Instructions (optional)"
            value={draft.instructions}
            onChange={(instructions) => setDraft((d) => ({ ...d, instructions }))}
            placeholder="What should the children complete before next week?"
            multiline
            disabled={action.busy}
          />

          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Copy kind="caption">Links</Copy>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add link"
                onPress={() => setDraft((d) => ({ ...d, links: [...d.links, { title: "", url: "" }] }))}
              >
                <Copy color={colors.primary} style={{ fontWeight: "600" }}>+ Add link</Copy>
              </Pressable>
            </View>
            {draft.links.map((link, index) => (
              <View key={index} style={{ gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
                <Field
                  label={`Link ${index + 1} title`}
                  value={link.title}
                  onChange={(title) => setDraft((d) => ({ ...d, links: d.links.map((l, i) => (i === index ? { ...l, title } : l)) }))}
                  placeholder="Worksheet"
                  disabled={action.busy}
                />
                <Field
                  label={`Link ${index + 1} URL`}
                  value={link.url}
                  onChange={(url) => setDraft((d) => ({ ...d, links: d.links.map((l, i) => (i === index ? { ...l, url } : l)) }))}
                  placeholder="https://…"
                  disabled={action.busy}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove link ${index + 1}`}
                  onPress={() => setDraft((d) => ({ ...d, links: d.links.filter((_, i) => i !== index) }))}
                >
                  <Copy color={colors.danger}>Remove</Copy>
                </Pressable>
              </View>
            ))}
          </View>

          <Button label={action.busy ? "Saving…" : isEdit ? "Save changes" : "Publish homework"} disabled={action.busy || !draft.title.trim()} onPress={submit} />
        </ScrollView>
      </View>
    </Modal>
  );
}
