import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Colors, Shadows } from "../../constants/tokens";
import { ScreenBrand } from "../../constants/screen-brand";

/** Havena mark — pass tileColor={ScreenBrand.primary} on login/signup. */
export default function AuthLogo({
  size = 62,
  style,
  compact = false,
  variant = "auth",
  tileColor,
}) {
  const radius = Math.round(size * (12 / 36));
  const inset = Math.round(size * 0.14);
  const iconSize = Math.round(size * 0.42);
  const authTile = tileColor ?? Colors.brandPrimary;
  const houseStroke = variant === "splash" ? Colors.brandPrimaryDeep : "#FFFFFF";

  const houseIcon = (
    <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 9l9-6 9 6v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"
        stroke={houseStroke}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M9 21V12h6v9"
        stroke={houseStroke}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );

  const tileStyle = {
    width: size,
    height: size,
    borderRadius: radius,
  };

  const iconWrap = (
    <View style={[styles.iconWrap, { padding: inset }]}>
      {houseIcon}
    </View>
  );

  if (variant === "splash") {
    return (
      <View
        style={[
          compact ? styles.markCompact : styles.mark,
          styles.splashMark,
          Shadows.button,
          tileStyle,
          style,
        ]}
        accessibilityLabel="Havena logo"
      >
        {iconWrap}
      </View>
    );
  }

  return (
    <View
      style={[
        compact ? styles.markCompact : styles.mark,
        { backgroundColor: authTile },
        tileColor ? ScreenBrand.buttonShadow : Shadows.button,
        tileStyle,
        style,
      ]}
      accessibilityLabel="Havena logo"
    >
      {iconWrap}
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
  splashMark: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
