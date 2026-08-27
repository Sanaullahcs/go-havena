import { Image, StyleSheet, View } from "react-native";

const LOGO = require("../../assets/images/splash-icon.png");

/** Havena infinity mark — used on splash, welcome, and auth screens. */
export default function AuthLogo({
  size = 62,
  style,
  compact = false,
  variant: _variant = "auth",
}) {
  return (
    <View
      style={[
        compact ? styles.markCompact : styles.mark,
        {
          width: size,
          height: size,
          backgroundColor: "transparent",
        },
        style,
      ]}
      accessibilityLabel="Havena logo"
    >
      <Image
        source={LOGO}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  markCompact: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
});
