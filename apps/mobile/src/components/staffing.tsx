import { useState } from "react";
import type { SundaySchoolAssignmentRow, SundaySchoolServantRef } from "@stmark/contracts";
import { Button, Card, Copy } from "./ui";
import { Choice, ResourceState, confirmAction, useAction } from "./forms";
import { endpoint, request, useResource } from "@/data/resources";

export function Staffing({ classId, ageGroupId, academicYearId, assignments, refresh }: {
  classId?: string; ageGroupId?: string; academicYearId?: string;
  assignments: SundaySchoolAssignmentRow[]; refresh: () => Promise<void>;
}) {
  const people = useResource<SundaySchoolServantRef[]>(endpoint("assignable-servants"));
  const [userId, setUserId] = useState("");
  const [authority, setAuthority] = useState(ageGroupId ? "COORDINATOR" : "SERVANT");
  const action = useAction();
  const assign = (id: string, role: string) => action.run(async () => {
    await request(endpoint("servant-assignments"), "POST", { userId: id, authority: role, classId, ageGroupId, academicYearId });
    setUserId(""); await refresh();
  }, "Staffing updated");
  return <Card><Copy kind="heading">Manage staffing</Copy>
    <ResourceState {...people} retry={() => void people.refresh()} />
    {assignments.map(a => <Card key={a.id}><Copy>{a.user.name} · {a.authority === "COORDINATOR" ? "Coordinator" : "Servant"}</Copy>
      {!ageGroupId && <Button secondary disabled={action.busy} label={a.authority === "COORDINATOR" ? "Make servant" : "Make coordinator"}
        onPress={() => confirmAction("Change authority?", `Update ${a.user.name}’s access to this class?`, () => void assign(a.userId, a.authority === "COORDINATOR" ? "SERVANT" : "COORDINATOR"))} />}
      <Button secondary disabled={action.busy} label="Remove assignment" onPress={() => confirmAction("Remove assignment?", `End ${a.user.name}’s assignment. Previous history is kept.`, () => void action.run(async () => {
        await request(`${endpoint("servant-assignments")}?id=${encodeURIComponent(a.id)}`, "DELETE"); await refresh();
      }), true)} /></Card>)}
    <Choice label="Person" value={userId} onChange={setUserId} disabled={action.busy} options={[{ value: "", label: "Choose a person" }, ...(people.data ?? []).map(p => ({ value: p.id, label: `${p.name}${p.email ? ` · ${p.email}` : ""}` }))]} />
    {!ageGroupId && <Choice label="Authority" value={authority} onChange={setAuthority} disabled={action.busy} options={[{ value: "SERVANT", label: "Servant" }, { value: "COORDINATOR", label: "Coordinator" }]} />}
    <Button label="Add assignment" disabled={!userId || action.busy} onPress={() => confirmAction("Grant ministry access?", "This person will gain access to records in this scope, according to the selected authority.", () => void assign(userId, authority))} />
  </Card>;
}
