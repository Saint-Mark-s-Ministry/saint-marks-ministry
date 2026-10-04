import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import type { SundaySchoolServantAttendanceResponse } from "@stmark/contracts";
import { Button, Card, Copy } from "@/components/ui";
import { Choice, Field, Page, confirmAction, useAction } from "@/components/forms";
import { GlassChrome } from "@/components/chrome";
import { endpoint, query, request, useResource } from "@/data/resources";
import { usePortal, meetingDate } from "@/data/portal-provider";
import { validDate } from "@/data/ministry";
import { MinistryTintProvider } from "@/theme";

export default function ServantAttendance() {
  const params = useLocalSearchParams<{ classId?: string }>();
  const { classes } = usePortal();
  const allowed = useMemo(
    () => classes.filter(c => c.canViewServantAttendance || c.canTakeServantAttendance),
    [classes],
  );
  const [classId, setClassId] = useState(params.classId ?? allowed[0]?.id ?? "");
  const cls = allowed.find(c => c.id === classId);
  const [date, setDate] = useState(cls ? meetingDate(cls) : new Date().toISOString().slice(0, 10));
  useEffect(() => {
    if (!allowed.length || allowed.some(c => c.id === classId)) return;
    setClassId(allowed[0].id);
    setDate(meetingDate(allowed[0]));
  }, [allowed, classId]);
  const resource = useResource<SundaySchoolServantAttendanceResponse>(cls && validDate(date) ? `${endpoint("servant-attendance")}?${query({ classId, date })}` : null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const key = `${classId}:${date}`;
  const action = useAction();
  const marks = drafts[key] ?? Object.fromEntries(resource.data?.roster.flatMap(p => p.attendance ? [[p.userId, p.attendance.status]] : []) ?? []);
  return <MinistryTintProvider ministry="sundaySchool"><Page title="Servant attendance" {...resource}>
    <Choice label="Class" value={classId} disabled={action.busy} onChange={value => { setClassId(value); const c = allowed.find(c => c.id === value); if (c) setDate(meetingDate(c)); }} options={allowed.map(c => ({ value: c.id, label: c.name }))} />
    <Field label="Meeting date (YYYY-MM-DD)" value={date} onChange={setDate} disabled={action.busy} />
    {resource.data?.canEdit && <Copy kind="caption">Unsaved marks stay in memory when changing dates. They are lost when leaving this screen.</Copy>}
    {!allowed.length && <Copy>No classes with servant attendance are available to this account.</Copy>}
    {!validDate(date) && <Copy>Enter a valid date.</Copy>}
    {resource.data && <>{resource.data.canEdit && <Button secondary label="Mark all present" disabled={action.busy || !resource.data.roster.length} onPress={() => confirmAction("Mark everyone present?", "This updates the draft. You must still save to record attendance.", () => setDrafts(d => ({ ...d, [key]: Object.fromEntries(resource.data!.roster.map(p => [p.userId, "PRESENT"])) })))} />}
      {!resource.data.roster.length && <Copy>No active servants are assigned directly to this class.</Copy>}
      {resource.data.roster.map(p => <Card key={p.userId}><Copy kind="heading">{p.name}</Copy><Copy kind="caption">{p.authority === "COORDINATOR" ? "Coordinator" : "Servant"}</Copy>
        {resource.data?.canEdit ? <Choice label={`Attendance for ${p.name}`} value={marks[p.userId] ?? ""} disabled={action.busy} onChange={status => setDrafts(d => ({ ...d, [key]: { ...marks, [p.userId]: status } }))} options={[{ value: "", label: "Not marked" }, { value: "PRESENT", label: "Present" }, { value: "ABSENT", label: "Absent" }]} /> : <Copy>{p.attendance?.status === "PRESENT" ? "Present" : p.attendance?.status === "ABSENT" ? "Absent" : "Not recorded"}</Copy>}</Card>)}
      {resource.data.canEdit && <GlassChrome style={{ padding: 12, borderRadius: 26 }}><Button label={action.busy ? "Saving…" : "Save servant attendance"} disabled={action.busy || !resource.data.roster.length || !resource.data.roster.every(p => ["PRESENT", "ABSENT"].includes(marks[p.userId]))} onPress={() => void action.run(async () => {
        await request(endpoint("servant-attendance/batch"), "POST", { classId, date, records: resource.data!.roster.map(p => ({ servantId: p.userId, status: marks[p.userId] })) });
        setDrafts(d => { const next = { ...d }; delete next[key]; return next; }); await resource.refresh();
      }, "Attendance saved")} /></GlassChrome>}
    </>}
  </Page></MinistryTintProvider>;
}
