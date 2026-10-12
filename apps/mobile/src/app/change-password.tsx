import { Stack } from "expo-router";
import { Copy, Screen } from "@/components/ui";
import { PasswordForm } from "@/components/password-form";

export default function ChangePassword() {
  return (
    <>
      <Stack.Screen options={{ title: "Change password" }} />
      <Screen>
        <Copy kind="caption" style={{ textAlign: "center" }}>
          Choose a new password for your account.
        </Copy>
        <PasswordForm />
      </Screen>
    </>
  );
}
