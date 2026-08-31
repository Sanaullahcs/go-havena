import { Text } from "react-native";
import { Fonts } from "../../constants/font";

/** Havena wordmark — same Poppins face as the rest of the product. */
export default function HavenaWordmark({ height = 28, style }) {
  return (
    <Text
      style={[
        {
          fontFamily: Fonts.semiBold,
          fontWeight: "600",
          fontSize: Math.round(height * 0.82),
          lineHeight: Math.round(height * 1.05),
          color: "#03194B",
          letterSpacing: 0.15,
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
