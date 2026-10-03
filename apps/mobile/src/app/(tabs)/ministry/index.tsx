import { Platform, Pressable, View } from "react-native";
import { router, Stack, type Href } from "expo-router";
import type { SundaySchoolDashboard } from "@stmark/contracts";
import {
  CompactRow,
  Copy,
  Icon,
  ListSurface,
  Screen,
  SectionTitle,
  styles,
} from "@/components/ui";
import { TopActions } from "@/components/top-actions";
import { MinistrySwitcherPill } from "@/components/ministry-switcher";
import { ResourceState } from "@/components/forms";
import { endpoint, useResource } from "@/data/resources";
import { ministryAccess } from "@/data/ministry";
import { usePortal } from "@/data/portal-provider";
import { useAppTheme } from "@/theme";

type MinistryLink = {
  id: string;
  title: string;
  subtitle: string;
  href: Href;
};

export default function Ministry() {
  const resource = useResource<SundaySchoolDashboard>(endpoint("dashboard"));
  const { classes } = usePortal();
  const access = ministryAccess(resource.data, classes);
  const common: MinistryLink[] = [
    {
      id: "roster",
      title: "Children & families",
      subtitle: "Roster and profiles",
      href: "/roster",
    },
    {
      id: "visitations",
      title: "Visitations",
      subtitle: "Pastoral visit records",
      href: "/visitations",
    },
    {
      id: "reports",
      title: "Attendance reports",
      subtitle: "Attendance and trends",
      href: "/reports",
    },
    ...(access.canViewServantAttendance
      ? [{
          id: "servant-attendance",
          title: "Servant attendance",
          subtitle: access.canTakeServantAttendance
            ? "Record weekly attendance"
            : "View weekly attendance",
          href: "/servant-attendance" as Href,
        }]
      : []),
    ...(access.createLevels.length
      ? [{
          id: "registrations",
          title: "Child registrations",
          subtitle: "Review and place children",
          href: "/registrations" as Href,
        }]
      : []),
    {
      id: "feedback",
      title: "Feedback",
      subtitle: "Ideas and improvements",
      href: "/feedback",
    },
  ];
  const admin: MinistryLink[] = access.admin
    ? [
        {
          id: "age-groups",
          title: "Age groups",
          subtitle: "Grade bands and coordinators",
          href: "/age-groups",
        },
        {
          id: "people",
          title: "People & organization",
          subtitle: "Accounts and ministry teams",
          href: "/people",
        },
        {
          id: "applications",
          title: "Servant applications",
          subtitle: "Review applications",
          href: "/applications",
        },
        {
          id: "activity",
          title: "Activity",
          subtitle: "Recent security history",
          href: "/activity",
        },
      ]
    : [];

  return (
    <>
      <Stack.Screen
        options={{
          title: "More",
          headerRight:
            Platform.OS === "ios" ? undefined : () => <TopActions />,
        }}
      />
      {Platform.OS === "ios" && <TopActions />}
      <Screen
        resetOnFocus
        refreshing={resource.loading || resource.refreshing}
        onRefresh={() => void resource.refresh()}
      >
        <MinistrySwitcherPill current="sundaySchool" />
        <ResourceState
          loading={resource.loading}
          error={resource.error}
          retry={() => void resource.refresh()}
        />
        {resource.data && (
          <>
            <AcademicYearContext dashboard={resource.data} />
            <MinistryGroup title="Sunday School" links={common} />
            {!!admin.length && (
              <MinistryGroup title="Administration" links={admin} />
            )}
            {access.readOnly && (
              <Copy kind="caption">Ministry records are read-only.</Copy>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

/** Academic-year chip (SMM-28 shell); mirrors the web TopBar's year display, and opens year management. */
function AcademicYearContext({ dashboard }: { dashboard: SundaySchoolDashboard }) {
  const { colors } = useAppTheme();
  const { attendanceTrend } = dashboard;
  const yearName =
    attendanceTrend.academicYears.find((y) => y.id === attendanceTrend.selectedAcademicYearId)
      ?.name ?? "Current year";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Academic year: ${yearName}. Manage academic years`}
      onPress={() => router.push("/academic-years")}
      style={({ pressed }) => [
        styles.row,
        {
          alignSelf: "flex-start",
          gap: 6,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 8,
          backgroundColor: pressed ? colors.primary : colors.primarySoft,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Icon ios="calendar" android="calendar_month" size={14} color={colors.primary} />
      <Copy kind="caption" color={colors.primary}>
        {yearName}
      </Copy>
      <Icon ios="chevron.right" android="chevron_right" size={12} color={colors.primary} />
    </Pressable>
  );
}

function MinistryGroup({
  title,
  links,
}: {
  title: string;
  links: MinistryLink[];
}) {
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={title} />
      <ListSurface>
        {links.map((link, index) => (
          <CompactRow
            key={link.id}
            divider={index < links.length - 1}
            title={link.title}
            subtitle={link.subtitle}
            icon={<MinistryIcon id={link.id} />}
            onPress={() => router.push(link.href)}
          />
        ))}
      </ListSurface>
    </View>
  );
}

function MinistryIcon({ id }: { id: string }) {
  const { colors } = useAppTheme();
  const symbols =
    id === "roster"
      ? ({ ios: "person.3.fill", android: "diversity_3" } as const)
      : id === "visitations"
        ? ({ ios: "house", android: "home" } as const)
        : id === "reports"
          ? ({ ios: "chart.bar.fill", android: "bar_chart" } as const)
          : id === "servant-attendance"
            ? ({ ios: "checkmark.circle", android: "check_circle" } as const)
            : id === "registrations"
              ? ({ ios: "person.badge.plus", android: "person_add" } as const)
              : id === "feedback"
                ? ({ ios: "bubble.left.and.bubble.right.fill", android: "forum" } as const)
                : id === "age-groups"
                  ? ({ ios: "square.grid.2x2.fill", android: "group_work" } as const)
                  : id === "people"
                    ? ({ ios: "building.2.fill", android: "corporate_fare" } as const)
                    : id === "applications"
                      ? ({ ios: "doc", android: "description" } as const)
                      : ({ ios: "clock", android: "history" } as const);
  return (
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
      <Icon {...symbols} size={18} />
    </View>
  );
}
