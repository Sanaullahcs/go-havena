import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { ionChevronForward } from "../../utils/rtl";
import { Colors, Layout } from "../../constants/tokens";
import { useRouter } from "expo-router";
import { sw, sf } from "../../utils/responsive";

const PALETTE = [
  { tint: "#0A2A43", soft: "#D1FAF5" },
  { tint: "#0F766E", soft: "#F0FDFA" },
  { tint: "#C2410C", soft: "#FFF7ED" },
];

const FALLBACK_ACHIEVEMENTS = [
  { id: 1, titleKey: "profile.fallbackBadges.firstSteps", icon: "footsteps-outline" },
  { id: 2, titleKey: "profile.fallbackBadges.consistency", icon: "flame-outline" },
  { id: 3, titleKey: "profile.fallbackBadges.weekWarrior", icon: "trophy-outline" },
];

export default function RecentAchievements({ achievements }) {
  const router = useRouter();
  const { t } = useTranslation();

  const displayItems = useMemo(() => {
    const recent = achievements?.recent ?? [];
    const source =
      recent.length >= 3
        ? recent.slice(0, 3)
        : [...recent, ...FALLBACK_ACHIEVEMENTS].slice(0, 3);

    return source.map((item, index) => ({
      id: item.id ?? item.key ?? index + 1,
      title: item.titleKey ? t(item.titleKey) : item.title,
      icon: item.icon || "ribbon-outline",
      ...PALETTE[index % PALETTE.length],
    }));
  }, [achievements, t]);

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{t("profile.achievements")}</Text>
        <Pressable
          onPress={() => router.push("/screens/achievements")}
          hitSlop={8}
          style={styles.viewAllBtn}
        >
          <Text style={styles.viewAll} numberOfLines={1}>
            {t("common.seeAll")}
          </Text>
          <Ionicons name={ionChevronForward()} size={sf(12)} color={Colors.brandPrimaryDeep} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {displayItems.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={[styles.iconWrap, { backgroundColor: item.soft }]}>
              <Ionicons name={item.icon} size={sf(20)} color={item.tint} />
            </View>
            <Text style={styles.achievementTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(22),
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(12),
  },
  heading: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(12),
    lineHeight: sf(16),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Colors.brandPrimary,
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  viewAll: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(12),
    color: Colors.brandPrimaryDeep,
  },
  pressed: {
    opacity: 0.7,
  },
  grid: {
    flexDirection: "row",
    gap: sw(10),
  },
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.06)",
    paddingVertical: sw(14),
    paddingHorizontal: sw(8),
    alignItems: "center",
    gap: sw(8),
  },
  iconWrap: {
    width: sw(42),
    height: sw(42),
    borderRadius: sw(13),
    alignItems: "center",
    justifyContent: "center",
  },
  achievementTitle: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(11),
    lineHeight: sf(14),
    color: Colors.textPrimary,
    textAlign: "center",
  },
});
