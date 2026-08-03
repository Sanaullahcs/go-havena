import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { homeStyles } from "../../constants/home-styles";
import { HomeTheme } from "../../constants/home-theme";
import { sf } from "../../utils/responsive";

export default function HomeSectionHeader({
  label,
  onPress,
  style,
  viewAllLabel = "View all",
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[homeStyles.sectionHeader, style]}
      accessibilityRole="button"
      disabled={!onPress}
    >
      <Text style={homeStyles.sectionLabel}>{label}</Text>
      {onPress ? (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={homeStyles.viewAll}>{viewAllLabel}</Text>
          <Feather
            name="chevron-right"
            size={sf(14)}
            color={HomeTheme.mediumGray}
            style={{ marginLeft: 2 }}
          />
        </View>
      ) : (
        <View style={homeStyles.sectionArrow}>
          <Feather name="chevron-right" size={sf(16)} color={HomeTheme.primaryTeal} />
        </View>
      )}
    </Pressable>
  );
}
