import { View } from "react-native";
import { Stack } from "expo-router";
import type { SundaySchoolHomeworkResponse } from "@stmark/contracts";
import { Copy, Screen } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { FamilyHomework } from "@/components/family-homework";
import { endpoint, useResource } from "@/data/resources";
import { familyHomework } from "@/data/sunday-school-homework";
import { MinistryTintProvider, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

/**
 * A linked child account's own homework and outcomes. The server returns only
 * the child linked to this login (app/api/sunday-school/homework/route.ts's
 * STUDENT branch) and reports `eligible: false` for any account that isn't a
 * current Elementary child, so there is nothing to filter here.
 */
export default function MyHomework() {
  return (
    <MinistryTintProvider ministry="sundaySchool">
      <MyHomeworkScreen />
    </MinistryTintProvider>
  );
}

function MyHomeworkScreen() {
  const { colors } = useAppTheme();
  const resource = useResource<SundaySchoolHomeworkResponse>(endpoint("homework"));
  const offline = resource.error === OFFLINE;
  const data = resource.data;

  return (
    <>
      <Stack.Screen options={{ title: "Homework" }} />
      <Screen refreshing={resource.loading || resource.refreshing} onRefresh={() => void resource.refresh()}>
        <View style={{ paddingHorizontal: 4, gap: 4 }}>
          <Copy kind="caption">Sunday School · assigned by your class servants</Copy>
        </View>

        {resource.stale && (
          <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 4 }}>
            <Copy style={{ fontWeight: "600" }} color={colors.warning}>
              {offline ? "You're offline" : "Couldn't refresh"} · showing saved homework
            </Copy>
            <Copy kind="caption">Pull down to try again.</Copy>
          </View>
        )}
        {!resource.stale && (
          <ResourceState loading={resource.loading} error={resource.error} retry={() => void resource.refresh()} />
        )}

        {data && !data.eligible && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>No homework here</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>
              Homework appears for children in an Elementary class.
            </Copy>
          </View>
        )}

        {data?.eligible && <FamilyHomework items={familyHomework(data)} />}
      </Screen>
    </>
  );
}
