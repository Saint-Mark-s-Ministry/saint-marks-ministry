import { ActivityIndicator } from "react-native";
import { usePortal } from "@/data/portal-provider";
import { Button, Card, Copy } from "./ui";
export function DataStatus() {
  const { loading, error, refresh } = usePortal();
  if (loading)
    return <ActivityIndicator accessibilityLabel="Loading ministry data" />;
  if (error)
    return (
      <Card>
        <Copy>
          {error === "Forbidden"
            ? "Your account does not have access to Sunday School classes. Ask an administrator to check your assignments."
            : error}
        </Copy>
        <Button secondary label="Try again" onPress={() => void refresh()} />
      </Card>
    );
  return null;
}
