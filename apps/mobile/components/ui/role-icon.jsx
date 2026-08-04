import { View, StyleSheet } from "react-native";
import { Building, UserRound } from "lucide-react-native";
import { HavenaColors as C } from "../../constants/color-scheme";

export const ROLE_ICON_THEME = {
  admin: {
    iconBg: "#D1FAF5",
    iconColor: C.primary.teal,
  },
  resident: {
    iconBg: "#F0FDF4",
    iconColor: C.primary.vibrantGreen,
  },
};

const SIZES = {
  sm: { box: 22, icon: 13, radius: 7 },
  md: { box: 40, icon: 18, radius: 12 },
};

/** Havena-themed Lucide icon for admin / resident roles. */
export default function RoleIcon({ role = "resident", size = "md", bare = false, style }) {
  const variant = role === "admin" ? "admin" : "resident";
  const theme = ROLE_ICON_THEME[variant];
  const Icon = variant === "admin" ? Building : UserRound;
  const dim = SIZES[size] ?? SIZES.md;
  const showBg = !bare && size !== "sm";

  return (
    <View
      style={[
        styles.wrap,
        showBg && {
          width: dim.box,
          height: dim.box,
          borderRadius: dim.radius,
          backgroundColor: theme.iconBg,
        },
        style,
      ]}
    >
      <Icon size={dim.icon} color={theme.iconColor} strokeWidth={1.75} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
