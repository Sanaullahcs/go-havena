import React from "react";
import { View, Text, Image, StyleSheet, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Target } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { WellnessTheme } from "../../constants/wellness-theme";
import { HomeTheme as T } from "../../constants/home-theme";
import {
  getWellnessVisual,
  getCourseThumbnail,
  WellnessHeroWave,
} from "../../constants/wellness-visuals";
import { sf, sw } from "../../utils/responsive";

const WAVE_H = sw(34);
const ICON = sw(40);
const IMAGE = sw(128);

function HeroStat({ icon, value, label, color }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        <Feather name={icon} size={sf(13)} color={color} />
        <Text style={[styles.statValue, { color }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Course hero — image, description, stats, and progress. Shared by every course. */
export default function WellnessCourseSummary({
  categoryKey,
  courseTitle,
  description,
  durationMin = 0,
  lessonCount = 0,
  progress = 0,
}) {
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const visual = getWellnessVisual(categoryKey);
  const thumb = getCourseThumbnail(courseTitle, categoryKey);
  const cardWidth = screenWidth - sw(36);
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <View style={styles.card}>
      <View style={[styles.heroMedia, { backgroundColor: visual.wash }]}>
        <Image source={thumb} style={styles.heroImage} resizeMode="cover" />
        <WellnessHeroWave width={cardWidth} blobColor={visual.blob} height={WAVE_H} />
        <View style={styles.heroIcon}>
          <Target size={sf(18)} color={T.teal} strokeWidth={2.2} />
        </View>
        <View style={styles.heroCopy}>
          {description ? (
            <Text style={styles.heroDescription} numberOfLines={4}>
              {description}
            </Text>
          ) : (
            <Text style={styles.heroDescription} numberOfLines={4}>
              {t("wellness.defaultLessonDescription")}
            </Text>
          )}
          <View style={styles.statRow}>
            <HeroStat
              icon="clock"
              value={t("wellness.minDuration", { minutes: durationMin })}
              label={t("wellness.statTotalTime", { defaultValue: "Total time" })}
              color={T.navy}
            />
            <HeroStat
              icon="layers"
              value={t("wellness.lessonCount", { count: lessonCount })}
              label={t("wellness.statLessons", { defaultValue: t("wellness.lessons") })}
              color={T.teal}
            />
            <HeroStat
              icon="trending-up"
              value={`${pct}%`}
              label={t("wellness.statProgress", { defaultValue: "Progress" })}
              color={T.deepTeal}
            />
          </View>
        </View>
      </View>

      <View style={styles.progressBlock}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>
            {t("wellness.courseProgress", { defaultValue: "Course Progress" })}
          </Text>
          <Text style={styles.progressPct}>
            {t("wellness.percentCompleted", {
              pct,
              defaultValue: `${pct}% completed`,
            })}
          </Text>
        </View>
        <View style={styles.track}>
          {pct > 0 ? <View style={[styles.fill, { width: `${pct}%` }]} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: WellnessTheme.surface,
    borderRadius: sw(22),
    overflow: "hidden",
    borderWidth: 1,
    borderColor: WellnessTheme.border,
  },
  heroMedia: {
    overflow: "hidden",
    minHeight: sw(168),
  },
  heroImage: {
    position: "absolute",
    end: sw(-4),
    top: sw(16),
    width: IMAGE,
    height: IMAGE,
    borderRadius: IMAGE / 2,
    zIndex: 1,
  },
  heroIcon: {
    position: "absolute",
    start: sw(16),
    top: sw(14),
    width: ICON,
    height: ICON,
    borderRadius: sw(12),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  heroCopy: {
    paddingStart: sw(16),
    paddingEnd: sw(118),
    paddingTop: sw(64),
    paddingBottom: sw(42),
    zIndex: 2,
  },
  heroDescription: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(22),
    fontWeight: "700",
    color: WellnessTheme.text,
    includeFontPadding: false,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: sw(4),
    gap: sw(10),
  },
  stat: {
    flex: 1,
    minWidth: 0,
  },
  statTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
  },
  statValue: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    fontWeight: "700",
    includeFontPadding: false,
  },
  statLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: WellnessTheme.caption,
    marginTop: sw(3),
    marginStart: sw(18),
    includeFontPadding: false,
  },
  progressBlock: {
    backgroundColor: WellnessTheme.surface,
    paddingHorizontal: sw(16),
    paddingTop: sw(14),
    paddingBottom: sw(16),
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    marginBottom: sw(10),
  },
  progressTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "600",
    color: WellnessTheme.text,
    includeFontPadding: false,
  },
  progressPct: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "600",
    color: T.deepTeal,
    includeFontPadding: false,
  },
  track: {
    height: sw(6),
    borderRadius: 999,
    backgroundColor: T.mint,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: T.teal,
  },
});
