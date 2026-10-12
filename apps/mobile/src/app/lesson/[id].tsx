import { useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { SundaySchoolWeeklyLesson, SundaySchoolWeeklyLessonsResponse } from "@stmark/contracts";
import {
  Button,
  Card,
  Copy,
  ListSurface,
  RowLink,
  Screen,
  SectionTitle,
  StatusPill,
  readableDate,
} from "@/components/ui";
import { Choice, Field, ResourceState, useAction } from "@/components/forms";
import { safeHttpUrl } from "@/data/prep-lessons";
import { endpoint, query, request, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import {
  canOpenEditor,
  isLessonDraftDirty,
  lessonTitle,
  readiness,
  resourceSubtitle,
  validateLinkDraft,
  type LinkDraft,
} from "@/data/sunday-school-lessons";
import { MinistryTintProvider, useAppTheme } from "@/theme";

// No Sunday School-specific artboard exists for this detail screen (only the
// Servants Prep lesson detail and the Lessons list do). This follows the list
// screen's own visual language — opaque cards, the same status-pill style,
// a RowLink per resource — rather than inventing a one-off layout.
export default function Lesson() {
  const { id, classId } = useLocalSearchParams<{ id: string; classId?: string }>();
  const { colors } = useAppTheme();
  const resource = useResource<SundaySchoolWeeklyLessonsResponse>(
    `${endpoint("lessons")}?${query({ scope: "year", classId })}`,
  );
  const { refresh } = usePortal();
  const [editing, setEditing] = useState(false);
  const lesson = resource.data?.lessons.find((l) => l.id === id);
  const state = lesson ? readiness(lesson.status) : null;
  const pill =
    state &&
    {
      ready: { color: colors.success, soft: colors.successSoft },
      needsLinks: { color: colors.warning, soft: colors.warningSoft },
      unassigned: { color: colors.muted, soft: colors.hover },
    }[state.tone];

  const done = async () => {
    setEditing(false);
    await Promise.all([resource.refresh(), refresh()]);
  };

  function openResource(url: string) {
    const safe = safeHttpUrl(url);
    if (!safe) {
      Alert.alert("Invalid resource link");
      return;
    }
    void Linking.openURL(safe).catch(() => Alert.alert("Unable to open resource"));
  }

  return (
    <MinistryTintProvider ministry="sundaySchool">
      <Stack.Screen
        options={{
          title: "",
          // This screen draws its own centered title below; the native large
          // title would reserve a second, empty title band above it.
          headerLargeTitle: false,
          headerRight: () =>
            lesson && canOpenEditor(lesson) && !editing ? (
              // A shared Button goes zero-width as a header-right row sibling
              // (documented on prep-attendance.tsx); every nav-bar text button
              // in this rebuild uses a plain Pressable instead.
              <Pressable accessibilityRole="button" accessibilityLabel="Edit" hitSlop={8} onPress={() => setEditing(true)}>
                <Copy color={colors.primary} style={{ fontWeight: "600", fontSize: 17 }}>
                  Edit
                </Copy>
              </Pressable>
            ) : undefined,
        }}
      />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />

        {resource.data && !lesson && (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Copy kind="heading">Lesson unavailable</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              This lesson isn't available for this account or academic year.
            </Copy>
          </View>
        )}

        {lesson && !editing && (
          <>
            <View style={{ alignItems: "center", gap: 6, paddingTop: 4 }}>
              <Copy kind="caption">{lesson.class.name}</Copy>
              <Copy
                style={{ fontFamily: "Newsreader_500Medium", fontSize: 28, lineHeight: 32, fontWeight: "500", textAlign: "center" }}
              >
                {lessonTitle(lesson)}
              </Copy>
              {state && pill && <StatusPill label={state.label} color={pill.color} soft={pill.soft} />}
            </View>

            <ListSurface>
              <InfoRow label="Date" value={readableDate(lesson.sundayDate)} />
              <Divider />
              <InfoRow label="Teacher" value={lesson.owner?.name ?? "No teacher assigned"} />
            </ListSurface>

            <View style={{ gap: 10 }}>
              <SectionTitle title="Resources" subtitle={lesson.resources.length ? `${lesson.resources.length}` : undefined} />
              <ListSurface>
                {!lesson.resources.length && (
                  <View style={{ padding: 14 }}>
                    <Copy kind="caption">No resources yet.</Copy>
                  </View>
                )}
                {lesson.resources.map((r, index, arr) => (
                  <View key={r.id}>
                    <RowLink title={r.title} subtitle={resourceSubtitle(r)} onPress={() => openResource(r.url)} />
                    {index < arr.length - 1 && <Divider />}
                  </View>
                ))}
              </ListSurface>
            </View>
          </>
        )}

        {lesson && editing && <LessonEditor key={lesson.id} lesson={lesson} cancel={() => setEditing(false)} done={done} />}
      </Screen>
    </MinistryTintProvider>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ padding: 14, gap: 2 }}>
      <Copy kind="caption">{label}</Copy>
      <Copy>{value}</Copy>
    </View>
  );
}

