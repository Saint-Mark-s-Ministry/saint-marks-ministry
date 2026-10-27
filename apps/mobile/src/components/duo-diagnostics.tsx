import { Pressable, View } from "react-native";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy } from "./ui";
import { useDuo } from "@/data/use-duo";
import { describeDuo } from "@/data/duo-layout";
import { native } from "../../modules/duo-layout";
import { useAppTheme } from "@/theme";

/** Development only, and only on a foldable: a tappable line of what the system reports about the hinge and the vertical bar. */
export function DuoDiagnostics() {
  const duo = useDuo();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [bars, setBars] = useState("");
  useEffect(() => {
    const module = native;
    if (!__DEV__ || !duo.supported || !module) return;
    const read = () => void module.describeBars().then(setBars).catch(() => undefined);
    const timer = setInterval(read, 2000);
    read();
    return () => clearInterval(timer);
  }, [duo.supported]);
  if (!__DEV__ || !duo.supported) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 8, right: 8, top: insets.top + 2, alignItems: "flex-start" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Foldable diagnostics"
        accessibilityValue={{ text: `${describeDuo(duo)} | insets ${JSON.stringify(duo.insets)} | divisions ${JSON.stringify(duo.divisions)} | occlusions ${JSON.stringify(duo.occlusions)} | BARS ${bars.replace(/\n/g, " ;; ")}` }}
        onPress={() => setOpen((value) => !value)}
        style={{ backgroundColor: colors.text, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, opacity: 0.82 }}
      >
        <Copy kind="caption" color={colors.background} maxFontSizeMultiplier={1}>{describeDuo(duo)}</Copy>
        {open && (
          <Copy kind="caption" color={colors.background} maxFontSizeMultiplier={1}>
            {`insets ${JSON.stringify(duo.insets)}\ndivisions ${JSON.stringify(duo.divisions)}\nocclusions ${JSON.stringify(duo.occlusions)}`}
          </Copy>
        )}
      </Pressable>
    </View>
  );
}
