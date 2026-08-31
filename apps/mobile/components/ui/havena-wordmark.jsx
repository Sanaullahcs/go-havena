import { Image } from "react-native";

const WORDMARK = require("../../assets/images/havena-wordmark.png");
const ASPECT = 741 / 160;

/** Standalone “Havena” wordmark from the brand reference — icon stays separate. */
export default function HavenaWordmark({ height = 28, style, color }) {
  return (
    <Image
      source={WORDMARK}
      resizeMode="contain"
      accessibilityLabel="Havena"
      tintColor={color}
      style={[{ height, width: Math.round(height * ASPECT) }, color ? { tintColor: color } : null, style]}
    />
  );
}
