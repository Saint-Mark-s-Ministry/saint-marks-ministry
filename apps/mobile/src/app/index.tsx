import { Redirect } from "expo-router";
import { useAuth } from "@/data/auth-provider";
import { launchDestination } from "@/data/route-access";

/**
 * The app's root URL. Signed out (the state App Review launches in, and every
 * first launch), this must land on Sign in, not on a screen that needs a
 * session.
 */
export default function Index() {
  const { user } = useAuth();
  return <Redirect href={launchDestination(user)} />;
}
