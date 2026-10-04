import { useState } from "react";
import type { SundaySchoolLevel, SundaySchoolDashboard } from "@stmark/contracts";
import { getLevelDisplayName } from "@stmark/domain";
import { Button, Card, Copy, CopyableValue } from "@/components/ui";
import { Choice, Field, Page, confirmAction, useAction } from "@/components/forms";
import { endpoint, request, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import { ministryAccess } from "@/data/ministry";
import { MinistryTintProvider } from "@/theme";

interface Registration { id: string; firstName: string; lastName: string; intendedLevel: SundaySchoolLevel; birthDate: string; guardianName: string; guardianPhone: string; guardianEmail: string | null; notes: string | null; status: string; submittedBy: { name: string; email: string }; placedClass: { name: string } | null; reviewNote?: string | null; }
export default function Registrations() {
  const [status, setStatus] = useState("PENDING");
  const resource = useResource<Registration[]>(`${endpoint("child-registrations")}?status=${status}`);
  const dashboard = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  return <MinistryTintProvider ministry="sundaySchool"><Page title="Child registrations" {...resource}>
    <Choice label="Status" value={status} onChange={setStatus} options={["PENDING", "APPROVED", "REJECTED"].map(value => ({ value, label: value }))} />
    {resource.data && !resource.data.length && <Copy>No registrations in this view.</Copy>}
    {resource.data?.map(r => <RegistrationCard key={r.id} registration={r} canReview={ministryAccess(dashboard.data).createLevels.includes(r.intendedLevel)} refresh={resource.refresh} />)}
  </Page></MinistryTintProvider>;
}
function RegistrationCard({ registration: r, canReview, refresh }: { registration: Registration; canReview: boolean; refresh: () => Promise<void> }) {
  const { classes, refresh: refreshPortal } = usePortal();
  const [classId, setClassId] = useState("");
  const [note, setNote] = useState("");
  const action = useAction();
  const review = (decision: string) => confirmAction(`${decision === "approve" ? "Approve" : "Reject"} registration?`, decision === "approve" ? "This creates the child’s enrollment, places them into the selected class, and links their parent account." : "This rejects the registration request and notifies the submitter.", () => void action.run(async () => {
    await request(`${endpoint("child-registrations", r.id)}/review`, "POST", { action: decision, note, classId: decision === "approve" ? classId : undefined }); await Promise.all([refresh(), refreshPortal()]);
  }, "Registration reviewed"));
  return <Card><Copy kind="heading">{r.firstName} {r.lastName}</Copy><Copy>{getLevelDisplayName(r.intendedLevel)} · Born {r.birthDate.slice(0, 10)}</Copy>
    <Copy>{r.guardianName}</Copy><CopyableValue label="Guardian phone" value={r.guardianPhone} />{r.guardianEmail && <CopyableValue label="Guardian email" value={r.guardianEmail} />}<Copy kind="caption">Submitted by {r.submittedBy.name} · {r.submittedBy.email}</Copy>{r.notes && <Copy>{r.notes}</Copy>}
    {r.placedClass && <Copy>Placed in {r.placedClass.name}</Copy>}
    {r.status === "PENDING" && canReview && <><Choice label="Place into class" value={classId} onChange={setClassId} disabled={action.busy} options={[{ value: "", label: "Choose a class" }, ...classes.filter(c => c.canCoordinate && c.level === r.intendedLevel).map(c => ({ value: c.id, label: c.name }))]} />
      <Field label="Review note" value={note} onChange={setNote} multiline disabled={action.busy} /><Button label="Approve & enroll" disabled={!classId || action.busy} onPress={() => review("approve")} /><Button secondary label="Reject request" disabled={action.busy} onPress={() => review("reject")} /></>}
  </Card>;
}
