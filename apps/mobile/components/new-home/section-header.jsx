import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { homeStyles } from "../../constants/home-styles";

export default function HomeSectionHeader({ label, onPress, style }) {
  return (
    <Pressable
      onPress={onPress}
      style={[homeStyles.sectionHeader, style]}
      accessibilityRole="button"
      disabled={!onPress}
    >
      <Text style={homeStyles.sectionLabel}>{label}</Text>
      <View style={homeStyles.sectionArrow}>
        <Feather name="chevron-right" size={18} color="#14B8A6" />
      </View>
    </Pressable>
  );
}
