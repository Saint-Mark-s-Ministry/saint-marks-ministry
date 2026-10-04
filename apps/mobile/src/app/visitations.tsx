import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import type { SundaySchoolVisitationsResponse, SundaySchoolVisitationChild, SundaySchoolPriestNote } from "@stmark/contracts";
import { Button, Card, Copy, readableDate } from "@/components/ui";
import { Choice, Field, Page, ResourceState, useAction } from "@/components/forms";
import { endpoint, query, request, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import { validDate } from "@/data/ministry";
import { MinistryTintProvider } from "@/theme";

export default function Visitations() {
  const params = useLocalSearchParams<{ classId?: string; childId?: string }>();
  const [classId, setClassId] = useState(params.classId ?? "");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(params.childId ?? "");
  const { classes } = usePortal();
  const resource = useResource<SundaySchoolVisitationsResponse>(`${endpoint("visitations")}?${query({ classId })}`);
  return <MinistryTintProvider ministry="sundaySchool"><Page title="Visitations" {...resource}>
    <Choice label="Class" value={classId} onChange={value => { setClassId(value); setSelected(""); }} options={[{ value: "", label: "All accessible classes" }, ...classes.map(c => ({ value: c.id, label: c.name }))]} />
    <Field label="Find a child" value={search} onChange={setSearch} />
    {resource.data?.classes.map(cls => <Card key={cls.id}><Copy kind="heading">{cls.name}</Copy>
      {cls.children.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase())).map(c => <Card key={c.id}>
        <Copy>{c.firstName} {c.lastName}</Copy><Copy kind="caption">{c.visitations[0] ? c.visitations[0].status === "DONE" ? `Visited ${c.visitations[0].visitedAt?.slice(0, 10)}` : "Visit not completed" : "No visits recorded"}</Copy>
        <Button secondary label={selected === c.id ? "Close history" : "Open visits & notes"} onPress={() => setSelected(selected === c.id ? "" : c.id)} />
        {selected === c.id && <VisitDetail child={c} canEdit={cls.canEdit} refresh={resource.refresh} />}
      </Card>)}
      {!cls.children.length && <Copy>No active children in this class.</Copy>}
    </Card>)}
  </Page></MinistryTintProvider>;
}
function VisitDetail({ child, canEdit, refresh }: { child: SundaySchoolVisitationChild; canEdit: boolean; refresh: () => Promise<void> }) {
  const notes = useResource<{ notes: SundaySchoolPriestNote[] }>(`${endpoint("priest-notes")}?${query({ childId: child.id })}`);
  const [status, setStatus] = useState("DONE");
  const [visitedAt, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [text, setText] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const action = useAction();
  return <>
    {child.visitations.map(v => <Card key={v.id}><Copy>{v.status === "DONE" ? "Visited" : "Not completed"} · {readableDate(v.visitedAt ?? v.createdAt)}</Copy><Copy kind="caption">{v.recorder?.name ?? "Unknown recorder"}</Copy>{v.notes && <Copy>{v.notes}</Copy>}</Card>)}
    <Copy kind="heading">Confidential notes</Copy><Copy kind="caption">Only priests and each note’s author can read its content. These are loaded separately from the visitation history.</Copy>
    <ResourceState {...notes} retry={() => void notes.refresh()} />
    {notes.data?.notes.map(n => <Card key={n.id}><Copy>{n.content}</Copy><Copy kind="caption">{n.author.name} · {readableDate(n.createdAt)}</Copy></Card>)}
    {notes.data && !notes.data.notes.length && <Copy>No confidential notes visible to you.</Copy>}
    {canEdit && <Card><Copy kind="heading">Record a visit</Copy><Choice label="Outcome" value={status} onChange={setStatus} disabled={action.busy} options={[{ value: "DONE", label: "Visit completed" }, { value: "NOT_DONE", label: "Not completed" }]} />
      {status === "DONE" && <Field label="Visit date (YYYY-MM-DD)" value={visitedAt} onChange={setDate} disabled={action.busy} />}
      <Field label="Shared ministry notes" multiline value={text} onChange={setText} disabled={action.busy} />
      <Field label="Confidential note for priests" multiline value={privateNote} onChange={setPrivateNote} disabled={action.busy} />
      <Button label={action.busy ? "Saving…" : "Save visit"} disabled={action.busy} onPress={() => void action.run(async () => {
        if (status === "DONE" && (!validDate(visitedAt) || visitedAt > new Date().toISOString().slice(0, 10))) throw new Error("Enter a valid visit date that is not in the future.");
        await request(endpoint("visitations"), "POST", { childId: child.id, status, visitedAt: status === "DONE" ? visitedAt : undefined, notes: text, privateNote });
        setText(""); setPrivateNote(""); await refresh();
      }, "Visit saved")} /></Card>}
  </>;
}
