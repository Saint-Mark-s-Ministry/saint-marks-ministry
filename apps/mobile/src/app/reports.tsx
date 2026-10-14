import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { SundaySchoolDashboard } from "@stmark/contracts";
import { Card, Copy, RowLink, readableDate } from "@/components/ui";
import { Choice, Page } from "@/components/forms";
import { endpoint, query, useResource } from "@/data/resources";
import { MinistryTintProvider, useAppTheme } from "@/theme";

export default function Reports() {
  const [audience, setAudience] = useState("children");
  const [academicYearId, setYear] = useState("");
  const [classId, setClassId] = useState("");
  const base = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const resource = useResource<SundaySchoolDashboard>(`${endpoint("dashboard")}?${query({ audience, academicYearId, classId })}`);
  const dashboard = resource.data;
  const options = base.data?.attendanceTrend;
  const { colors } = useAppTheme();
  return <MinistryTintProvider ministry="sundaySchool"><Page title="Attendance reports" {...resource}>
    <Choice label="Audience" value={audience} onChange={value => { setAudience(value); setClassId(""); }} options={[{ value: "children", label: "Children" }, ...(options?.canViewServantAttendance ? [{ value: "servants", label: "Servants" }] : [])]} />
    <Choice label="Academic year" value={academicYearId} onChange={setYear} options={[{ value: "", label: "Current year" }, ...(options?.academicYears ?? []).map(y => ({ value: y.id, label: y.name }))]} />
    {options?.canSelectClass && <Choice label="Class" value={classId} onChange={setClassId} options={[{ value: "", label: "All accessible classes" }, ...(options.classes ?? []).map(c => ({ value: c.id, label: c.name }))]} />}
    {dashboard && <><Card><Copy kind="heading">Ministry overview</Copy><Copy>{dashboard.totals.classes} classes · {dashboard.totals.children} children</Copy><Copy>{dashboard.totals.classesNeedingAttendance} classes awaiting child attendance</Copy></Card>
      <Card><Copy kind="heading">Weekly attendance</Copy><Copy kind="caption">Unrecorded meetings are gaps, not zero attendance.</Copy>
        {!dashboard.attendanceTrend.points.length && <Copy>No meeting dates in this range.</Copy>}
        {dashboard.attendanceTrend.points.map(p => <View key={p.date} style={{ gap: 6 }} accessible accessibilityLabel={`${readableDate(p.date)}: ${p.attendedCount === null ? "Not recorded" : `${p.attendedCount} attended of ${p.rosterCount}`}`}>
          <Copy kind="caption">{readableDate(p.date)} · {p.attendedCount === null ? "Not recorded" : `${p.attendedCount} / ${p.rosterCount} attended`}</Copy>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border }}>{p.rosterCount !== null && p.attendedCount !== null && <View style={{ height: 8, borderRadius: 4, width: `${p.rosterCount ? Math.min(100, p.attendedCount / p.rosterCount * 100) : 0}%`, backgroundColor: colors.action }} />}</View>
        </View>)}
      </Card>
      {dashboard.classes.map(c => <Card key={c.id}><RowLink title={c.name} subtitle={`${c.ageGroup?.name ?? "No age group"} · ${c.childCount} children · ${c.sessionCount} sessions · ${Math.round(c.attendancePercentage)}% attendance`} onPress={() => router.push({ pathname: "/class/[id]", params: { id: c.id } })} /></Card>)}
    </>}
  </Page></MinistryTintProvider>;
}
