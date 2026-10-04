import { useState } from "react";
import type { SundaySchoolAgeGroup, SundaySchoolLevel, SundaySchoolServantRef } from "@stmark/contracts";
import { LEVEL_ORDER, getLevelDisplayName } from "@stmark/domain";
import { Button, Card, Copy } from "@/components/ui";
import { Choice, Field, Page, Toggle, confirmAction, useAction } from "@/components/forms";
import { Staffing } from "@/components/staffing";
import { endpoint, request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { usePortal } from "@/data/portal-provider";
import { MinistryTintProvider } from "@/theme";

export default function AgeGroups() {
  const { user } = useAuth();
  const resource = useResource<SundaySchoolAgeGroup[]>(user?.role === "SUPER_ADMIN" ? endpoint("age-groups") : null);
  const priests = useResource<(SundaySchoolServantRef & { isDisabled: boolean })[]>(user?.role === "SUPER_ADMIN" ? "/api/users?role=PRIEST" : null);
  const [editor, setEditor] = useState<SundaySchoolAgeGroup | "new" | null>(null);
  const [staffing, setStaffing] = useState("");
  const action = useAction();
  const portal = usePortal();
  const refresh = async () => { await Promise.all([resource.refresh(), portal.refresh()]); };
  return <MinistryTintProvider ministry="sundaySchool"><Page title="Age groups" {...resource}>
    {user?.role !== "SUPER_ADMIN" ? <Copy>Super-admin access is required.</Copy> : <>
      <Button label="New age group" onPress={() => setEditor("new")} />
      {editor && <GroupEditor key={editor === "new" ? "new" : editor.id} group={editor === "new" ? undefined : editor} groups={resource.data ?? []} priests={(priests.data ?? []).filter(p => !p.isDisabled)} cancel={() => setEditor(null)} done={async () => { setEditor(null); await refresh(); }} />}
      {resource.data?.map(g => <Card key={g.id}><Copy kind="heading">{g.name}</Copy><Copy>{g.levels.map(getLevelDisplayName).join(", ")}</Copy><Copy>Priest overseer: {g.overseer?.name ?? "Not assigned"}</Copy><Copy>{g.isActive ? "Active" : "Inactive"}</Copy>
        {(g.assignments ?? []).map(a => <Copy key={a.id}>Coordinator: {a.user.name}</Copy>)}
        <Button secondary label="Edit age group" onPress={() => setEditor(g)} />
        <Button secondary label={staffing === g.id ? "Close staffing" : "Manage coordinators"} onPress={() => setStaffing(staffing === g.id ? "" : g.id)} />
        {staffing === g.id && <Staffing ageGroupId={g.id} assignments={g.assignments ?? []} refresh={refresh} />}
        <Button secondary label="Delete age group" disabled={action.busy} onPress={() => confirmAction("Delete age group permanently?", "Its coordinator assignments will be removed. Classes stay, but become ungrouped. This cannot be undone.", () => void action.run(async () => { await request(endpoint("age-groups", g.id), "DELETE"); await refresh(); }), true)} />
      </Card>)}
    </>}
  </Page></MinistryTintProvider>;
}
function GroupEditor({ group, groups, priests, done, cancel }: { group?: SundaySchoolAgeGroup; groups: SundaySchoolAgeGroup[]; priests: SundaySchoolServantRef[]; done: () => Promise<void>; cancel: () => void }) {
  const [name, setName] = useState(group?.name ?? "");
  const [levels, setLevels] = useState<SundaySchoolLevel[]>(group?.levels ?? []);
  const [overseerId, setOverseer] = useState(group?.overseerId ?? "");
  const [order, setOrder] = useState(String(group?.sortOrder ?? 0));
  const [active, setActive] = useState(group?.isActive ?? true);
  const action = useAction();
  return <Card><Field label="Age group name" value={name} onChange={setName} disabled={action.busy} />
    <Copy kind="caption">Grade ownership determines which classes coordinators can access.</Copy>
    {LEVEL_ORDER.map(level => { const owner = groups.find(g => g.id !== group?.id && g.levels.includes(level)); return <Toggle key={level} label={`${getLevelDisplayName(level)}${owner ? ` — ${owner.name}` : ""}`} value={levels.includes(level)} disabled={action.busy || !!owner} onChange={selected => setLevels(ls => selected ? [...ls, level] : ls.filter(l => l !== level))} />; })}
    <Choice label="Priest overseer" value={overseerId} onChange={setOverseer} disabled={action.busy} options={[{ value: "", label: "No overseer" }, ...priests.map(p => ({ value: p.id, label: p.name }))]} />
    <Field label="Display order" value={order} onChange={setOrder} keyboardType="numeric" disabled={action.busy} />
    {group && <Toggle label="Active" value={active} onChange={setActive} disabled={action.busy} />}
    <Button label={action.busy ? "Saving…" : "Save age group"} disabled={action.busy || !name.trim() || !levels.length} onPress={() => confirmAction("Save age group?", "Changing grades can change which classes the group’s coordinators may manage.", () => void action.run(async () => { await request(endpoint("age-groups", group?.id), group ? "PATCH" : "POST", { name, levels, overseerId: overseerId || null, sortOrder: Number(order) || 0, ...(group ? { isActive: active } : {}) }); await done(); }))} />
    <Button secondary label="Cancel" disabled={action.busy} onPress={cancel} />
  </Card>;
}
