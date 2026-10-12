import { useState } from "react";
import { View } from "react-native";
import { router, Stack, type Href } from "expo-router";
import { CompactRow, Copy, Icon, InitialsAvatar, ListSurface, Screen, SectionTitle, StatusPill } from "@/components/ui";
import { useAppTheme } from "@/theme";
import { useAuth } from "@/data/auth-provider";
import { useResource } from "@/data/resources";
import { canViewStudentRoster, eligibilityLabel, isAdminLike, searchStudents } from "@/data/prep-students";

type StudentAnalytics = {
  studentId: string;
  studentName: string;
  yearLevel: string;
  attendancePercentage: number | null;
  examAverage: number | null;
  graduationEligible: boolean;
};

type Tool = { id: string; title: string; subtitle: string; href: Href };
const TOOLS: Tool[] = [
  { id: "attendance", title: "Attendance", subtitle: "Lesson attendance", href: "/prep-attendance" },
  { id: "exams", title: "Exams", subtitle: "Scores and averages", href: "/prep-exams" },
  { id: "curriculum", title: "Curriculum", subtitle: "Lessons by year", href: "/prep-curriculum" },
  { id: "confession", title: "Confession", subtitle: "Periods and slips", href: "/prep-confession" },
  { id: "roster", title: "Roster & async students", subtitle: "Enrollment and eligibility", href: "/prep-roster" },
  { id: "registrations", title: "Registration review", subtitle: "Applicant queue", href: "/prep-registrations" },
  { id: "files", title: "Files", subtitle: "Shared documents", href: "/prep-files" },
];

export default function PrepSearch() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();
  const tools = trimmed
    ? TOOLS.filter((tool) => tool.title.toLowerCase().includes(trimmed))
    : TOOLS;

  // Students search (SMM-34): the only feature area with search wired up so
  // far — exams and lessons still fall back to "jump straight to a tool"
  // below, per the comment this replaces.
  const canSearchStudents = canViewStudentRoster(user?.role);
  const students = useResource<StudentAnalytics[]>(canSearchStudents ? "/api/students/analytics/batch" : null);
  const matchingStudents = trimmed ? searchStudents(students.data ?? [], trimmed).slice(0, 20) : [];

  return (
    <>
      <Stack.Title>Search</Stack.Title>
      <Stack.SearchBar
        autoCapitalize="none"
        placement="automatic"
        placeholder="Search"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
      />
      <Screen resetOnFocus adjustForKeyboard={false}>
        {!trimmed && (
          <Copy kind="caption">
            Searching exams and lessons ships with their feature updates. For now, jump straight to a tool:
          </Copy>
        )}

        {trimmed && canSearchStudents && (
          <View style={{ gap: 10 }}>
            <SectionTitle title="Students" />
            {!matchingStudents.length && (
              <Copy kind="caption">No students match "{query.trim()}".</Copy>
            )}
            {!!matchingStudents.length && (
              <ListSurface>
                {matchingStudents.map((s, index) => (
                  <CompactRow
                    key={s.studentId}
                    divider={index < matchingStudents.length - 1}
                    title={s.studentName}
                    subtitle={`Att ${s.attendancePercentage ?? "—"}% · Exam ${s.examAverage ?? "—"}%`}
                    icon={<InitialsAvatar name={s.studentName} size={38} />}
                    trailing={
                      <StatusPill
                        label={eligibilityLabel(s.graduationEligible)}
                        color={s.graduationEligible ? colors.success : colors.warning}
                        soft={s.graduationEligible ? colors.successSoft : colors.warningSoft}
                      />
                    }
                    onPress={() =>
                      router.push(
                        isAdminLike(user?.role)
                          ? { pathname: "/prep-student/[id]", params: { id: s.studentId } }
                          : { pathname: "/prep-mentee/[id]", params: { id: s.studentId } },
                      )
                    }
                  />
                ))}
              </ListSurface>
            )}
          </View>
        )}

        <View style={{ gap: 10 }}>
          <SectionTitle title="Tools" />
          <ListSurface>
            {tools.map((tool, index) => (
              <CompactRow
                key={tool.id}
                divider={index < tools.length - 1}
                title={tool.title}
                subtitle={tool.subtitle}
                icon={
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 13,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.primarySoft,
                    }}
                  >
                    <Icon ios="wrench" android="build" size={18} />
                  </View>
                }
                onPress={() => router.push(tool.href)}
              />
            ))}
            {!tools.length && (
              <View style={{ paddingVertical: 18 }}>
                <Copy kind="caption">No matching tools.</Copy>
              </View>
            )}
          </ListSurface>
        </View>
      </Screen>
    </>
  );
}
