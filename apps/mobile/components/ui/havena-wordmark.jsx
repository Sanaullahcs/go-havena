import { Text } from "react-native";

/** Standalone “Havena” wordmark — Quicksand matches the logo’s rounded geometric face. */
export default function HavenaWordmark({ height = 28, style }) {
  return (
    <Text
      style={[
        {
          fontFamily: "Quicksand-SemiBold",
          fontWeight: "600",
          fontSize: Math.round(height * 0.82),
          lineHeight: Math.round(height * 1.05),
          color: "#03194B",
          letterSpacing: 0.2,
          includeFontPadding: false,
        },
        style,
      ]}
      accessibilityRole="text"
    >
      Havena
    </Text>
  );
}
