import { Pressable, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

export default function HomeSectionHeader({ label, onPress, style }) {
  return (
    <View style={[homeStyles.sectionHeader, style]}>
      <Text style={homeStyles.sectionLabel}>{label}</Text>
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={localStyles.viewAllBtn}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={localStyles.viewAllText}>View All</Text>
          <Feather name="chevron-right" size={sf(13)} color={T.teal} />
        </Pressable>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(2),
    paddingVertical: sw(4),
    paddingLeft: sw(8),
  },
  viewAllText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.teal,
    fontWeight: "600",
  },
});
