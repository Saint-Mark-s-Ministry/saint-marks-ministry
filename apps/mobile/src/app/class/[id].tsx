import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import type { SundaySchoolClass, SundaySchoolChild, SundaySchoolSession, SundaySchoolDashboard } from "@stmark/contracts";
import { getLevelDisplayName } from "@stmark/domain";
import { Button, Card, Copy, RowLink, readableDate } from "@/components/ui";
import { Choice, Field, Page, confirmAction, useAction } from "@/components/forms";
import { Staffing } from "@/components/staffing";
import { endpoint, request, useResource } from "@/data/resources";
import { ministryAccess } from "@/data/ministry";
import { usePortal } from "@/data/portal-provider";
import { MinistryTintProvider } from "@/theme";

type Detail = SundaySchoolClass & { children: SundaySchoolChild[]; sessions: SundaySchoolSession[] };
export default function ClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resource = useResource<Detail>(id === "new" ? null : endpoint("classes", id));
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const [editing, setEditing] = useState(false);
  const portal = usePortal();
  const action = useAction();
  const cls = resource.data;
  const refresh = async () => { await Promise.all([resource.refresh(), portal.refresh()]); };
  if (id === "new" || (cls && editing)) return <MinistryTintProvider ministry="sundaySchool"><Page title={id === "new" ? "New class" : "Edit class"} {...dashboard}>
    {dashboard.data && <ClassForm cls={cls} dashboard={dashboard.data} done={async () => { setEditing(false); await refresh(); }} />}
    {editing && <Button label="Cancel" secondary onPress={() => setEditing(false)} />}
  </Page></MinistryTintProvider>;
  return <MinistryTintProvider ministry="sundaySchool"><Page title={cls?.name ?? "Class"} {...resource}>
    {cls && <><Copy kind="title">{cls.name}</Copy><Copy>{getLevelDisplayName(cls.level)} · {cls.academicYear?.name} · {cls.isActive ? "Active" : "Archived"}</Copy>
      <Button label={cls.canServe ? "Take child attendance" : "View child attendance"} onPress={() => router.push({ pathname: "/attendance/[classId]", params: { classId: id } })} />
      {(cls.canViewServantAttendance || cls.canTakeServantAttendance) && <Button secondary label={cls.canTakeServantAttendance ? "Servant attendance" : "View servant attendance"} onPress={() => router.push({ pathname: "/servant-attendance", params: { classId: id } })} />}
      <Card><Copy kind="heading">Class team</Copy>{cls.assignments.length ? cls.assignments.map(a => <Copy key={a.id}>{a.user.name} · {a.authority === "COORDINATOR" ? "Coordinator" : "Servant"}</Copy>) : <Copy>No servants assigned.</Copy>}</Card>
      {cls.canCoordinate && <><Button secondary label="Edit class" onPress={() => setEditing(true)} />
        <Staffing classId={id} academicYearId={cls.academicYearId} assignments={cls.assignments} refresh={refresh} /></>}
      <Card><RowLink title={`Children (${cls.children.filter(c => c.isActive).length})`} subtitle="Profiles, family details, and roster management" onPress={() => router.push({ pathname: "/roster", params: { classId: id } })} />
        {cls.children.filter(c => c.isActive).map(c => <RowLink key={c.id} title={`${c.firstName} ${c.lastName}`} onPress={() => router.push({ pathname: "/child/[id]", params: { id: c.id } })} />)}</Card>
      <Card><Copy kind="heading">Attendance history</Copy>{!cls.sessions.length && <Copy>No sessions recorded.</Copy>}
        {cls.sessions.map(s => <RowLink key={s.id} title={readableDate(s.date)} subtitle={`${s._count?.attendance ?? 0} child marks${s.topic ? ` · ${s.topic}` : ""}`} onPress={() => router.push({ pathname: "/attendance/[classId]", params: { classId: id, date: s.date.slice(0, 10) } })} />)}</Card>
      {cls.canDelete && <Button secondary label="Delete class" disabled={action.busy} onPress={() => confirmAction(`Delete ${cls.name}?`, `This permanently deletes the class and its class-specific history. ${cls.children.length} ${cls.children.length === 1 ? "child" : "children"} will be preserved and moved to Unassigned. This cannot be undone.`, () => void action.run(async () => {
        await request(endpoint("classes", id), "DELETE"); await portal.refresh(); router.back();
      }), true)} />}
    </>}
  </Page></MinistryTintProvider>;
}
function ClassForm({ cls, dashboard, done }: { cls?: SundaySchoolClass; dashboard: SundaySchoolDashboard; done: () => Promise<void> }) {
  const [name, setName] = useState(cls?.name ?? "");
  const access = ministryAccess(dashboard);
  const [level, setLevel] = useState<string>(cls?.level ?? access.createLevels[0] ?? "");
  const action = useAction();
  const levels = Array.from(new Set([...(cls ? [cls.level] : []), ...access.createLevels]));
  return <Card><Field label="Class name" value={name} onChange={setName} disabled={action.busy} />
    <Choice label="Grade level" value={level} onChange={setLevel} disabled={action.busy || !access.createLevels.length} options={levels.map(value => ({ value, label: getLevelDisplayName(value) }))} />
    <Button label={action.busy ? "Saving…" : "Save class"} disabled={action.busy || !name.trim() || !level || (!cls && !access.createLevels.length)} onPress={() => void action.run(async () => {
      const result = await request<SundaySchoolClass>(endpoint("classes", cls?.id), cls ? "PATCH" : "POST", { name: name.trim(), ...(!cls || cls.level !== level ? { level } : {}) });
      await done(); if (!cls) router.replace({ pathname: "/class/[id]", params: { id: result.id } });
    })} />
    {cls && !cls.isActive && <Button secondary label="Reactivate class" disabled={action.busy} onPress={() => void action.run(async () => { await request(endpoint("classes", cls.id), "PATCH", { isActive: true }); await done(); })} />}
  </Card>;
}
