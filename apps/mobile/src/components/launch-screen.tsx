import { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

const launchBackground = "#5C1A1A";
const fadeDuration = 500;

export default function LaunchScreen({
  ready,
  onFinished,
}: {
  ready: boolean;
  onFinished: () => void;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!ready) return;

    const frame = requestAnimationFrame(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: fadeDuration,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinished();
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      opacity.stopAnimation();
    };
  }, [onFinished, opacity, ready]);

  return (
    <Animated.View
      accessibilityLabel="St. Mark Ministry Portal is loading"
      pointerEvents={ready ? "none" : "auto"}
      style={[StyleSheet.absoluteFill, styles.container, { opacity }]}
    >
      <StatusBar style="light" />
      <Image
        accessibilityLabel="St. Mark Coptic Orthodox Church logo"
        source={require("../../../../public/sunday-school-favicon.png")}
        resizeMode="contain"
        style={styles.logo}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 100,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: launchBackground,
  },
  logo: {
    width: 152,
    height: 152,
  },
});
