import type {
  SundaySchoolClass,
  SundaySchoolDashboard,
} from "@stmark/contracts";
import { ministryAccess } from "./ministry";

export type SearchTool = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export function searchTools(
  dashboard?: SundaySchoolDashboard,
  classes: SundaySchoolClass[] = [],
): SearchTool[] {
  const access = ministryAccess(dashboard, classes);
  const primaryClass = classes[0];
  const tools: SearchTool[] = [
    {
      id: "classes",
      title: classes.length === 1 ? "My class" : "Classes",
      subtitle: primaryClass?.name ?? "View accessible classes",
      href: primaryClass ? `/class/${primaryClass.id}` : "/(tabs)/classes",
    },
    {
      id: "calendar",
      title: "Calendar",
      subtitle: "This month's lessons and attendance",
      href: "/(tabs)/calendar",
    },
    {
      id: "lessons",
      title: "Weekly lessons",
      subtitle: "Plans, teachers, and resources",
      href: "/lessons",
    },
    {
      id: "roster",
      title: "Children & families",
      subtitle: "Roster and child profiles",
      href: primaryClass ? `/roster?classId=${primaryClass.id}` : "/roster",
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
      subtitle: "Attendance and ministry trends",
      href: "/reports",
    },
    {
      id: "feedback",
      title: "Feedback",
      subtitle: "Ideas and improvements",
      href: "/feedback",
    },
  ];

  if (primaryClass) {
    tools.unshift({
      id: "attendance",
      title: primaryClass.canServe ? "Take attendance" : "View attendance",
      subtitle: primaryClass.name,
      href: `/attendance/${primaryClass.id}`,
    });
  }
  if (access.canViewServantAttendance) {
    tools.push({
      id: "servant-attendance",
      title: access.canTakeServantAttendance
        ? "Servant attendance"
        : "View servant attendance",
      subtitle: "Weekly ministry team attendance",
      href: "/servant-attendance",
    });
  }
  if (access.createLevels.length > 0) {
    tools.push({
      id: "registrations",
      title: "Child registrations",
      subtitle: "Review and place children",
      href: "/registrations",
    });
  }
  if (access.admin) {
    tools.push(
      {
        id: "applications",
        title: "Servant applications",
        subtitle: "Review ministry applications",
        href: "/applications",
      },
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
        id: "activity",
        title: "Activity",
        subtitle: "Recent security history",
        href: "/activity",
      },
    );
  }
  return tools;
}

export function filterSearchTools(tools: SearchTool[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return tools;
  return tools.filter((tool) => {
    const text = `${tool.title} ${tool.subtitle}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
