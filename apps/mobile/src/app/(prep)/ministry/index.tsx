import { Platform, View } from "react-native";
import { router, Stack, type Href } from "expo-router";
import {
  CompactRow,
  Icon,
  ListSurface,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherPill } from "@/components/ministry-switcher";
import { useAuth } from "@/data/auth-provider";
import { useAppTheme } from "@/theme";

type MinistryLink = { id: string; title: string; subtitle: string; href: Href };

/**
 * Grouped secondary destinations, mirroring the web's prepAdminNav groups
 * (lib/navigation.ts). Each destination is a placeholder route — real
 * content is SMM-32–61. This hub's job is only to prove the navigation
 * structure and role gating exist.
 */
const ADMIN_LINKS: MinistryLink[] = [
  { id: "attendance", title: "Attendance", subtitle: "Lesson attendance", href: "/prep-attendance" },
  { id: "exams", title: "Exams", subtitle: "Scores and averages", href: "/prep-exams" },
  { id: "curriculum", title: "Curriculum", subtitle: "Lessons by year", href: "/prep-curriculum" },
  { id: "confession", title: "Confession", subtitle: "Periods and slips", href: "/prep-confession" },
  { id: "roster", title: "Roster & async students", subtitle: "Enrollment and eligibility", href: "/prep-roster" },
  { id: "registrations", title: "Registration review", subtitle: "Applicant queue", href: "/prep-registrations" },
  { id: "activity", title: "Activity", subtitle: "Recent security history", href: "/prep-activity" },
  { id: "files", title: "Files", subtitle: "Shared documents", href: "/prep-files" },
];

const SHARED_LINKS: MinistryLink[] = [
  { id: "files", title: "Files", subtitle: "Shared documents", href: "/prep-files" },
];

/** The mentor's own reduced destination set — matches the design source's 3-tab Dashboard/Mentees/Files bar, reached here rather than a role-conditional native tab bar (a bigger structural change out of this ticket's scope). */
const MENTOR_LINKS: MinistryLink[] = [
  { id: "mentor-dashboard", title: "Dashboard", subtitle: "Your mentees at a glance", href: "/prep-mentor-dashboard" },
  { id: "mentees", title: "My mentees", subtitle: "Progress and notes", href: "/prep-mentees" },
  { id: "files", title: "Files", subtitle: "Shared documents", href: "/prep-files" },
];

export default function PrepMinistry() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const isAdminLike = !user || ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"].includes(user.role);
  const links = isAdminLike ? ADMIN_LINKS : user?.role === "MENTOR" ? MENTOR_LINKS : SHARED_LINKS;
  return (
    <>
      <Stack.Screen
        options={{
          title: "More",
          headerRight: Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen resetOnFocus>
        <MinistrySwitcherPill current="prep" />
        <View style={{ gap: 10 }}>
          <SectionTitle title="Servants Prep" />
          <ListSurface>
            {links.map((link, index) => (
              <CompactRow
                key={link.id}
                divider={index < links.length - 1}
                title={link.title}
                subtitle={link.subtitle}
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
                    <Icon ios="square.grid.2x2" android="dashboard" size={18} />
                  </View>
                }
                onPress={() => router.push(link.href)}
              />
            ))}
          </ListSurface>
        </View>
      </Screen>
    </>
  );
}
