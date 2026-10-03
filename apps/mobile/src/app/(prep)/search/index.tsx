import { useState } from "react";
import { View } from "react-native";
import { router, Stack, type Href } from "expo-router";
import { CompactRow, Copy, Icon, ListSurface, Screen, SectionTitle } from "@/components/ui";
import { useAppTheme } from "@/theme";

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
  const { colors } = useAppTheme();
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();
  const tools = trimmed
    ? TOOLS.filter((tool) => tool.title.toLowerCase().includes(trimmed))
    : TOOLS;

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
        <Copy kind="caption">
          Searching students, exams, and lessons ships with their feature
          updates. For now, jump straight to a tool:
        </Copy>
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
