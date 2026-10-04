import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import type { SundaySchoolAssignmentRow, SundaySchoolClassRef, SundaySchoolServantRef, SundaySchoolLevel } from "@stmark/contracts";
import { Button, Card, Copy, RowLink } from "@/components/ui";
import { Choice, Page } from "@/components/forms";
import { endpoint, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { MinistryTintProvider } from "@/theme";

type Organization = { academicYear: { name: string } | null; priests: SundaySchoolServantRef[]; classes: SundaySchoolClassRef[]; ageGroups: { id: string; name: string; levels: SundaySchoolLevel[]; overseerId: string | null }[]; assignments: SundaySchoolAssignmentRow[] };
export default function Organization() {
  const { personId } = useLocalSearchParams<{ personId?: string }>();
  const { user } = useAuth();
  const [selected, setSelected] = useState(personId ?? "");
  const resource = useResource<Organization>(user?.role === "SUPER_ADMIN" ? endpoint("organization") : null);
  const data = resource.data;
  const people = data ? Array.from(new Map([...data.priests, ...data.assignments.map(a => a.user)].map(p => [p.id, p])).values()).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const groups = data ? [...data.ageGroups, { id: "ungrouped", name: "No age group", levels: [], overseerId: null }] : [];
  return <MinistryTintProvider ministry="sundaySchool"><Page title="Ministry organization" {...resource}>
    {user?.role !== "SUPER_ADMIN" && <Copy>Super-admin access is required.</Copy>}
    {data && <><Copy kind="heading">{data.academicYear?.name ?? "No active year"}</Copy><Choice label="Focus on a person" value={selected} onChange={setSelected} options={[{ value: "", label: "Entire ministry" }, ...people.map(p => ({ value: p.id, label: p.name }))]} />
      <Button secondary label="Reset focus" onPress={() => setSelected("")} />
      {groups.map(g => {
        const leads = data.assignments.filter(a => a.ageGroupId === g.id);
        const oversees = g.overseerId === selected || leads.some(a => a.user.id === selected);
        const classes = data.classes.filter(c => g.id === "ungrouped" ? !data.ageGroups.some(b => b.levels.includes(c.level)) : g.levels.includes(c.level)).filter(c => !selected || oversees || data.assignments.some(a => a.classId === c.id && a.user.id === selected));
        if (!classes.length && !oversees) return null;
        return <Card key={g.id}><Copy kind="heading">{g.name}</Copy><Copy>Priest overseer: {data.priests.find(p => p.id === g.overseerId)?.name ?? "Not assigned"}</Copy>
          {leads.map(a => <Copy key={a.user.id}>Age-group coordinator: {a.user.name}</Copy>)}
          {classes.map(c => <Card key={c.id}><RowLink title={c.name} onPress={() => router.push({ pathname: "/class/[id]", params: { id: c.id } })} />
            {data.assignments.filter(a => a.classId === c.id).map(a => <RowLink key={a.user.id} title={a.user.name} subtitle={a.authority === "COORDINATOR" ? "Class coordinator" : "Servant"} onPress={() => setSelected(a.user.id)} />)}
            {!data.assignments.some(a => a.classId === c.id) && <Copy>No direct staffing.</Copy>}
          </Card>)}
        </Card>;
      })}
    </>}
  </Page></MinistryTintProvider>;
}
