import { useState } from "react";
import { Alert, Modal, Platform, Pressable, View } from "react-native";
import { router, Stack } from "expo-router";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Button, Copy, Icon, ListSurface, Screen, styles } from "@/components/ui";
import { Choice, Field, ResourceState, useAction } from "@/components/forms";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";
import { isAdminLike } from "@/data/prep-home";
import { canManageExams, filterExamsByYear, groupExamsByYear, type ExamListItem, type ExamYearFilter } from "@/data/prep-exams";

type AcademicYear = { id: string; name: string; isActive: boolean };
type ExamSection = { id: string; displayName: string };
type DashboardAnalytics = { totalAtRisk: number; atRiskStudents: { examAverage: number | null }[]; programOverview: { overallProgramAverage: number | null } };
type DashboardStats = { activeStudents: number };

const YEAR_LABELS: Record<string, string> = { YEAR_1: "Year 1", YEAR_2: "Year 2", BOTH: "Both years" };

export default function PrepExams() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const canView = isAdminLike(user?.role);
  const canCreate = canManageExams(user?.role);

  const [yearFilter, setYearFilter] = useState<ExamYearFilter>("YEAR_2");
  const [viewingYearId, setViewingYearId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const exams = useResource<ExamListItem[]>(canView ? "/api/exams" : null);
  const analytics = useResource<DashboardAnalytics>(canView ? "/api/dashboard/analytics" : null);

  const offline = exams.error === "Could not reach the server. Check your connection and try again.";
  const all = [...(exams.data ?? [])].sort((a, b) => b.examDate.localeCompare(a.examDate));
  const now = new Date();
  const upcoming = filterExamsByYear(
    all.filter((e) => new Date(e.examDate) >= now),
    yearFilter,
  );
  const past = all.filter((e) => new Date(e.examDate) < now);
  const yearGroups = groupExamsByYear(past);
  const viewingYear = yearGroups.find((g) => g.academicYear.id === viewingYearId);

  const belowThreshold = analytics.data?.atRiskStudents.filter((s) => s.examAverage != null && s.examAverage < 75).length ?? 0;
  const programAverage = analytics.data?.programOverview.overallProgramAverage ?? null;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Exams",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen refreshing={exams.loading} onRefresh={() => { void exams.refresh(); void analytics.refresh(); }}>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Exams are for Servants Prep administrators.</Copy>
          </View>
        )}

        {canView && (
          <>
            <Copy kind="caption">Create exams and enter scores</Copy>

            {offline && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.dangerSoft, gap: 6 }}>
                <Copy style={{ fontWeight: "600" }} color={colors.danger}>You're offline</Copy>
                <Copy kind="caption">Showing the last data we had. Pull down to try again once you're back online.</Copy>
              </View>
            )}
            <ResourceState
              loading={exams.loading}
              error={offline ? undefined : exams.error}
              retry={() => { void exams.refresh(); void analytics.refresh(); }}
            />

            {canCreate && (
              <Button label="Create exam" onPress={() => setCreating(true)} />
            )}

            {!viewingYearId && (
              <>
                <SegmentedControl
                  values={["Year 2", "Year 1", "All"]}
                  selectedIndex={(["YEAR_2", "YEAR_1", "all"] as const).indexOf(yearFilter)}
                  onChange={({ nativeEvent }) =>
                    setYearFilter((["YEAR_2", "YEAR_1", "all"] as const)[nativeEvent.selectedSegmentIndex] ?? "YEAR_2")
                  }
                  style={{ width: "100%", minHeight: 36 }}
                />

                {!!upcoming.length && (
                  <View style={{ gap: 10 }}>
                    <Copy style={{ fontSize: 17, fontWeight: "600" }}>Upcoming</Copy>
                    {upcoming.map((exam) => (
                      <ExamCard key={exam.id} exam={exam} />
                    ))}
                  </View>
                )}

                {exams.data && (
                  <ListSurface>
                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      <Stat
                        label="Program average"
                        value={programAverage != null ? `${programAverage.toFixed(1)}%` : "—"}
                        sublabel="all exams"
                        color={programAverage != null ? (programAverage >= 75 ? colors.success : colors.danger) : undefined}
                      />
                      <Stat label="Below 75%" value={belowThreshold} sublabel="students" color={belowThreshold > 0 ? colors.danger : undefined} />
                    </View>
                  </ListSurface>
                )}

                {!!yearGroups.length && (
                  <View style={{ gap: 10 }}>
                    <Copy style={{ fontSize: 17, fontWeight: "600" }}>Past years</Copy>
                    <ListSurface>
                      {yearGroups.map((group, index) => (
                        <Pressable
                          key={group.academicYear.id}
                          accessibilityRole="button"
                          onPress={() => setViewingYearId(group.academicYear.id)}
                          style={({ pressed }) => [
                            styles.compactRow,
                            index < yearGroups.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                            { backgroundColor: pressed ? colors.primarySoft : "transparent" },
                          ]}
                        >
                          <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}>
                            <Icon ios="graduationcap" android="school" size={17} color={colors.text2} />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Copy style={{ fontWeight: "500" }}>{group.academicYear.name}</Copy>
                            <Copy kind="caption">
                              {group.exams.length} {group.exams.length === 1 ? "exam" : "exams"} · {group.totalScores} scores recorded
                            </Copy>
                          </View>
                          <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
                        </Pressable>
                      ))}
                    </ListSurface>
                  </View>
                )}

                {exams.data && !upcoming.length && !yearGroups.length && (
                  <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
                    <Copy kind="heading">No exams yet</Copy>
                    {canCreate && <Copy kind="caption">Create the first one to get started.</Copy>}
                  </View>
                )}
              </>
            )}

            {viewingYear && (
              <View style={{ gap: 10 }}>
                <Pressable accessibilityRole="button" onPress={() => setViewingYearId(null)}>
                  <Copy kind="caption" color={colors.primary} style={{ fontWeight: "500" }}>← Back to all years</Copy>
                </Pressable>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>{viewingYear.academicYear.name}</Copy>
                {viewingYear.exams.map((exam) => (
                  <ExamCard key={exam.id} exam={exam} past />
                ))}
              </View>
            )}
          </>
        )}
      </Screen>

      {creating && (
        <CreateExamSheet
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            void exams.refresh();
            router.push({ pathname: "/prep-exam/[id]", params: { id } });
          }}
        />
      )}
    </>
  );
}

