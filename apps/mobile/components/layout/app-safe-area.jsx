import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Default screen wrapper. Top inset is handled by HeaderShell / screen headers
 * so we avoid the double white band under the status bar.
 */
export default function AppSafeArea({
  children,
  style,
  edges = ["left", "right"],
  ...rest
}) {
  return (
    <SafeAreaView style={[{ flex: 1 }, style]} edges={edges} {...rest}>
      {children}
    </SafeAreaView>
  );
}

/** Use on full-bleed screens without a header (auth, splash-style layouts). */
export function AppSafeAreaFull({ children, style, ...rest }) {
  return (
    <SafeAreaView style={[{ flex: 1 }, style]} edges={["top", "left", "right"]} {...rest}>
      {children}
    </SafeAreaView>
  );
}
