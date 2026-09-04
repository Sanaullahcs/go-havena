import React from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Target } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { WellnessTheme } from "../../constants/wellness-theme";
import { HomeTheme as T } from "../../constants/home-theme";
import {
  getWellnessVisual,
  getCourseThumbnailPair,
  WellnessHeroWave,
} from "../../constants/wellness-visuals";
import WellnessHeroCircle, {
  WELLNESS_HERO_CIRCLE,
  WELLNESS_HERO_CIRCLE_END,
} from "./wellness-hero-circle";
import { sf, sw } from "../../utils/responsive";

const WAVE_H = sw(34);
const ICON = sw(40);
const IMAGE = WELLNESS_HERO_CIRCLE;
const TITLE_SIZE = sf(14);
const TITLE_LINE = sf(20);

/** Wrap on word boundaries so earlier lines share one right edge; last line may be shorter. */
function wrapBalancedTitle(text, maxWidth, fontSize) {
  const source = String(text || "").trim();
  if (!source) return source;
  const words = source.split(/\s+/);
  const maxChars = Math.max(16, Math.floor(maxWidth / (fontSize * 0.5)));
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function HeroStat({ icon, value, label, color }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        <Feather name={icon} size={sf(13)} color={color} />
        <Text style={[styles.statValue, { color }]}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Course hero — image, description, stats, and progress. Shared by every course. */
export default function WellnessCourseSummary({
  categoryKey,
  categoryImageUrl,
  courseImageUrl,
  courseTitle,
  description,
  durationMin = 0,
  lessonCount = 0,
  progress = 0,
}) {
  const { t, i18n } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const visual = getWellnessVisual(categoryKey, categoryImageUrl);
  const thumb = getCourseThumbnailPair(courseTitle, categoryKey, courseImageUrl);
  const cardWidth = screenWidth - sw(36);
  const copyWidth = Math.max(sw(140), cardWidth - sw(32) - IMAGE - sw(12));
  const rawTitle = description || t("wellness.defaultLessonDescription");
  const titleText =
    i18n.dir() === "rtl" ? rawTitle : wrapBalancedTitle(rawTitle, copyWidth, TITLE_SIZE);
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <View style={styles.card}>
      <View style={[styles.heroMedia, { backgroundColor: visual.wash }]}>
        <WellnessHeroWave width={cardWidth} blobColor={visual.blob} height={WAVE_H} />
        <View style={styles.heroBody}>
          <View style={styles.heroTop}>
            <View style={styles.heroCopy}>
              <View style={styles.heroIcon}>
                <Target size={sf(18)} color={T.teal} strokeWidth={2.2} />
              </View>
              <Text
                style={[styles.heroDescription, { width: copyWidth }]}
                numberOfLines={5}
              >
                {titleText}
              </Text>
            </View>
            <WellnessHeroCircle
              source={thumb.image}
              fallback={thumb.fallbackImage}
              size={IMAGE}
              style={{ marginEnd: WELLNESS_HERO_CIRCLE_END - sw(16) }}
            />
          </View>
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
  heroBody: {
    zIndex: 2,
    paddingStart: sw(16),
    paddingEnd: sw(16),
    paddingTop: sw(14),
    paddingBottom: sw(40),
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroIcon: {
    width: ICON,
    height: ICON,
    borderRadius: sw(12),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(10),
  },
  heroDescription: {
    fontFamily: Fonts.bold,
    fontSize: TITLE_SIZE,
    lineHeight: TITLE_LINE,
    fontWeight: "700",
    color: WellnessTheme.text,
    textAlign: "left",
    includeFontPadding: false,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: sw(14),
  },
  stat: {
    flex: 1,
    minWidth: 0,
    paddingEnd: sw(6),
  },
  statTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
  },
  statValue: {
    flexShrink: 1,
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
