import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTopInset } from "./system-chrome";

/**
 * Adds top safe-area padding for screens without HeaderShell.
 * Keeps background color consistent under the status bar.
 */
export default function SafeTop({ children, style, color = "#FFFFFF" }) {
  const insets = useSafeAreaInsets();
  const topInset = getTopInset(insets);

  return (
    <View style={[{ paddingTop: topInset, backgroundColor: color }, style]}>
      {children}
    </View>
  );
}
