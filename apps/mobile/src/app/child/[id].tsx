import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import type { SundaySchoolChild, SundaySchoolChildGender, SundaySchoolFamily } from "@stmark/contracts";
import { LEVEL_ORDER, getLevelDisplayName } from "@stmark/domain";
import { Button, Card, Copy, CopyableValue, readableDate } from "@/components/ui";
import { Choice, Field, Page, confirmAction, useAction } from "@/components/forms";
import { endpoint, request, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import { useAuth } from "@/data/auth-provider";
import { validDate } from "@/data/ministry";

type ChildDetail = SundaySchoolChild & { attendance: { id: string; status: string; notes: string | null; session: { date: string; topic: string | null } }[] };
export default function Child() {
  const { id, classId } = useLocalSearchParams<{ id: string; classId?: string }>();
  const resource = useResource<ChildDetail>(id === "new" ? null : endpoint("children", id));
  const { classes, refresh } = usePortal();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const action = useAction();
  const child = resource.data;
  const canEdit = user?.role === "SUPER_ADMIN" || !!classes.find(c => c.id === child?.classId)?.canServe;
  const done = async () => { setEditing(false); await Promise.all([resource.refresh(), refresh()]); };
  return <Page title={id === "new" ? "Add child" : child ? `${child.firstName} ${child.lastName}` : "Child profile"} {...resource}>
    {(id === "new" || (child && editing && canEdit)) ? <ChildForm key={id} child={child} initialClassId={classId} done={done} /> : child && <>
      <Card><Copy kind="title">{child.firstName} {child.lastName}</Copy><Copy>{child.class?.name ?? "Unassigned"} · {getLevelDisplayName(child.level)}{child.gender ? ` · ${child.gender === "MALE" ? "Boy" : "Girl"}` : ""}</Copy>
        <Copy>{child.isActive ? "Active" : "Inactive"}</Copy>{child.birthDate && <Copy>Born {child.birthDate.slice(0, 10)}</Copy>}
        {child.notes && <Copy>{child.notes}</Copy>}{child.user && <Copy>Linked account: {child.user.email}</Copy>}</Card>
      <Card><Copy kind="heading">Family & guardian</Copy>
        {child.guardianName && <Copy>{child.guardianName}</Copy>}
        {child.guardianPhone && <CopyableValue label="Guardian phone" value={child.guardianPhone} />}
        {child.guardianEmail && <CopyableValue label="Guardian email" value={child.guardianEmail} />}
        {child.family ? <><Copy>{child.family.name ?? "Family"}</Copy>
          {child.family.homeAddress && <CopyableValue label="Home address" value={child.family.homeAddress} />}
          {child.family.motherName && <Copy>{child.family.motherName}</Copy>}
          {child.family.motherPhone && <CopyableValue label="Mother’s phone" value={child.family.motherPhone} />}
          {child.family.motherEmail && <CopyableValue label="Mother’s email" value={child.family.motherEmail} />}
          {child.family.fatherName && <Copy>{child.family.fatherName}</Copy>}
          {child.family.fatherPhone && <CopyableValue label="Father’s phone" value={child.family.fatherPhone} />}
          {child.family.fatherEmail && <CopyableValue label="Father’s email" value={child.family.fatherEmail} />}
          <Copy kind="caption">Siblings</Copy>{child.family.children.filter(c => c.id !== id).map(c => <Copy key={c.id}>{c.firstName} {c.lastName} · {c.class?.name ?? "Unassigned"}</Copy>)}</> : <Copy kind="caption">No linked household.</Copy>}
      </Card>
      {canEdit && <Button label="Edit child & family" onPress={() => setEditing(true)} />}
      <Button secondary label="Visitation history" onPress={() => router.push({ pathname: "/visitations", params: { childId: id, classId: child.classId ?? "" } })} />
      <Card><Copy kind="heading">Attendance history</Copy>{!child.attendance.length && <Copy>No attendance recorded.</Copy>}
        {child.attendance.map(a => <Copy key={a.id}>{readableDate(a.session.date)} · {a.status}{a.notes ? ` — ${a.notes}` : ""}</Copy>)}</Card>
      {canEdit && child.isActive && <Button secondary disabled={action.busy} label="Archive child" onPress={() => confirmAction("Archive child?", "This removes the child from the active roster and ends their current enrollment. Attendance history is preserved.", () => void action.run(async () => { await request(endpoint("children", id), "DELETE"); await done(); }), true)} />}
    </>}
    {editing && <Button label="Cancel editing" secondary onPress={() => setEditing(false)} />}
  </Page>;
}
function ChildForm({ child, initialClassId, done }: { child?: SundaySchoolChild; initialClassId?: string; done: () => Promise<void> }) {
  const { classes } = usePortal();
  const { user } = useAuth();
  const families = useResource<SundaySchoolFamily[]>(endpoint("families"));
  const [form, setForm] = useState(() => ({ firstName: child?.firstName ?? "", lastName: child?.lastName ?? "", gender: child?.gender ?? "" as SundaySchoolChildGender | "", level: child?.level ?? classes.find(c => c.id === initialClassId)?.level ?? "GRADE_1", classId: child?.classId ?? initialClassId ?? "", birthDate: child?.birthDate?.slice(0, 10) ?? "", guardianName: child?.guardianName ?? "", guardianPhone: child?.guardianPhone ?? "", guardianEmail: child?.guardianEmail ?? "", notes: child?.notes ?? "", linkedUserEmail: child?.user?.email ?? "" }));
  const [familyId, setFamilyId] = useState(child?.familyId ?? "");
  const [family, setFamily] = useState({ name: child?.family?.name ?? "", homeAddress: child?.family?.homeAddress ?? "", motherName: child?.family?.motherName ?? "", motherPhone: child?.family?.motherPhone ?? "", motherEmail: child?.family?.motherEmail ?? "", fatherName: child?.family?.fatherName ?? "", fatherPhone: child?.family?.fatherPhone ?? "", fatherEmail: child?.family?.fatherEmail ?? "" });
  const action = useAction();
  const allowedClasses = classes.filter(c => c.canServe && c.level === form.level);
  const canLink = user?.role === "SUPER_ADMIN" || !!classes.find(c => c.id === child?.classId)?.canCoordinate;
  const set = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));
  const save = () => action.run(async () => {
    if (form.birthDate && !validDate(form.birthDate)) throw new Error("Use YYYY-MM-DD for the birth date.");
    const { linkedUserEmail, ...fields } = form;
    const result = await request<SundaySchoolChild>(endpoint("children", child?.id), child ? "PATCH" : "POST", {
      ...fields, birthDate: form.birthDate || null, classId: form.classId || null,
      familyId: familyId && familyId !== "new" ? familyId : null,
      // Linking an existing household never overwrites that household's details.
      ...(familyId === "new" || (child?.familyId && familyId === child.familyId) ? { family } : {}),
      ...(child && canLink ? { linkedUserEmail } : {}),
    });
    await done(); if (!child) router.replace({ pathname: "/child/[id]", params: { id: result.id } });
  }, "Child saved");
  return <><Card>
    {([['firstName', 'First name'], ['lastName', 'Last name']] as const).map(([key, label]) => <Field key={key} label={label} value={form[key]} onChange={v => set(key, v)} disabled={action.busy} />)}
    <Choice label="Gender" value={form.gender} disabled={action.busy} onChange={v => set("gender", v)} options={[{ value: "", label: "Not specified" }, { value: "MALE", label: "Boy" }, { value: "FEMALE", label: "Girl" }]} />
    <Choice label="Grade" value={form.level} disabled={!!child || action.busy} onChange={v => setForm(f => ({ ...f, level: v as typeof f.level, classId: "" }))} options={LEVEL_ORDER.map(value => ({ value, label: getLevelDisplayName(value) }))} />
    <Choice label="Class" value={form.classId} disabled={action.busy} onChange={v => set("classId", v)} options={[{ value: "", label: "Unassigned (admin only)" }, ...allowedClasses.map(c => ({ value: c.id, label: c.name }))]} />
    <Field label="Birth date (YYYY-MM-DD)" value={form.birthDate} onChange={v => set("birthDate", v)} disabled={action.busy} />
    {([['guardianName', 'Guardian name'], ['guardianPhone', 'Guardian phone'], ['guardianEmail', 'Guardian email']] as const).map(([key, label]) => <Field key={key} label={label} value={form[key]} onChange={v => set(key, v)} disabled={action.busy} />)}
    <Field label="Notes" multiline value={form.notes} onChange={v => set("notes", v)} disabled={action.busy} />
    {child && canLink && <Field label="Linked student account email (blank to unlink)" keyboardType="email-address" value={form.linkedUserEmail} onChange={v => set("linkedUserEmail", v)} disabled={action.busy} />}
  </Card><Card><Copy kind="heading">Household</Copy>
    <Choice label="Link family / siblings" value={familyId} disabled={action.busy || families.loading || !!families.error} onChange={setFamilyId} options={[{ value: "", label: "No household link" }, { value: "new", label: "Create a new household" }, ...(families.data ?? []).map(f => ({ value: f.id, label: f.name || f.children.map(c => `${c.firstName} ${c.lastName}`).join(", ") }))]} />
    {(familyId === "new" || (child?.familyId && familyId === child.familyId)) && <><Copy kind="caption">Changes to this household apply to all linked siblings.</Copy>
      {([['name', 'Family name'], ['homeAddress', 'Home address'], ['motherName', 'Mother’s name'], ['motherPhone', 'Mother’s phone'], ['motherEmail', 'Mother’s email'], ['fatherName', 'Father’s name'], ['fatherPhone', 'Father’s phone'], ['fatherEmail', 'Father’s email']] as const).map(([key, label]) => <Field key={key} label={label} value={family[key]} disabled={action.busy} onChange={v => setFamily(f => ({ ...f, [key]: v }))} />)}</>}
  </Card><Button label={action.busy ? "Saving…" : "Save child"} disabled={action.busy || !form.firstName.trim() || !form.lastName.trim() || (!form.classId && user?.role !== "SUPER_ADMIN")} onPress={() => void save()} /></>;
}
