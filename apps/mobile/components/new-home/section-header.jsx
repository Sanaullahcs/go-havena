import { Pressable, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

export default function HomeSectionHeader({ label, onPress, style }) {
  const { t } = useTranslation();

  return (
    <View style={[homeStyles.sectionHeader, style]}>
      <Text style={[homeStyles.sectionLabel, localStyles.label]} numberOfLines={1}>
        {label}
      </Text>
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={localStyles.viewAllBtn}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={localStyles.viewAllText}>{t("common.viewAll")}</Text>
          <Feather name={chevronForward()} size={sf(13)} color={T.teal} />
        </Pressable>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  label: {
    flex: 1,
    flexShrink: 1,
    marginEnd: sw(8),
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: sw(2),
    paddingVertical: sw(4),
    paddingStart: sw(8),
  },
  viewAllText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.teal,
    fontWeight: "600",
  },
});
