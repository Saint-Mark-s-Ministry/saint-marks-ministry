import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { CompactRow, Copy, ListSurface, styles } from "@/components/ui";
import { Page } from "@/components/forms";
import { useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";

type Enrollment = {
  studentId: string;
  isActive: boolean;
  status: "ACTIVE" | "GRADUATED" | "WITHDRAWN";
  yearLevel: string;
  isAsyncStudent: boolean;
  student: { id: string; name: string };
  mentor: { id: string; name: string } | null;
};

const YEAR_LABELS: Record<string, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2" };

export default function PrepRoster() {
  const { colors } = useAppTheme();
  const [filter, setFilter] = useState<"active" | "async" | "all">("active");
  const resource = useResource<Enrollment[]>("/api/enrollments");
  const all = resource.data ?? [];
  const active = all.filter((e) => e.isActive);
  const async = active.filter((e) => e.isAsyncStudent);
  const rows = filter === "active" ? active : filter === "async" ? async : all;
  const withoutMentor = active.filter((e) => !e.mentor).length;

  const workload = new Map<string, { id: string; name: string; count: number }>();
  for (const e of active) {
    if (!e.mentor) continue;
    const entry = workload.get(e.mentor.id) ?? { id: e.mentor.id, name: e.mentor.name, count: 0 };
    entry.count += 1;
    workload.set(e.mentor.id, entry);
  }

  return (
    <Page title="Roster & async students" loading={resource.loading} error={resource.error} refresh={() => void resource.refresh()}>
      <Copy kind="caption">
        {all.length} enrolled · {withoutMentor} without a mentor
      </Copy>
      <SegmentedControl
        values={["Active", "Async", "All"]}
        selectedIndex={["active", "async", "all"].indexOf(filter)}
        onChange={({ nativeEvent }) =>
          setFilter((["active", "async", "all"] as const)[nativeEvent.selectedSegmentIndex] ?? "active")
        }
        style={{ width: "100%", minHeight: 36 }}
      />
      <ListSurface>
        {!rows.length && resource.data && (
          <View style={{ paddingVertical: 18 }}>
            <Copy kind="caption">No students in this view.</Copy>
          </View>
        )}
        {rows.map((e, index) => (
          <CompactRow
            key={e.studentId}
            divider={index < rows.length - 1}
            title={e.student.name}
            subtitle={`${YEAR_LABELS[e.yearLevel] ?? e.yearLevel}${e.status === "WITHDRAWN" ? " · Withdrawn" : e.mentor ? ` · Mentor ${e.mentor.name}` : " · No mentor yet"}`}
            onPress={() => router.push({ pathname: "/prep-student/[id]", params: { id: e.studentId } })}
            trailing={
              e.isAsyncStudent ? (
                <View style={[styles.pill, { backgroundColor: colors.hover }]}>
                  <Copy kind="caption">Async</Copy>
                </View>
              ) : undefined
            }
          />
        ))}
      </ListSurface>

      <Copy kind="heading">Mentor workload</Copy>
      <ListSurface>
        {![...workload.values()].length && (
          <View style={{ paddingVertical: 18 }}>
            <Copy kind="caption">No mentor assignments yet.</Copy>
          </View>
        )}
        {[...workload.values()].map((m, index, arr) => (
          <CompactRow
            key={m.name + index}
            divider={index < arr.length - 1}
            title={m.name}
            subtitle={`${m.count} ${m.count === 1 ? "mentee" : "mentees"}`}
            onPress={() => router.push({ pathname: "/person/[id]", params: { id: m.id } })}
          />
        ))}
      </ListSurface>
    </Page>
  );
}
