/**
 * Which screens a signed-out person may reach.
 *
 * Every screen except these needs a signed-in session, and most need the
 * signed-in providers (PortalProvider) that only exist after sign-in. If one
 * of them mounts while signed out it throws, and the first launch of the app
 * (the state App Review always starts in) becomes a crash screen.
 *
 * The root layout marks SIGNED_IN_ROUTES as protected while signed out, so
 * they can't mount at all. __tests__/mobile/route-access.test.ts compares both
 * lists with the route files on disk, so adding a screen without deciding which
 * list it belongs to fails the test instead of shipping a hole.
 */

/** Reachable without an account: sign in, the public registration flows, and the roster QR sign-up. */
export const PUBLIC_ROUTES = [
  "sign-in",
  "registration",
  "registration/apply",
  "signup/parent",
  "signup/servant",
  "roster-signup",
] as const;

/** Everything that needs a signed-in session. Route names as the router knows them. */
export const SIGNED_IN_ROUTES = [
  "(prep)",
  "(tabs)",
  "academic-years",
  "account",
  "activity",
  "age-groups",
  "applications",
  "attendance/[classId]",
  "change-password",
  "child/[id]",
  "class/[id]",
  "contact-book",
  "delete-account",
  "feedback",
  "feedback/[id]",
  "homework",
  "lesson-scheduler",
  "lesson/[id]",
  "lessons",
  "main-classes",
  "my-homework",
  "notifications",
  "organization",
  "parent-children",
  "parent-register",
  "people",
  "person/[id]",
  "prep-activity",
  "prep-application",
  "prep-async-student/[id]",
  "prep-async-students",
  "prep-attendance",
  "prep-attendance-slip",
  "prep-class-lessons",
  "prep-confession",
  "prep-curriculum",
  "prep-exam/[id]",
  "prep-exams",
  "prep-file-preview",
  "prep-files",
  "prep-lesson/[id]",
  "prep-lessons",
  "prep-mentee/[id]",
  "prep-mentees",
  "prep-mentor-dashboard",
  "prep-my-lesson/[id]",
  "prep-progress",
  "prep-registration/[id]",
  "prep-registrations",
  "prep-roster",
  "prep-servant-applications",
  "prep-serving",
  "prep-student/[id]",
  "profile",
  "registrations",
  "reports",
  "roster",
  "servant-attendance",
  "sunday-birthdays",
  "switch-ministry",
  "visitation/[childId]",
  "visitations",
] as const;

/** Where the app's root URL should land for someone in this state. */
export function launchDestination(user: { mustChangePassword?: boolean } | null | undefined): "/(tabs)/home" | "/sign-in" {
  // A forced password change is completed on the sign-in screen, before the app opens.
  return user && !user.mustChangePassword ? "/(tabs)/home" : "/sign-in";
}
