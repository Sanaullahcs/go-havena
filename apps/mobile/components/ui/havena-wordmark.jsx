import { Image } from "react-native";

const WORDMARK = require("../../assets/images/havena-wordmark.png");
const ASPECT = 741 / 160;

/** Official Havena wordmark only — does not include the infinity mark. */
export default function HavenaWordmark({ height = 28, style }) {
  return (
    <Image
      source={WORDMARK}
      style={[{ height, width: Math.round(height * ASPECT) }, style]}
      resizeMode="contain"
      accessibilityLabel="Havena"
    />
  );
}
