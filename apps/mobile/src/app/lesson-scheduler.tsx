import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import type {
  SundaySchoolScheduleMode,
  SundaySchoolSchedulePreview,
  SundaySchoolScheduleResult,
} from "@stmark/contracts";
import { Button, Copy, InitialsAvatar, ListSurface, Screen, SectionTitle } from "@/components/ui";
import { ResourceState, Toggle, useAction } from "@/components/forms";
import { endpoint, query, request, useResource } from "@/data/resources";
import { usePortal } from "@/data/portal-provider";

const MODES: SundaySchoolScheduleMode[] = ["one-each", "fill-year"];
const MODE_LABEL: Record<SundaySchoolScheduleMode, string> = {
  "one-each": "One each",
  "fill-year": "Fill the year",
};
const MODE_DESCRIPTION: Record<SundaySchoolScheduleMode, string> = {
  "one-each": "Gives every included servant exactly one upcoming Sunday, then stops.",
  "fill-year": "Fills every open Sunday through the rest of the school year, repeating the list.",
};

// Coordinator-only: bulk-assign a class's still-unassigned weekly lessons
// across its servants, instead of picking a teacher one Sunday at a time on
// the Lessons screen. Never touches a week that already has a teacher.
export default function LessonScheduler() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { classes } = usePortal();
  const cls = classes.find((c) => c.id === classId);
  const preview = useResource<SundaySchoolSchedulePreview>(
    classId ? `${endpoint("lessons")}/schedule?${query({ classId })}` : null,
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<SundaySchoolScheduleMode>("one-each");
  const action = useAction();
  const [result, setResult] = useState<SundaySchoolScheduleResult | null>(null);

  const servants = preview.data?.servants ?? [];
  // A servant added to the class after the screen loaded should start
  // included, not silently dropped because it predates this state.
  useEffect(() => {
    setExcluded((prev) => {
      const stillPresent = new Set(servants.map((s) => s.id));
      const next = new Set([...prev].filter((id) => stillPresent.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [servants]);

  const included = servants.filter((s) => !excluded.has(s.id));

  async function run() {
    if (!classId) return;
    await action.run(async () => {
      const response = await request<SundaySchoolScheduleResult>(`${endpoint("lessons")}/schedule`, "POST", {
        classId,
        excludedServantIds: [...excluded],
        mode,
      });
      setResult(response);
      void preview.refresh();
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: "Lesson scheduler" }} />
      <Screen refreshing={preview.loading} onRefresh={() => void preview.refresh()}>
        <View style={{ paddingHorizontal: 4, gap: 4 }}>
          <Copy kind="title">{cls?.name ?? "Lesson scheduler"}</Copy>
          <Copy kind="caption">
            Assigns teachers to upcoming Sundays with no teacher yet. A week that already has one is never changed —
            use the lesson itself to swap it.
          </Copy>
        </View>

        <ResourceState loading={preview.loading} error={preview.error} retry={() => void preview.refresh()} />

        {preview.data && (
          <>
            <SectionTitle title="Mode" />
            <SegmentedControl
              values={MODES.map((m) => MODE_LABEL[m])}
              selectedIndex={MODES.indexOf(mode)}
              onChange={({ nativeEvent }) => setMode(MODES[nativeEvent.selectedSegmentIndex])}
              style={{ width: "100%", minHeight: 36 }}
            />
            <Copy kind="caption">{MODE_DESCRIPTION[mode]}</Copy>

            <SectionTitle
              title="Servants"
              subtitle={`${included.length} of ${servants.length} included`}
            />
            {servants.length === 0 ? (
              <Copy kind="caption">No active servants are assigned directly to this class yet.</Copy>
            ) : (
              <ListSurface>
                {servants.map((servant) => (
                  <View key={servant.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
                    <InitialsAvatar name={servant.name} variant="neutral" size={32} />
                    <View style={{ flex: 1 }}>
                      <Toggle
                        label={servant.name}
                        value={!excluded.has(servant.id)}
                        onChange={(value) =>
                          setExcluded((prev) => {
                            const next = new Set(prev);
                            if (value) next.delete(servant.id);
                            else next.add(servant.id);
                            return next;
                          })
                        }
                      />
                    </View>
                  </View>
                ))}
              </ListSurface>
            )}

            <Copy kind="caption">{preview.data.emptyWeeksAvailable} open Sunday(s) with no teacher assigned.</Copy>

            <Button
              label={action.busy ? "Scheduling…" : "Run scheduler"}
              disabled={action.busy || included.length === 0 || preview.data.emptyWeeksAvailable === 0}
              onPress={() => {
                if (included.length < servants.length) {
                  Alert.alert(
                    "Schedule without everyone?",
                    `${servants.length - included.length} servant(s) are unselected and will get nothing assigned. Continue?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Run", onPress: () => void run() },
                    ],
                  );
                  return;
                }
                void run();
              }}
            />

            {result && (
              <ListSurface style={{ padding: 16, gap: 4 }}>
                <Copy style={{ fontWeight: "600" }}>
                  {result.assigned.length === 0
                    ? "Nothing to assign — every open Sunday already has a teacher, or everyone is unselected."
                    : `Assigned ${result.assigned.length} ${result.assigned.length === 1 ? "Sunday" : "Sundays"}.`}
                </Copy>
                <Button label="Done" secondary onPress={() => router.back()} />
              </ListSurface>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
