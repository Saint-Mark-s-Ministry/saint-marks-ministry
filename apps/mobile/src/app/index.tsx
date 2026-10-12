import { Redirect } from "expo-router";
import { useAuth } from "@/data/auth-provider";
import { defaultMinistry } from "@/data/navigation";
export default function Index() {
  const { user } = useAuth();
  return <Redirect href={user && defaultMinistry(user, user.sundaySchool.hasAccess) === "prep" ? "/(prep)/home" : "/(tabs)/home"} />;
}
