import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import type { SundaySchoolChild, SundaySchoolDashboard } from "@stmark/contracts";
import { getLevelDisplayName } from "@stmark/domain";
import { Button, Card, Copy, RowLink } from "@/components/ui";
import { Choice, Field, Page } from "@/components/forms";
import { endpoint, query, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import { ministryAccess } from "@/data/ministry";
import { MinistryTintProvider } from "@/theme";

export default function Roster() {
  const params = useLocalSearchParams<{ classId?: string }>();
  const [classId, setClassId] = useState(params.classId ?? "");
  const [active, setActive] = useState("true");
  const [search, setSearch] = useState("");
  const { classes } = usePortal();
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const resource = useResource<SundaySchoolChild[]>(`${endpoint("children")}?${query({ classId, isActive: active })}`);
  const filtered = resource.data?.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <MinistryTintProvider ministry="sundaySchool"><Page title="Children & families" {...resource}>
    <Field label="Search children" value={search} onChange={setSearch} />
    <Choice label="Class" value={classId} onChange={setClassId} options={[{ value: "", label: "All accessible classes" }, ...classes.map(c => ({ value: c.id, label: c.name }))]} />
    <Choice label="Roster" value={active} onChange={setActive} options={[{ value: "true", label: "Active children" }, { value: "false", label: "Inactive children" }, { value: "", label: "All children" }]} />
    {ministryAccess(dashboard.data, classes).canAddChild && <Button label="Add child" onPress={() => router.push({ pathname: "/child/[id]", params: { id: "new", classId } })} />}
    {resource.data && !filtered.length && <Copy>No children match this selection.</Copy>}
    {filtered.map(c => <Card key={c.id}><RowLink title={`${c.firstName} ${c.lastName}`} subtitle={`${c.class?.name ?? "Unassigned"} · ${getLevelDisplayName(c.level)}${c.isActive ? "" : " · Inactive"}`} onPress={() => router.push({ pathname: "/child/[id]", params: { id: c.id } })} /></Card>)}
  </Page></MinistryTintProvider>;
}
