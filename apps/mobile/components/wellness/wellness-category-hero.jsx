import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { getWellnessCategoryMeta, WellnessTheme } from "../../constants/wellness-theme";
import WellnessCategoryIcon from "./wellness-category-icon";
import WellnessProgressBar from "./wellness-progress-bar";
import { sf, sw } from "../../utils/responsive";

/** Minimal category summary — white card, soft accent icon, no gradients. */
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
      <View style={styles.row}>
        <WellnessCategoryIcon categoryKey={categoryKey} size={sw(44)} />
        <View style={styles.copy}>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: WellnessTheme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    padding: sw(16),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    marginStart: sw(14),
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: WellnessTheme.textMuted,
    includeFontPadding: false,
  },
  meta: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "600",
    marginTop: sw(6),
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