function Divider() {
  const { colors } = useAppTheme();
  return <View style={{ height: 0.5, marginLeft: 16, backgroundColor: colors.border }} />;
}

function LessonEditor({
  lesson,
  done,
  cancel,
}: {
  lesson: SundaySchoolWeeklyLesson;
  done: () => Promise<void>;
  cancel: () => void;
}) {
  const initialLinks: LinkDraft[] = lesson.resources.map((r) => ({ title: r.title, url: r.url }));
  const [title, setTitle] = useState(lesson.title ?? "");
  const [ownerId, setOwnerId] = useState(lesson.ownerId ?? "");
  const [links, setLinks] = useState<LinkDraft[]>(initialLinks);
  const action = useAction();
  const dirty = isLessonDraftDirty(
    { title: lesson.title ?? "", ownerId: lesson.ownerId ?? "", links: initialLinks },
    { title, ownerId, links },
  );

  function requestCancel() {
    if (!dirty) {
      cancel();
      return;
    }
    Alert.alert("Discard changes?", "You have unsaved changes to this lesson.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: cancel },
    ]);
  }

  function save() {
    if (lesson.canEdit) {
      const error = validateLinkDraft(links);
      if (error) {
        Alert.alert("Can't save yet", error);
        return;
      }
    }
    void action.run(async () => {
      await request(endpoint("lessons", lesson.id), "PATCH", {
        ...(lesson.canEdit
          ? { title: title.trim(), resources: links.map((l) => ({ title: l.title.trim(), url: l.url.trim() })) }
          : {}),
        ...(lesson.canAssignOwner ? { ownerId: ownerId || null } : {}),
      });
      await done();
    }, "Lesson saved");
  }

  return (
    <>
      <Card style={{ gap: 12 }}>
        {lesson.canAssignOwner && (
          <Choice
            label="Teacher"
            value={ownerId}
            disabled={action.busy}
            onChange={setOwnerId}
            options={[{ value: "", label: "Unassigned" }, ...lesson.eligibleOwners.map((p) => ({ value: p.id, label: p.name }))]}
          />
        )}
        {lesson.canEdit && (
          <Field label="Lesson title" value={title} onChange={setTitle} placeholder="Weekly lesson" disabled={action.busy} />
        )}
      </Card>

      {lesson.canEdit && (
        <View style={{ gap: 10 }}>
          <SectionTitle title="Resources" />
          {links.map((link, index) => (
            <Card key={index} style={{ gap: 10 }}>
              <Field
                label={`Resource ${index + 1} title`}
                value={link.title}
                disabled={action.busy}
                onChange={(v) => setLinks((ls) => ls.map((l, i) => (i === index ? { ...l, title: v } : l)))}
              />
              <Field
                label="Web address (https://…)"
                value={link.url}
                disabled={action.busy}
                onChange={(v) => setLinks((ls) => ls.map((l, i) => (i === index ? { ...l, url: v } : l)))}
              />
              <Button
                secondary
                label="Remove link from draft"
                disabled={action.busy}
                onPress={() => setLinks((ls) => ls.filter((_, i) => i !== index))}
              />
            </Card>
          ))}
          <Button
            secondary
            label="Add resource link"
            disabled={action.busy}
            onPress={() => setLinks((ls) => [...ls, { title: "", url: "" }])}
          />
        </View>
      )}

      <Button label={action.busy ? "Saving…" : "Save lesson"} disabled={action.busy} onPress={save} />
      <Button secondary label="Cancel" disabled={action.busy} onPress={requestCancel} />
    </>
  );
}
