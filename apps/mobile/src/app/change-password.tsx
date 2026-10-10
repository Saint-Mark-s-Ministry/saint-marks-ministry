import { Stack } from "expo-router";
import { Copy, Screen } from "@/components/ui";
import { PasswordForm } from "@/components/password-form";
import { serifDisplay } from "@/theme";

export default function ChangePassword() {
  return (
    <>
      <Stack.Screen options={{ title: "", headerLargeTitle: false }} />
      <Screen>
        <Copy style={{ fontFamily: serifDisplay, fontSize: 28, lineHeight: 32, fontWeight: "500", textAlign: "center" }}>
          Change your password
        </Copy>
        <Copy kind="caption" style={{ textAlign: "center" }}>
          Choose a new password for your account.
        </Copy>
        <PasswordForm />
      </Screen>
    </>
  );
}
