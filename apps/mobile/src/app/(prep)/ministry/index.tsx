import { Platform, View } from "react-native";
import type { AndroidSymbol, SFSymbol } from "expo-symbols";
import { router, Stack, type Href } from "expo-router";
import {
  CompactRow,
  Icon,
  ListSurface,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { useAuth } from "@/data/auth-provider";
import { canSeeContactBook } from "@/data/contact-book";
import { useAppTheme } from "@/theme";

type MinistryLink = { id: string; title: string; subtitle: string; href: Href; icon: { ios: SFSymbol; android: AndroidSymbol } };

/**
 * Grouped secondary destinations, mirroring the web's prepAdminNav groups
 * (lib/navigation.ts), filtered by role.
 */
const ADMIN_LINKS: MinistryLink[] = [
  { id: "attendance", title: "Attendance", subtitle: "Lesson attendance", href: "/prep-attendance", icon: { ios: "checkmark.circle", android: "check_circle" } },
  { id: "exams", title: "Exams", subtitle: "Scores and averages", href: "/prep-exams", icon: { ios: "doc.text", android: "description" } },
  { id: "exam-monitoring", title: "Exam Monitoring", subtitle: "Live progress, pauses, and exam controls", href: "/prep-exam-monitoring", icon: { ios: "waveform.path.ecg", android: "monitoring" } },
  { id: "curriculum", title: "Curriculum", subtitle: "Lessons by year", href: "/prep-curriculum", icon: { ios: "book.closed", android: "menu_book" } },
  { id: "confession", title: "Confession", subtitle: "Periods and slips", href: "/prep-confession", icon: { ios: "cross", android: "church" } },
  { id: "roster", title: "Roster & async students", subtitle: "Enrollment and eligibility", href: "/prep-roster", icon: { ios: "person.3", android: "groups" } },
  { id: "async-students", title: "Async students", subtitle: "Review signed rotation forms", href: "/prep-async-students", icon: { ios: "clock", android: "history" } },
  { id: "registrations", title: "Registration review", subtitle: "Applicant queue", href: "/prep-registrations", icon: { ios: "person.badge.plus", android: "person_add" } },
  { id: "activity", title: "Activity", subtitle: "Recent security history", href: "/prep-activity", icon: { ios: "waveform.path.ecg", android: "monitoring" } },
  { id: "files", title: "Files", subtitle: "Shared documents", href: "/prep-files", icon: { ios: "folder", android: "folder" } },
];

const CONTACT_BOOK_LINK: MinistryLink = {
  id: "contact-book",
  title: "Contact Book",
  subtitle: "Find app users and contact them",
  href: "/contact-book",
  icon: { ios: "book.closed.fill", android: "contacts" },
};

const SHARED_LINKS: MinistryLink[] = [
  { id: "files", title: "Files", subtitle: "Shared documents", href: "/prep-files", icon: { ios: "folder", android: "folder" } },
];

const STUDENT_LINKS: MinistryLink[] = [
  { id: "live-exams", title: "Live Exam", subtitle: "Your proctored original exam", href: "/prep-live-exams", icon: { ios: "checklist", android: "fact_check" } },
  ...SHARED_LINKS,
];

/** The mentor's own reduced destination set — matches the design source's 3-tab Dashboard/Mentees/Files bar, reached here rather than a role-conditional native tab bar (a bigger structural change out of this ticket's scope). */
const MENTOR_LINKS: MinistryLink[] = [
  { id: "mentor-dashboard", title: "Dashboard", subtitle: "Your mentees at a glance", href: "/prep-mentor-dashboard", icon: { ios: "house", android: "home" } },
  { id: "mentees", title: "My mentees", subtitle: "Progress and notes", href: "/prep-mentees", icon: { ios: "person.2", android: "group" } },
  { id: "files", title: "Files", subtitle: "Shared documents", href: "/prep-files", icon: { ios: "folder", android: "folder" } },
];

export default function PrepMinistry() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const isAdminLike = !user || ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"].includes(user.role);
  const baseLinks = isAdminLike ? ADMIN_LINKS : user?.role === "MENTOR" ? MENTOR_LINKS : user?.role === "STUDENT" ? STUDENT_LINKS : SHARED_LINKS;
  // Menu visibility only; the screen and API re-check access themselves.
  const links = canSeeContactBook(user) ? [...baseLinks, CONTACT_BOOK_LINK] : baseLinks;
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
                    <Icon {...link.icon} size={18} />
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
