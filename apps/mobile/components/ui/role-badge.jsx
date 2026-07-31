import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Colors } from "../../constants/tokens";
import { Fonts } from "../../constants/font";

export default function RoleBadge({ role = "resident" }) {
  const isAdmin = role === "admin";

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: isAdmin ? Colors.roleAdminBg : Colors.roleResidentBg },
      ]}
    >
      <Image
        source={
          isAdmin
            ? require("../../assets/images/admin-icon.png")
            : require("../../assets/images/resident-new.png")
        }
        style={styles.icon}
        contentFit="contain"
      />
      <Text
        style={[
          styles.text,
          { color: isAdmin ? Colors.roleAdminText : Colors.roleResidentText },
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
  icon: { width: 16, height: 16 },
  text: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    textTransform: "capitalize",
  },
});
