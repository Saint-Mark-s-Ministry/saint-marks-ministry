import { useState } from "react";
import { View } from "react-native";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Card, Copy, ListSurface, styles } from "@/components/ui";
import { Page } from "@/components/forms";
import { useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";
import {
  formatConfessionPeriod,
  getConfessionPeriods,
  getConfessionPeriodStatus,
  getStudentStart,
  type ConfessionPeriodStatus,
} from "@/data/confession";

type AcademicYear = { id: string; name: string; startDate: string; endDate: string; isActive: boolean };
type Enrollment = {
  studentId: string;
  isActive: boolean;
  enrolledAt: string;
  attendanceStartDate?: string | null;
  academicYearId: string;
  student: { id: string; name: string };
  fatherOfConfession?: { id: string; name: string } | null;
};
type Slip = { id: string; studentId: string; periodStart: string };

const STATUS_LABEL: Record<ConfessionPeriodStatus, string> = {
  na: "—",
  registration: "Registration",
  slip: "Received",
  missing: "Missed",
  due: "Due",
  upcoming: "Upcoming",
};

export default function PrepConfession() {
  const { colors } = useAppTheme();
  const [filter, setFilter] = useState<"all" | "due" | "missing" | "slip">("all");
  const years = useResource<AcademicYear[]>("/api/academic-years");
  const enrollments = useResource<Enrollment[]>("/api/enrollments?status=ACTIVE&isActive=true");
  const slips = useResource<Slip[]>("/api/slips?type=CONFESSION");

  const activeYear = years.data?.find((y) => y.isActive);
  const periods = activeYear ? getConfessionPeriods(activeYear) : [];
  const now = new Date();
  const currentPeriod = periods.find((p) => p.start <= now && now < p.end) ?? periods[periods.length - 1];

  const rows = (enrollments.data ?? [])
    .map((e) => {
      const yearStart = activeYear?.startDate;
      const start = getStudentStart({
        attendanceStartDate: e.attendanceStartDate,
        academicYearStart: yearStart,
        enrolledAt: e.enrolledAt,
      });
      const hasSlip = currentPeriod
        ? (slips.data ?? []).some(
            (s) => s.studentId === e.studentId && new Date(s.periodStart).getTime() === currentPeriod.start.getTime(),
          )
        : false;
      const status = currentPeriod ? getConfessionPeriodStatus(currentPeriod, start, hasSlip) : "na";
      return { enrollment: e, status };
    });

  const filtered = rows.filter((r) => (filter === "all" ? true : r.status === filter));
  const grouped = new Map<string, typeof filtered>();
  for (const row of filtered) {
    const key = row.enrollment.fatherOfConfession?.name ?? "No father of confession assigned";
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const dueCount = rows.filter((r) => r.status === "due").length;
  const missingCount = rows.filter((r) => r.status === "missing").length;
  const slipCount = rows.filter((r) => r.status === "slip").length;

  return (
    <Page
      title="Confession"
      loading={years.loading || enrollments.loading || slips.loading}
      error={years.error || enrollments.error || slips.error}
      refresh={() => {
        void years.refresh();
        void enrollments.refresh();
        void slips.refresh();
      }}
    >
      <Copy kind="caption">Father of confession sign-offs</Copy>
      {currentPeriod && activeYear && (
        <Card>
          <Copy kind="title">{formatConfessionPeriod(currentPeriod)}</Copy>
          <Copy kind="caption">
            {slipCount} of {rows.length} slips received this period
          </Copy>
        </Card>
      )}
      <SegmentedControl
        values={["All", "Due", "Missed", "Received"]}
        selectedIndex={["all", "due", "missing", "slip"].indexOf(filter)}
        onChange={({ nativeEvent }) =>
          setFilter((["all", "due", "missing", "slip"] as const)[nativeEvent.selectedSegmentIndex] ?? "all")
        }
        style={{ width: "100%", minHeight: 36 }}
      />
      {!currentPeriod && activeYear && <Copy kind="caption">No confession period for today's date.</Copy>}
      {[...grouped.entries()].map(([father, group]) => (
        <View key={father} style={{ gap: 10 }}>
          <Copy kind="heading">{father}</Copy>
          <ListSurface>
            {group.map((row, index) => (
              <View
                key={row.enrollment.studentId}
                style={[
                  styles.compactRow,
                  index < group.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                ]}
              >
                <Copy style={{ flex: 1, fontWeight: "600" }}>{row.enrollment.student.name}</Copy>
                <View
                  style={[
                    styles.pill,
                    {
                      backgroundColor:
                        row.status === "slip"
                          ? colors.successSoft
                          : row.status === "missing"
                            ? colors.dangerSoft
                            : row.status === "due"
                              ? colors.warningSoft
                              : colors.hover,
                    },
                  ]}
                >
                  <Copy
                    kind="caption"
                    color={
                      row.status === "slip"
                        ? colors.success
                        : row.status === "missing"
                          ? colors.danger
                          : row.status === "due"
                            ? colors.warning
                            : undefined
                    }
                  >
                    {STATUS_LABEL[row.status]}
                  </Copy>
                </View>
              </View>
            ))}
          </ListSurface>
        </View>
      ))}
      {!!rows.length && !filtered.length && <Copy kind="caption">No students match this filter.</Copy>}
      {missingCount > 0 && (
        <Copy kind="caption">
          Uploading confession slips isn't available on mobile yet — use the web admin dashboard.
        </Copy>
      )}
    </Page>
  );
}
