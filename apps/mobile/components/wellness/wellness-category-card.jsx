import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { getWellnessCategoryMeta, WellnessTheme } from "../../constants/wellness-theme";
import WellnessCategoryIcon from "./wellness-category-icon";
import WellnessProgressBar from "./wellness-progress-bar";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

/** Hub pillar card — white surface, soft accent icon only. */
export default function WellnessCategoryCard({
  categoryKey,
  imageUrl,
  title,
  subtitle,
  progressPercent = 0,
  progressLabel,
  coursesLabel,
  onPress,
  isLast = false,
}) {
  const meta = getWellnessCategoryMeta(categoryKey);
  const progress = Math.min(100, Math.max(0, progressPercent));

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[styles.touch, isLast && styles.touchLast]}
    >
      <View style={styles.card}>
        <View style={[styles.accent, { backgroundColor: meta.color }]} />
        <View style={styles.inner}>
          <View style={styles.cardTop}>
            <WellnessCategoryIcon categoryKey={categoryKey} imageUrl={imageUrl} size={sw(40)} />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.cardSubtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <View style={styles.chevronWrap}>
              <Feather name={chevronForward()} size={sf(16)} color={WellnessTheme.caption} />
            </View>
          </View>

          <WellnessProgressBar
            categoryKey={categoryKey}
            progress={progress}
            height={4}
            style={styles.bar}
          />

          <View style={styles.cardFooter}>
            {coursesLabel ? (
              <Text style={styles.footerMuted}>{coursesLabel}</Text>
            ) : (
              <View />
            )}
            {progressLabel ? (
              <Text style={[styles.footerAccent, { color: meta.color }]}>
                {progressLabel}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touch: {
    marginBottom: sw(12),
  },
  touchLast: {
    marginBottom: 0,
  },
  card: {
    backgroundColor: WellnessTheme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    overflow: "hidden",
    flexDirection: "row",
  },
  accent: {
    width: 3,
  },
  inner: {
    flex: 1,
    padding: sw(14),
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardText: {
    flex: 1,
    minWidth: 0,
    marginStart: sw(12),
    marginEnd: sw(8),
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(19),
    fontWeight: "700",
    color: WellnessTheme.text,
    includeFontPadding: false,
  },
  cardSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: WellnessTheme.textMuted,
    marginTop: 2,
    includeFontPadding: false,
  },
  chevronWrap: {
    width: sw(24),
    height: sw(24),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bar: {
    marginTop: sw(12),
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: sw(8),
  },
  footerMuted: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    lineHeight: sf(14),
    color: WellnessTheme.caption,
    fontWeight: "500",
    includeFontPadding: false,
  },
  footerAccent: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    lineHeight: sf(14),
    fontWeight: "700",
    includeFontPadding: false,
  },
});