function ExamCard({ exam, past = false }: { exam: ExamListItem; past?: boolean }) {
  const { colors } = useAppTheme();
  const date = new Date(exam.examDate);
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 26, padding: 18, gap: 12 }}>
      <View style={[styles.row, { gap: 12 }]}>
        <View style={{ width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.infoSoft }}>
          <Icon ios="graduationcap" android="school" size={20} color={colors.info} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Copy style={{ fontWeight: "600" }}>
            {exam.examSection?.displayName ?? "Exam"} · {YEAR_LABELS[exam.yearLevel] ?? exam.yearLevel}
          </Copy>
          <Copy kind="caption">
            {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            {" · "}
            {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            {" · "}
            {exam._count.scores} {exam._count.scores === 1 ? "score" : "scores"}
          </Copy>
        </View>
      </View>
      <Button
        label={past ? "View scores" : "Enter scores"}
        secondary={past}
        onPress={() => router.push({ pathname: "/prep-exam/[id]", params: { id: exam.id } })}
      />
    </View>
  );
}

function Stat({ label, value, sublabel, color }: { label: string; value: string | number; sublabel: string; color?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ width: "50%", padding: 12, gap: 6 }} accessible accessibilityLabel={`${label}: ${value}, ${sublabel}`}>
      <Copy kind="caption" style={{ fontWeight: "500" }}>{label}</Copy>
      <Copy style={{ fontSize: 28, lineHeight: 32, fontWeight: "600" }} color={color ?? colors.text}>
        {String(value)}
      </Copy>
      <Copy kind="caption">{sublabel}</Copy>
    </View>
  );
}

function CreateExamSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { colors } = useAppTheme();
  const years = useResource<AcademicYear[]>("/api/academic-years");
  const sections = useResource<ExamSection[]>("/api/exam-sections");
  const activeYear = years.data?.find((y) => y.isActive) ?? years.data?.[0];

  const [sectionId, setSectionId] = useState("");
  const [yearLevel, setYearLevel] = useState<"YEAR_1" | "YEAR_2" | "BOTH">("YEAR_2");
  const [examDate, setExamDate] = useState(new Date());
  const [totalPoints, setTotalPoints] = useState("100");
  const action = useAction();

  const points = Number(totalPoints);
  const canSubmit = !!sectionId && !!activeYear && Number.isFinite(points) && points > 0;

  function submit() {
    if (!canSubmit) return;
    void action.run(async () => {
      const created = await request<{ id: string }>("/api/exams", "POST", {
        academicYearId: activeYear!.id,
        examSectionId: sectionId,
        yearLevel,
        examDate: examDate.toISOString(),
        totalPoints: points,
      });
      onCreated(created.id);
    });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 24, gap: 16 }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            disabled={action.busy}
            onPress={onClose}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>Create exam</Copy>
          <View style={{ width: 40 }} />
        </View>

        <ResourceState loading={years.loading || sections.loading} error={years.error || sections.error} retry={() => { void years.refresh(); void sections.refresh(); }} />

        {!!sections.data && (
          <Choice
            label="Section"
            value={sectionId}
            options={sections.data.map((s) => ({ value: s.id, label: s.displayName }))}
            onChange={setSectionId}
          />
        )}

        <Choice
          label="Year level"
          value={yearLevel}
          options={[
            { value: "YEAR_2", label: "Year 2" },
            { value: "YEAR_1", label: "Year 1" },
            { value: "BOTH", label: "Both years" },
          ]}
          onChange={(v) => setYearLevel(v as "YEAR_1" | "YEAR_2" | "BOTH")}
        />

        <View style={{ gap: 7 }}>
          <Copy kind="caption">Date and time</Copy>
          <DateTimePicker
            value={examDate}
            mode="datetime"
            display={Platform.OS === "ios" ? "compact" : "default"}
            onValueChange={(_, date) => setExamDate(date)}
            accentColor={colors.primary}
          />
        </View>

        <Field label="Total points" value={totalPoints} onChange={setTotalPoints} keyboardType="numeric" disabled={action.busy} />

        {!activeYear && !years.loading && (
          <Copy kind="caption" color={colors.danger}>No academic year is set up yet — create one first.</Copy>
        )}

        <Button
          label={action.busy ? "Creating…" : "Create exam"}
          disabled={!canSubmit || action.busy}
          onPress={() => {
            if (!canSubmit) {
              Alert.alert("Missing information", "Choose a section and a valid total points value.");
              return;
            }
            submit();
          }}
        />
      </View>
    </Modal>
  );
}
