import { Alert, Linking, Pressable, View } from "react-native";
import type { SundaySchoolHomeworkDisplayStatus } from "@stmark/contracts";
import { Copy, ListSurface, StatusPill } from "@/components/ui";
import {
  completionLabel,
  completionTone,
  type FamilyHomeworkItem,
} from "@/data/sunday-school-homework";
import { shortMonthDay } from "@/data/sunday-school-classes";
import { useAppTheme } from "@/theme";

/** One outcome pill, colored by tone. "Not recorded" is neutral, never red or green. */
export function HomeworkStatusPill({ status }: { status: SundaySchoolHomeworkDisplayStatus }) {
  const { colors } = useAppTheme();
  const tone = completionTone(status);
  const color = tone === "success" ? colors.success : tone === "danger" ? colors.danger : colors.text2;
  const soft = tone === "success" ? colors.successSoft : tone === "danger" ? colors.dangerSoft : colors.hover;
  return <StatusPill label={completionLabel(status)} color={color} soft={soft} />;
}

/** The server accepts only http(s) links, but a device can still decline to open one. */
export function openHomeworkLink(url: string) {
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open link", url));
}

export function HomeworkLink({ title, url }: { title: string; url: string }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}, opens link`}
      hitSlop={6}
      onPress={() => openHomeworkLink(url)}
    >
      <Copy color={colors.primary}>{title}</Copy>
    </Pressable>
  );
}

/**
 * Published homework and each of the viewer's own children's outcomes. Shared
 * by a parent's "My children" screen and a linked child account's own screen —
 * both receive only their own children from the server.
 */
export function FamilyHomework({ items }: { items: FamilyHomeworkItem[] }) {
  const { colors } = useAppTheme();
  if (!items.length) {
    return (
      <ListSurface style={{ padding: 16 }}>
        <Copy kind="caption">No homework has been assigned yet.</Copy>
      </ListSurface>
    );
  }
  return (
    <ListSurface>
      {items.map((item, index) => (
        <View key={item.homeworkId}>
          <View style={{ padding: 16, gap: 8 }}>
            <Copy kind="caption">
              {item.className} · assigned {shortMonthDay(item.assignedDate)} · due {shortMonthDay(item.dueDate)}
            </Copy>
            <Copy style={{ fontWeight: "600", fontSize: 17 }}>{item.title}</Copy>
            {!!item.instructions && <Copy>{item.instructions}</Copy>}
            {item.resources.map((r) => (
              <HomeworkLink key={r.id} title={r.title} url={r.url} />
            ))}
            <View style={{ gap: 6 }}>
              {item.children.map((child) => (
                <View
                  key={child.id}
                  accessible
                  accessibilityLabel={`${child.firstName}: ${completionLabel(child.status)}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  {item.children.length > 1 && (
                    <Copy kind="caption" style={{ flex: 1 }}>{child.firstName}</Copy>
                  )}
                  <HomeworkStatusPill status={child.status} />
                </View>
              ))}
            </View>
          </View>
          {index < items.length - 1 && <View style={{ height: 0.5, backgroundColor: colors.border }} />}
        </View>
      ))}
    </ListSurface>
  );
}
