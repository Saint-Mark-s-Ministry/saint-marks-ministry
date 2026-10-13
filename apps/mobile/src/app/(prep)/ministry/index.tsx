import { Platform, View } from "react-native";
import { router, Stack, type Href } from "expo-router";
import type { SFSymbol } from "sf-symbols-typescript";
import type { AndroidSymbol } from "expo-symbols";
import {
  CompactRow,
  Icon,
  ListSurface,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherHeaderLeft } from "@/components/ministry-switcher";
import { useAuth } from "@/data/auth-provider";
import { canSeeContactBook } from "@/data/contact-book";
import { useAppTheme } from "@/theme";

type MinistryLink = { id: string; title: string; subtitle: string; href: Href };

/**
 * Grouped secondary destinations, mirroring the web's prepAdminNav groups
 * (lib/navigation.ts), filtered by role.
 */
const READINGS_LINK: MinistryLink = {
  id: "readings",
  title: "Daily readings",
  subtitle: "Coptic date, lectionary and Synaxarium",
  href: "/readings",
};

const ADMIN_LINKS: MinistryLink[] = [
  { id: "attendance", title: "Attendance", subtitle: "Lesson attendance", href: "/prep-attendance" },
  { id: "exams", title: "Exams", subtitle: "Scores and averages", href: "/prep-exams" },
  { id: "curriculum", title: "Curriculum", subtitle: "Lessons by year", href: "/prep-curriculum" },
  { id: "confession", title: "Confession", subtitle: "Periods and slips", href: "/prep-confession" },
  { id: "roster", title: "Roster & async students", subtitle: "Enrollment and eligibility", href: "/prep-roster" },
  { id: "async-students", title: "Async students", subtitle: "Review signed rotation forms", href: "/prep-async-students" },
  { id: "registrations", title: "Registration review", subtitle: "Applicant queue", href: "/prep-registrations" },
  { id: "activity", title: "Activity", subtitle: "Recent security history", href: "/prep-activity" },
  { id: "files", title: "Files", subtitle: "Shared documents", href: "/prep-files" },
];

const CONTACT_BOOK_LINK: MinistryLink = {
  id: "contact-book",
  title: "Contact Book",
  subtitle: "Find app users and contact them",
  href: "/contact-book",
};

const SHARED_LINKS: MinistryLink[] = [
  { id: "files", title: "Files", subtitle: "Shared documents", href: "/prep-files" },
];

/** The mentor's own reduced destination set — matches the design source's 3-tab Dashboard/Mentees/Files bar, reached here rather than a role-conditional native tab bar (a bigger structural change out of this ticket's scope). */
const MENTOR_LINKS: MinistryLink[] = [
  { id: "mentor-dashboard", title: "Dashboard", subtitle: "Your mentees at a glance", href: "/prep-mentor-dashboard" },
  { id: "mentees", title: "My mentees", subtitle: "Progress and notes", href: "/prep-mentees" },
  { id: "files", title: "Files", subtitle: "Shared documents", href: "/prep-files" },
];

/** One glyph per destination (the SS More list does the same), not a single generic one. */
function linkIcon(id: string): { ios: SFSymbol; android: AndroidSymbol } {
  switch (id) {
    case "readings": return { ios: "text.book.closed.fill", android: "menu_book" };
    case "attendance": return { ios: "checkmark.circle", android: "check_circle" };
    case "exams": return { ios: "doc.text", android: "description" };
    case "curriculum": return { ios: "list.bullet.rectangle", android: "list_alt" };
    case "confession": return { ios: "heart.text.square", android: "volunteer_activism" };
    case "roster": return { ios: "person.3.fill", android: "diversity_3" };
    case "async-students": return { ios: "tray.full", android: "inbox" };
    case "registrations": return { ios: "person.badge.plus", android: "person_add" };
    case "activity": return { ios: "clock", android: "history" };
    case "files": return { ios: "folder.fill", android: "folder" };
    case "contact-book": return { ios: "book.closed.fill", android: "contacts" };
    case "mentor-dashboard": return { ios: "chart.bar.fill", android: "bar_chart" };
    case "mentees": return { ios: "person.2.fill", android: "groups" };
    default: return { ios: "square.grid.2x2", android: "dashboard" };
  }
}

export default function PrepMinistry() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const isAdminLike = !user || ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"].includes(user.role);
  const baseLinks = isAdminLike ? ADMIN_LINKS : user?.role === "MENTOR" ? MENTOR_LINKS : SHARED_LINKS;
  // Menu visibility only; the screen and API re-check access themselves.
  const links = [READINGS_LINK, ...baseLinks, ...(canSeeContactBook(user) ? [CONTACT_BOOK_LINK] : [])];
  return (
    <>
      <Stack.Screen
        options={{
          title: "More",
          headerLeft: () => <MinistrySwitcherHeaderLeft ministry="prep" />,
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
                    <Icon {...linkIcon(link.id)} size={18} />
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
