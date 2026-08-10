import { StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { Colors, Shadows } from "../../constants/tokens";
import { ScreenBrand } from "../../constants/screen-brand";

/** Havena H-monogram mark — pass tileColor={ScreenBrand.primary} on login/signup. */
export default function AuthLogo({
  size = 62,
  style,
  compact = false,
  variant = "auth",
  tileColor,
}) {
  const radius = Math.round(size * (13 / 48));
  const authTile = tileColor ?? Colors.brandPrimary;
  const stroke = variant === "splash" ? Colors.brandPrimaryDeep : "#FFFFFF";
  const fill = variant === "splash" ? "#FFFFFF" : authTile;

  const mark = (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect width="48" height="48" rx="13" fill={fill} />
      <Path
        d="M14 20 L24 12 L34 20"
        fill="none"
        stroke={stroke}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M17 36 V22.5 M31 36 V22.5 M17 28.5 H31"
        fill="none"
        stroke={stroke}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );

  if (variant === "splash") {
    return (
      <View
        style={[
          compact ? styles.markCompact : styles.mark,
          Shadows.button,
          { width: size, height: size, borderRadius: radius },
          style,
        ]}
        accessibilityLabel="Havena logo"
      >
        {mark}
      </View>
    );
  }

  return (
    <View
      style={[
        compact ? styles.markCompact : styles.mark,
        tileColor ? ScreenBrand.buttonShadow : Shadows.button,
        { width: size, height: size, borderRadius: radius, overflow: "hidden" },
        style,
      ]}
      accessibilityLabel="Havena logo"
    >
      {mark}
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
