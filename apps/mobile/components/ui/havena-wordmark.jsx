import { Text } from "react-native";

/**
 * Havena wordmark. Drawn as text so the last letter is never cropped
 * by the source image or a shrinking flex row.
 */
export default function HavenaWordmark({ height = 28, style, color = "#1B4F8A" }) {
  const fontSize = Math.max(15, Math.round(height * 0.78));
  const lineHeight = Math.ceil(fontSize * 1.35);

  return (
    <Text
      accessibilityRole="text"
      accessibilityLabel="Havena"
      allowFontScaling
      style={[
        {
          fontFamily: "Quicksand-Bold",
          fontSize,
          lineHeight,
          color,
          letterSpacing: -0.3,
          includeFontPadding: true,
          overflow: "visible",
          flexShrink: 0,
          paddingHorizontal: 2,
        },
        style,
      ]}
    >
      Havena
    </Text>
  );
}
