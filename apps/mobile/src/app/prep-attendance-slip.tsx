import { useState } from "react";
import { Alert, View } from "react-native";
import { Stack } from "expo-router";
import * as Print from "expo-print";
import { Button, Copy, Screen } from "@/components/ui";
import { useAuth } from "@/data/auth-provider";
import { canViewOwnRotation, rotationFormHtml } from "@/data/rotation-forms";
import { serifDisplay } from "@/theme";

// The slip is paper in both appearances: it gets printed and signed.
const INK = "#1B1817";
const PAPER = "#FFFFFF";

/**
 * The corrected Servants Prep Rotations Form (the same one the web prints),
 * printed natively through AirPrint. There is deliberately no Download or
 * Google Docs hand-off.
 */
export default function PrepAttendanceSlip() {
  const { user } = useAuth();
  const canView = canViewOwnRotation(user?.role);
  const [printing, setPrinting] = useState(false);

  async function print() {
    if (printing) return;
    setPrinting(true);
    try {
      await Print.printAsync({ html: rotationFormHtml() });
    } catch (error) {
      // Dismissing the print sheet rejects; that is not a failure.
      const message = error instanceof Error ? error.message : "";
      if (!/did not complete|cancel/i.test(message)) {
        Alert.alert("Couldn't print", "Printing isn't available right now. Try again.");
      }
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Screen>
        {!canView && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Nothing to show here yet</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>This page is for students.</Copy>
          </View>
        )}

        {canView && (
          <>
            <View style={{ paddingHorizontal: 4, gap: 4 }}>
              <Copy style={{ fontFamily: serifDisplay, fontSize: 34, lineHeight: 36, fontWeight: "500" }}>
                Rotation form
              </Copy>
              <Copy kind="caption">Print this, have each week signed, then upload it from your rotation card.</Copy>
            </View>

            <Button label={printing ? "Opening print…" : "Print"} disabled={printing} onPress={() => void print()} />

            <View
              accessible
              accessibilityLabel="Servants Prep Rotations Form. Attendee name and grade attended lines, then a table with four weeks, each with date, servant name, and signature."
              style={{ backgroundColor: PAPER, borderRadius: 12, padding: 16, gap: 12, borderWidth: 1, borderColor: "#D5CEC6" }}
            >
              <Copy style={{ color: INK, fontSize: 18, fontWeight: "700", textAlign: "center" }}>
                Servants Prep Rotations Form
              </Copy>
              <Copy style={{ color: INK, fontSize: 14 }}>Attendee Name: ______________________</Copy>
              <Copy style={{ color: INK, fontSize: 14 }}>Grade Attended: ______________</Copy>
              <Copy style={{ color: INK, fontSize: 12, fontStyle: "italic" }}>
                *Only sign if the attendee was present at the beginning of class and attended for its entirety.
              </Copy>
              <View style={{ borderWidth: 1, borderColor: "#000" }}>
                <SlipRow cells={["Week", "Date", "Servant name (Print)", "Servant Signature"]} header />
                {[1, 2, 3, 4].map((week) => (
                  <SlipRow key={week} cells={[String(week), "", "", ""]} />
                ))}
              </View>
            </View>
            <Copy kind="caption" style={{ paddingHorizontal: 4 }}>Prints two copies on one page.</Copy>
          </>
        )}
      </Screen>
    </>
  );
}

function SlipRow({ cells, header = false }: { cells: string[]; header?: boolean }) {
  const widths = [0.14, 0.2, 0.33, 0.33];
  return (
    <View style={{ flexDirection: "row", borderTopWidth: header ? 0 : 1, borderColor: "#000", minHeight: header ? 40 : 52 }}>
      {cells.map((cell, index) => (
        <View
          key={index}
          style={{
            flex: widths[index],
            borderLeftWidth: index === 0 ? 0 : 1,
            borderColor: "#000",
            padding: 6,
            justifyContent: header ? "center" : "flex-start",
          }}
        >
          <Copy style={{ color: INK, fontSize: 12, fontWeight: header ? "700" : "400" }}>{cell}</Copy>
        </View>
      ))}
    </View>
  );
}
