import { useState } from "react";
import { Alert, Linking } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { SundaySchoolWeeklyLesson, SundaySchoolWeeklyLessonsResponse } from "@stmark/contracts";
import { Button, Card, Copy, RowLink, readableDate } from "@/components/ui";
import { Choice, Field, Page, useAction } from "@/components/forms";
import { endpoint, query, request, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import { MinistryTintProvider } from "@/theme";

export default function Lesson() {
  const { id, classId } = useLocalSearchParams<{ id: string; classId?: string }>();
  const resource = useResource<SundaySchoolWeeklyLessonsResponse>(`${endpoint("lessons")}?${query({ scope: "year", classId })}`);
  const [editing, setEditing] = useState(false);
  const { refresh } = usePortal();
  const lesson = resource.data?.lessons.find(l => l.id === id);
  return <MinistryTintProvider ministry="sundaySchool"><Page title={lesson?.class.name ?? "Weekly lesson"} {...resource}>
    {resource.data && !lesson && <Copy>This lesson is unavailable for this account or academic year.</Copy>}
    {lesson && <><Copy kind="title">{lesson.title || "Weekly lesson"}</Copy><Copy>{readableDate(lesson.sundayDate)}</Copy><Copy>{lesson.owner?.name ?? "Teacher not assigned"}</Copy>
      {(lesson.canEdit || lesson.canAssignOwner) && !editing && <Button label="Edit lesson" onPress={() => setEditing(true)} />}
      {editing && <LessonEditor key={lesson.id} lesson={lesson} cancel={() => setEditing(false)} done={async () => { setEditing(false); await Promise.all([resource.refresh(), refresh()]); }} />}
      {!lesson.resources.length && <Card><Copy>No resources attached yet.</Copy></Card>}
      {lesson.resources.map(r => <Card key={r.id}><RowLink title={r.title} subtitle={r.url} onPress={() => {
        try { const url = new URL(r.url); if (!["https:", "http:"].includes(url.protocol)) throw new Error(); void Linking.openURL(url.href).catch(() => Alert.alert("Unable to open resource")); } catch { Alert.alert("Invalid resource link"); }
      }} /></Card>)}
    </>}
  </Page></MinistryTintProvider>;
}
function LessonEditor({ lesson, done, cancel }: { lesson: SundaySchoolWeeklyLesson; done: () => Promise<void>; cancel: () => void }) {
  const [title, setTitle] = useState(lesson.title ?? "");
  const [ownerId, setOwner] = useState(lesson.ownerId ?? "");
  const [links, setLinks] = useState(lesson.resources.map(r => ({ title: r.title, url: r.url })));
  const action = useAction();
  return <Card>
    {lesson.canAssignOwner && <Choice label="Teacher" value={ownerId} onChange={setOwner} disabled={action.busy} options={[{ value: "", label: "Unassigned" }, ...lesson.eligibleOwners.map(p => ({ value: p.id, label: p.name }))]} />}
    {lesson.canEdit && <><Field label="Lesson title" value={title} onChange={setTitle} disabled={action.busy} />
      {links.map((link, index) => <Card key={index}><Field label={`Resource ${index + 1} title`} value={link.title} disabled={action.busy} onChange={value => setLinks(ls => ls.map((l, i) => i === index ? { ...l, title: value } : l))} />
        <Field label="Web address (https://…)" value={link.url} disabled={action.busy} onChange={value => setLinks(ls => ls.map((l, i) => i === index ? { ...l, url: value } : l))} />
        <Button secondary label="Remove link from draft" disabled={action.busy} onPress={() => setLinks(ls => ls.filter((_, i) => i !== index))} />
      </Card>)}<Button secondary label="Add resource link" disabled={action.busy} onPress={() => setLinks(ls => [...ls, { title: "", url: "" }])} /></>}
    <Button label={action.busy ? "Saving…" : "Save lesson"} disabled={action.busy} onPress={() => void action.run(async () => {
      if (lesson.canEdit) for (const link of links) { let url: URL; try { url = new URL(link.url.trim()); } catch { throw new Error("Each resource needs a valid HTTP or HTTPS address."); } if (!link.title.trim() || !["http:", "https:"].includes(url.protocol)) throw new Error("Each resource needs a name and an HTTP or HTTPS address."); }
      await request(endpoint("lessons", lesson.id), "PATCH", { ...(lesson.canEdit ? { title, resources: links } : {}), ...(lesson.canAssignOwner ? { ownerId: ownerId || null } : {}) }); await done();
    }, "Lesson saved")} /><Button secondary label="Cancel" disabled={action.busy} onPress={cancel} />
  </Card>;
}
