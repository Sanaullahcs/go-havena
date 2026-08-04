import { View, Text, StyleSheet } from "react-native";
import { Fonts } from "../../constants/font";
import RoleIcon from "./role-icon";
import { HavenaColors as C } from "../../constants/color-scheme";

export default function RoleBadge({ role = "resident" }) {
  const isAdmin = role === "admin";

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: isAdmin ? "#D1FAF5" : "rgba(0, 201, 136, 0.12)",
          borderWidth: 1,
          borderColor: isAdmin ? "rgba(20, 184, 166, 0.28)" : "rgba(0, 201, 136, 0.28)",
        },
      ]}
    >
      <RoleIcon role={role} size="sm" />
      <Text
        style={[
          styles.text,
          { color: isAdmin ? C.primary.darkNavy : "#047857" },
        ]}
      >
        {isAdmin ? "Community Admin" : "Resident"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 3,
    marginBottom: 4,
  },
  text: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    textTransform: "capitalize",
  },
});
