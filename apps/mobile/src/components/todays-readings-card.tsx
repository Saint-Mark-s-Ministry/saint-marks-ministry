import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Card, Copy, Icon } from "@/components/ui";
import { useAppTheme, serifCard } from "@/theme";
import { useResource } from "@/data/resources";
import { headlineReference, readingsPath, type DailyReadings } from "@/data/readings";

/**
 * Home's entry to the daily lectionary: today's Coptic date and the Gospel
 * reference, tapping through to the full readings page. If the church
 * calendar service is unreachable the card still opens the page.
 */
export function TodaysReadingsCard() {
  const { colors } = useAppTheme();
  const readings = useResource<DailyReadings>(readingsPath(null, "en"));
  const data = readings.data;
  const headline = headlineReference(data);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        data?.copticDate
          ? `Today's readings. ${data.copticDate.label}${headline ? `. Gospel, ${headline}` : ""}`
          : "Today's readings"
      }
      onPress={() => router.push("/readings")}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primarySoft,
          }}
        >
          <Icon ios="text.book.closed.fill" android="menu_book" size={20} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Copy kind="caption">Today's readings</Copy>
          <Copy style={{ ...serifCard, lineHeight: 26 }} numberOfLines={1}>
            {data?.copticDate ? data.copticDate.label : "Lectionary and Synaxarium"}
          </Copy>
          {!!headline && (
            <Copy kind="caption" numberOfLines={1}>
              Gospel · {headline}
            </Copy>
          )}
        </View>
        <Icon ios="chevron.right" android="chevron_right" size={14} color={colors.muted} />
      </Card>
    </Pressable>
  );
}
