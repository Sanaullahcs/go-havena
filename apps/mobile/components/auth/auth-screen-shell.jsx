import React from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenStatusBar from "../layout/screen-status-bar";
import { SolidFills } from "../../constants/tokens";

/** Auth backdrop — plain white or soft wash with optional orbs */
export default function AuthScreenShell({
  children,
  edges = ["top", "left", "right"],
  style,
  contentStyle,
  showOrbs = true,
  background = "gradient",
}) {
  const plain = background === "plain";

  return (
    <>
      <ScreenStatusBar style="dark" opaque />
      {plain ? (
        <SafeAreaView style={[styles.plain, contentStyle, style]} edges={edges}>
          {children}
        </SafeAreaView>
      ) : (
        <View style={[styles.wash, style]}>
          {showOrbs ? (
            <>
              <View style={[styles.orbTop, { pointerEvents: "none" }]} />
              <View style={[styles.orbBottom, { pointerEvents: "none" }]} />
            </>
          ) : null}
          <SafeAreaView style={[styles.safe, contentStyle]} edges={edges}>
            {children}
          </SafeAreaView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  wash: {
    flex: 1,
    backgroundColor: SolidFills.authWash,
  },
  plain: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: "#FFFFFF",
  },
  safe: {
    flex: 1,
    paddingHorizontal: 24,
  },
  orbTop: {
    position: "absolute",
    top: -48,
    end: -32,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(20, 184, 166, 0.08)",
  },
  orbBottom: {
    position: "absolute",
    bottom: 120,
    start: -64,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(16, 185, 129, 0.06)",
  },
});
