import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import ThemedIconBox from "../ui/themed-icon-box";
import { Fonts } from "../../constants/font";
import { MarketplaceTheme } from "../../constants/marketplace-theme";
import { sf, sw } from "../../utils/responsive";
import { rnShadow } from "../../utils/shadow";
import { chevronForward } from "../../utils/rtl";

export default function CommunityListingsBanner({ onPress }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.touch, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t("marketplace.communityListings")}
    >
      <View style={styles.banner}>
        <ThemedIconBox
          name="users"
          size="md"
          color={MarketplaceTheme.navy}
          backgroundColor={MarketplaceTheme.mint}
        />

        <View style={styles.textWrap}>
          <Text style={styles.title}>{t("marketplace.communityListings")}</Text>
          <Text style={styles.subtitle}>{t("marketplace.communityListingsSub")}</Text>
        </View>

        <Feather name={chevronForward()} size={sf(16)} color={MarketplaceTheme.caption} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    borderRadius: sw(14),
    marginBottom: sw(4),
  },
  pressed: {
    opacity: 0.88,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(14),
    backgroundColor: MarketplaceTheme.surface,
    borderRadius: sw(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MarketplaceTheme.border,
    ...(Platform.OS === "ios"
      ? {
          ...rnShadow({ color: MarketplaceTheme.navy, offset: { width: 0, height: 2 }, opacity: 0.04, radius: 6 }),
        }
      : { elevation: 1 }),
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: MarketplaceTheme.text,
    fontWeight: "600",
  },
  subtitle: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: MarketplaceTheme.textMuted,
  },
});
