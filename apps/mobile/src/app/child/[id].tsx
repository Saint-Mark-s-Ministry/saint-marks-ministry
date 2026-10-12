import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { SundaySchoolChild, SundaySchoolChildGender, SundaySchoolFamily } from "@stmark/contracts";
import { LEVEL_ORDER, getLevelDisplayName } from "@stmark/domain";
import {
  Button,
  Card,
  CircleIconButton,
  Copy,
  CopyableValue,
  Icon,
  InitialsAvatar,
  ListSurface,
  readableDate,
  SectionTitle,
  Screen,
  StatusPill,
  styles,
} from "@/components/ui";
import { Choice, Field, ResourceState, confirmAction, useAction } from "@/components/forms";
import { endpoint, request, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";
import { useAuth } from "@/data/auth-provider";
import { validDate } from "@/data/ministry";
import {
  attendancePercentage,
  canEditChild,
  fullBirthDate,
  genderLabel,
  hasFamilyContact,
  primaryContact,
  truncatedName,
} from "@/data/sunday-school-roster";
import { MinistryTintProvider, useAppTheme } from "@/theme";

type AttendanceRecord = { id: string; status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED"; notes: string | null; session: { date: string; topic: string | null } };
type ChildDetail = SundaySchoolChild & { attendance: AttendanceRecord[] };

const STATUS_TONE: Record<AttendanceRecord["status"], "success" | "warning" | "danger" | "muted"> = {
  PRESENT: "success",
  LATE: "warning",
  ABSENT: "danger",
  EXCUSED: "muted",
};

export default function Child() {
  const { id, classId } = useLocalSearchParams<{ id: string; classId?: string }>();
  const { colors } = useAppTheme();
  const resource = useResource<ChildDetail>(id === "new" ? null : endpoint("children", id));
  const { classes, refresh } = usePortal();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const action = useAction();
  const child = resource.data;
  const isNew = id === "new";
  const isAdmin = user?.role === "SUPER_ADMIN";
  const canEdit = isNew || (child ? canEditChild(child, classes, isAdmin) : false);
  const done = async () => {
    setEditing(false);
    await Promise.all([resource.refresh(), refresh()]);
  };

  const family = child?.family
    ? {
        motherName: child.family.motherName,
        motherPhone: child.family.motherPhone,
        fatherName: child.family.fatherName,
        fatherPhone: child.family.fatherPhone,
        homeAddress: child.family.homeAddress,
      }
    : null;
  const contact = child ? primaryContact(family, child) : null;
  const attendancePct = child ? attendancePercentage(child.attendance) : null;

  return (
    <MinistryTintProvider ministry="sundaySchool">
      <Stack.Screen
        options={{
          title: "",
          // This screen draws its own centered avatar/name header; the native
          // large title would otherwise reserve a second, empty title band above it.
          headerLargeTitle: false,
          headerRight: () =>
            !isNew && child && canEdit && !editing ? (
              // A shared Button goes zero-width as a header-right row sibling;
              // every other screen's nav-bar text button uses a plain Pressable instead.
              <Pressable accessibilityRole="button" accessibilityLabel="Edit" hitSlop={8} onPress={() => setEditing(true)}>
                <Copy color={colors.primary} style={{ fontWeight: "600", fontSize: 17 }}>Edit</Copy>
              </Pressable>
            ) : undefined,
        }}
      />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        {!isNew && <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />}

        {(isNew || (child && editing && canEdit)) && (
          <ChildForm key={id} child={child} initialClassId={classId} done={done} />
        )}

        {child && !editing && (
          <>
            {!child.isActive && (
              <View style={{ padding: 14, borderRadius: 18, backgroundColor: colors.hover, gap: 2 }}>
                <Copy style={{ fontWeight: "600" }}>This child's enrollment has been withdrawn</Copy>
                <Copy kind="caption">The record is kept for history and is read-only.</Copy>
              </View>
            )}

            <View style={{ alignItems: "center", gap: 8, paddingTop: 4 }}>
              <InitialsAvatar name={`${child.firstName} ${child.lastName}`} size={76} variant="accent" />
              <Copy style={{ fontFamily: "Newsreader_500Medium", fontSize: 28, lineHeight: 32, fontWeight: "500" }}>
                {truncatedName(child.firstName, child.lastName)}
              </Copy>
              <Copy kind="caption">
                {[child.class?.name ?? "Unassigned", child.birthDate ? `born ${fullBirthDate(child.birthDate)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Copy>
              <View style={[styles.row, { gap: 6, flexWrap: "wrap", justifyContent: "center" }]}>
                {genderLabel(child.gender) && (
                  <View style={[styles.pill, { backgroundColor: colors.hover }]}>
                    <Copy kind="caption">{genderLabel(child.gender)}</Copy>
                  </View>
                )}
                {attendancePct !== null && (
                  <StatusPill
                    label={`${Math.round(attendancePct)}% attendance`}
                    color={attendancePct >= 75 ? colors.success : attendancePct >= 50 ? colors.warning : colors.danger}
                    soft={attendancePct >= 75 ? colors.successSoft : attendancePct >= 50 ? colors.warningSoft : colors.dangerSoft}
                  />
                )}
              </View>
              <View style={[styles.row, { gap: 12, marginTop: 6 }]}>
                {contact && (
                  <CircleIconButton ios="phone.fill" android="call" label={`Call ${contact.label}`} onPress={() => void Linking.openURL(`tel:${contact.phone}`)} />
                )}
                {contact && (
                  <CircleIconButton ios="message.fill" android="sms" label={`Message ${contact.label}`} onPress={() => void Linking.openURL(`sms:${contact.phone}`)} />
                )}
                <CircleIconButton
                  ios="house.fill"
                  android="home"
                  label="Log visitation"
                  onPress={() => router.push({ pathname: "/visitation/[childId]", params: { childId: id, classId: child.classId ?? "" } })}
                />
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <SectionTitle title={hasFamilyContact(family) ? "Family and household" : "Guardian contact"} />
              <ListSurface>
                {hasFamilyContact(family) ? (
                  <>
                    <CopyableValue label="Mother" value={family!.motherName || family!.motherPhone ? `${family!.motherName ?? "[Name]"}${family!.motherPhone ? ` · ${family!.motherPhone}` : ""}` : "Not on file"} />
                    <Divider />
                    <CopyableValue label="Father" value={family!.fatherName || family!.fatherPhone ? `${family!.fatherName ?? "[Name]"}${family!.fatherPhone ? ` · ${family!.fatherPhone}` : ""}` : "Not on file"} />
                    <Divider />
                    <CopyableValue label="Home address" value={family!.homeAddress || "No address added yet."} />
                  </>
                ) : child.guardianName || child.guardianPhone || child.guardianEmail ? (
                  <>
                    <CopyableValue label="Guardian" value={child.guardianName ?? "[Name]"} />
                    {child.guardianPhone && (<><Divider /><CopyableValue label="Phone" value={child.guardianPhone} /></>)}
                    {child.guardianEmail && (<><Divider /><CopyableValue label="Email" value={child.guardianEmail} /></>)}
                  </>
                ) : (
                  <View style={{ padding: 14 }}>
                    <Copy kind="caption">No family or guardian contact on file.</Copy>
                  </View>
                )}
              </ListSurface>
              <Copy kind="caption" style={{ paddingHorizontal: 8 }}>
                Family contact is only visible to the servants of this class and to leaders.
              </Copy>
            </View>

            <View style={{ gap: 10 }}>
              <SectionTitle title="Notes" />
              <ListSurface>
                <View style={{ padding: 14 }}>
                  <Copy kind={child.notes ? "body" : "caption"}>{child.notes || "No note"}</Copy>
                </View>
              </ListSurface>
            </View>

            {child.user && (
              <View style={[styles.row, { gap: 8, paddingHorizontal: 4 }]}>
                <Icon ios="person.crop.circle.badge.checkmark" android="verified_user" size={16} color={colors.muted} />
                <Copy kind="caption">Linked account · {child.user.email}</Copy>
              </View>
            )}

            <View style={{ gap: 10 }}>
              <SectionTitle title="Recent attendance" />
              <ListSurface>
                {!child.attendance.length && (
                  <View style={{ padding: 14 }}>
                    <Copy kind="caption">No attendance recorded.</Copy>
                  </View>
                )}
                {child.attendance.slice(0, 6).map((a, index, arr) => (
                  <View
                    key={a.id}
                    style={[
                      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
                      index < arr.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={{ gap: 1 }}>
                      <Copy>{readableDate(a.session.date)}</Copy>
                      {a.session.topic && <Copy kind="caption">{a.session.topic}</Copy>}
                    </View>
                    <AttendanceTone status={a.status} />
                  </View>
                ))}
              </ListSurface>
            </View>

            {canEdit && child.isActive && (
              <Button
                secondary
                disabled={action.busy}
                label="Archive child"
                onPress={() =>
                  confirmAction(
                    "Archive child?",
                    "This removes the child from the active roster and ends their current enrollment. Attendance history is preserved.",
                    () =>
                      void action.run(async () => {
                        await request(endpoint("children", id), "DELETE");
                        await done();
                      }),
                    true,
                  )
                }
              />
            )}
          </>
        )}
        {editing && <Button label="Cancel editing" secondary onPress={() => setEditing(false)} />}
      </Screen>
    </MinistryTintProvider>
  );
}

function Divider() {
  const { colors } = useAppTheme();
  return <View style={{ height: 0.5, marginLeft: 16, backgroundColor: colors.border }} />;
}

function AttendanceTone({ status }: { status: AttendanceRecord["status"] }) {
  const { colors } = useAppTheme();
  const tone = STATUS_TONE[status];
  const color = tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.muted;
  const soft = tone === "success" ? colors.successSoft : tone === "warning" ? colors.warningSoft : tone === "danger" ? colors.dangerSoft : colors.hover;
  return <StatusPill label={status[0] + status.slice(1).toLowerCase()} color={color} soft={soft} />;
}

function ChildForm({ child, initialClassId, done }: { child?: SundaySchoolChild; initialClassId?: string; done: () => Promise<void> }) {
  const { classes } = usePortal();
  const { user } = useAuth();
  const families = useResource<SundaySchoolFamily[]>(endpoint("families"));
  const [form, setForm] = useState(() => ({
    firstName: child?.firstName ?? "",
    lastName: child?.lastName ?? "",
    gender: child?.gender ?? ("" as SundaySchoolChildGender | ""),
    level: child?.level ?? classes.find((c) => c.id === initialClassId)?.level ?? "GRADE_1",
    classId: child?.classId ?? initialClassId ?? "",
    birthDate: child?.birthDate?.slice(0, 10) ?? "",
    guardianName: child?.guardianName ?? "",
    guardianPhone: child?.guardianPhone ?? "",
    guardianEmail: child?.guardianEmail ?? "",
    notes: child?.notes ?? "",
    linkedUserEmail: child?.user?.email ?? "",
  }));
  const [familyId, setFamilyId] = useState(child?.familyId ?? "");
  const [family, setFamily] = useState({
    name: child?.family?.name ?? "",
    homeAddress: child?.family?.homeAddress ?? "",
    motherName: child?.family?.motherName ?? "",
    motherPhone: child?.family?.motherPhone ?? "",
    motherEmail: child?.family?.motherEmail ?? "",
    fatherName: child?.family?.fatherName ?? "",
    fatherPhone: child?.family?.fatherPhone ?? "",
    fatherEmail: child?.family?.fatherEmail ?? "",
  });
  const action = useAction();
  const allowedClasses = classes.filter((c) => c.canServe && c.level === form.level);
  const canLink = user?.role === "SUPER_ADMIN" || !!classes.find((c) => c.id === child?.classId)?.canCoordinate;
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const save = () =>
    action.run(async () => {
      if (form.birthDate && !validDate(form.birthDate)) throw new Error("Use YYYY-MM-DD for the birth date.");
      const { linkedUserEmail, ...fields } = form;
      const result = await request<SundaySchoolChild>(endpoint("children", child?.id), child ? "PATCH" : "POST", {
        ...fields,
        birthDate: form.birthDate || null,
        classId: form.classId || null,
        familyId: familyId && familyId !== "new" ? familyId : null,
        // Linking an existing household never overwrites that household's details.
        ...(familyId === "new" || (child?.familyId && familyId === child.familyId) ? { family } : {}),
        ...(child && canLink ? { linkedUserEmail } : {}),
      });
      await done();
      if (!child) router.replace({ pathname: "/child/[id]", params: { id: result.id } });
    }, "Child saved");
  return (
    <>
      <Card style={{ gap: 12 }}>
        {(["firstName", "lastName"] as const).map((key) => (
          <Field key={key} label={key === "firstName" ? "First name" : "Last name"} value={form[key]} onChange={(v) => set(key, v)} disabled={action.busy} />
        ))}
        <Choice label="Gender" value={form.gender} disabled={action.busy} onChange={(v) => set("gender", v)} options={[{ value: "", label: "Not specified" }, { value: "MALE", label: "Boy" }, { value: "FEMALE", label: "Girl" }]} />
        <Choice label="Grade" value={form.level} disabled={!!child || action.busy} onChange={(v) => setForm((f) => ({ ...f, level: v as typeof f.level, classId: "" }))} options={LEVEL_ORDER.map((value) => ({ value, label: getLevelDisplayName(value) }))} />
        <Choice label="Class" value={form.classId} disabled={action.busy} onChange={(v) => set("classId", v)} options={[{ value: "", label: "Unassigned (admin only)" }, ...allowedClasses.map((c) => ({ value: c.id, label: c.name }))]} />
        <Field label="Birth date (YYYY-MM-DD)" value={form.birthDate} onChange={(v) => set("birthDate", v)} disabled={action.busy} />
        {(["guardianName", "guardianPhone", "guardianEmail"] as const).map((key) => (
          <Field
            key={key}
            label={key === "guardianName" ? "Guardian name" : key === "guardianPhone" ? "Guardian phone" : "Guardian email"}
            value={form[key]}
            onChange={(v) => set(key, v)}
            disabled={action.busy}
          />
        ))}
        <Field label="Notes" multiline value={form.notes} onChange={(v) => set("notes", v)} disabled={action.busy} />
        {child && canLink && (
          <Field label="Linked student account email (blank to unlink)" keyboardType="email-address" value={form.linkedUserEmail} onChange={(v) => set("linkedUserEmail", v)} disabled={action.busy} />
        )}
      </Card>
      <Card style={{ gap: 12 }}>
        <Copy kind="heading">Household</Copy>
        <Choice
          label="Link family / siblings"
          value={familyId}
          disabled={action.busy || families.loading || !!families.error}
          onChange={setFamilyId}
          options={[
            { value: "", label: "No household link" },
            { value: "new", label: "Create a new household" },
            ...(families.data ?? []).map((f) => ({ value: f.id, label: f.name || f.children.map((c) => `${c.firstName} ${c.lastName}`).join(", ") })),
          ]}
        />
        {(familyId === "new" || (child?.familyId && familyId === child.familyId)) && (
          <>
            <Copy kind="caption">Changes to this household apply to all linked siblings.</Copy>
            {(["name", "homeAddress", "motherName", "motherPhone", "motherEmail", "fatherName", "fatherPhone", "fatherEmail"] as const).map((key) => (
              <Field
                key={key}
                label={
                  key === "name" ? "Family name" : key === "homeAddress" ? "Home address"
                    : key === "motherName" ? "Mother's name" : key === "motherPhone" ? "Mother's phone" : key === "motherEmail" ? "Mother's email"
                    : key === "fatherName" ? "Father's name" : key === "fatherPhone" ? "Father's phone" : "Father's email"
                }
                value={family[key]}
                disabled={action.busy}
                onChange={(v) => setFamily((f) => ({ ...f, [key]: v }))}
              />
            ))}
          </>
        )}
      </Card>
      <Button
        label={action.busy ? "Saving…" : "Save child"}
        disabled={action.busy || !form.firstName.trim() || !form.lastName.trim() || (!form.classId && user?.role !== "SUPER_ADMIN")}
        onPress={() => void save()}
      />
    </>
  );
}
