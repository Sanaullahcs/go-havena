import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { getWellnessCategoryMeta, WellnessTheme } from "../../constants/wellness-theme";
import WellnessCategoryIcon from "./wellness-category-icon";
import WellnessProgressBar from "./wellness-progress-bar";
import { sf, sw } from "../../utils/responsive";

/** Minimal category summary — colored hero band with title, white body below. */
export default function WellnessCategoryHero({
  categoryKey,
  subtitle,
  courseCount = 0,
  avgProgress = 0,
}) {
  const { t } = useTranslation();
  const meta = getWellnessCategoryMeta(categoryKey);
  const progress = Math.min(100, Math.max(0, avgProgress));

  return (
    <View style={styles.card}>
      <View style={[styles.hero, { backgroundColor: meta.bg }]}>
        <WellnessCategoryIcon categoryKey={categoryKey} size={sw(44)} soft={false} />
        {subtitle ? (
          <Text style={styles.title} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.meta}>
          <Text style={{ color: meta.color }}>
            {t("wellness.courseCount", { count: courseCount })}
          </Text>
          <Text style={styles.metaMuted}> · {t("wellness.percentDone", { pct: progress })}</Text>
        </Text>
        <WellnessProgressBar
          categoryKey={categoryKey}
          progress={progress}
          height={4}
          style={styles.bar}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: WellnessTheme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    overflow: "hidden",
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sw(16),
    paddingVertical: sw(16),
    gap: sw(12),
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(21),
    fontWeight: "700",
    color: WellnessTheme.text,
    includeFontPadding: false,
  },
  body: {
    paddingHorizontal: sw(16),
    paddingTop: sw(12),
    paddingBottom: sw(16),
    backgroundColor: WellnessTheme.surface,
  },
  meta: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "600",
    includeFontPadding: false,
  },
  metaMuted: {
    color: WellnessTheme.caption,
    fontFamily: Fonts.medium,
    fontWeight: "500",
  },
  bar: {
    marginTop: sw(10),
  },
});
