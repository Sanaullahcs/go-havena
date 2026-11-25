import { Pressable, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { homeStyles } from "../../constants/home-styles";
import { HomeTheme as T } from "../../constants/home-theme";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

export default function HomeSectionHeader({ label, onPress, style }) {
  const { t, i18n } = useTranslation();
  const arabic = String(i18n.language || "").startsWith("ar");

  return (
    <View style={[homeStyles.sectionHeader, style]}>
      <Text
        style={[homeStyles.sectionLabel, localStyles.label, arabic && localStyles.labelAr]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={localStyles.viewAllBtn}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={localStyles.viewAllText} numberOfLines={1}>
            {t("common.viewAll")}
          </Text>
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
  labelAr: {
    textTransform: "none",
    letterSpacing: 0,
    fontSize: sf(16),
    lineHeight: sf(24),
    writingDirection: "rtl",
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
    lineHeight: sf(18),
    color: T.teal,
    fontWeight: "600",
  },
});
