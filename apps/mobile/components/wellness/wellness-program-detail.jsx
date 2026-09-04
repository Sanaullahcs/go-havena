import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Lightbulb } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { WellnessTheme } from "../../constants/wellness-theme";
import {
  getWellnessVisual,
  getCourseThumbnailPair,
  SneakerIcon,
  WellnessHeroWave,
} from "../../constants/wellness-visuals";
import WellnessCoverImage from "./wellness-cover-image";
import WellnessHeroCircle, {
  WELLNESS_HERO_CIRCLE,
  WELLNESS_HERO_CIRCLE_END,
} from "./wellness-hero-circle";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";
import { rnShadow } from "../../utils/shadow";


const HERO_MEDIA = sw(132);
const HERO_IMAGE = WELLNESS_HERO_CIRCLE;
const HERO_IMAGE_END = WELLNESS_HERO_CIRCLE_END;
const HERO_IMAGE_TOP = (HERO_MEDIA - HERO_IMAGE) / 2;
const HERO_TITLE_END = sw(16) + HERO_IMAGE + sw(16);
const WAVE_H = sw(34);
const ICON = sw(40);
const THUMB = sw(80);
const STAT_ICON = sw(28);

const STAT_TONES = [
  { icon: "book-open", color: "#7C3AED" },
  { icon: "clock", color: "#14B8A6" },
  { icon: "check-circle", color: "#2563EB" },
  { icon: "play-circle", color: "#F59E0B" },
];

function programProgress(courses) {
  const totalLessons = courses.reduce((sum, c) => sum + (c.lessonCount || 0), 0);
  if (totalLessons > 0) {
    const done = courses.reduce(
      (sum, c) => sum + ((c.progressPercent || 0) / 100) * (c.lessonCount || 0),
      0,
    );
    return Math.round((done / totalLessons) * 100);
  }
  if (!courses.length) return 0;
  return Math.round(
    courses.reduce((sum, c) => sum + (c.progressPercent || 0), 0) / courses.length,
  );
}

function ProgramHero({
  categoryKey,
  categoryImageUrl,
  title,
  description,
  courseCount,
  progress,
}) {
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const visual = getWellnessVisual(categoryKey, categoryImageUrl);
  const Icon = visual.Icon;
  const cardWidth = screenWidth - sw(36);
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <View style={styles.heroCard}>
      <View style={[styles.heroMedia, { backgroundColor: visual.wash }]}>
        <WellnessHeroCircle
          source={visual.image}
          fallback={visual.fallbackImage}
          size={HERO_IMAGE}
          style={styles.heroImageCircle}
        />
        <WellnessHeroWave width={cardWidth} blobColor={visual.blob} height={WAVE_H} />
        <View style={styles.heroIcon}>
          {Icon === SneakerIcon ? (
            <SneakerIcon color={visual.accent} size={sf(18)} />
          ) : (
            <Icon size={sf(18)} color={visual.accent} strokeWidth={2} />
          )}
        </View>
        <View style={styles.heroCopy} pointerEvents="none">
          {title ? (
            <Text
              style={styles.heroTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {title}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.heroFooter}>
        {description ? (
          <Text style={styles.heroDescription} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
        <Text style={[styles.heroMeta, { color: visual.accent }]}>
          {t("wellness.courseCount", { count: courseCount })}
          <Text style={styles.heroMetaMuted}>
            {" · "}
            {t("wellness.percentComplete", {
              pct,
              defaultValue: t("wellness.percentDone", { pct }),
            })}
          </Text>
        </Text>
        <View style={styles.heroTrack}>
          {pct > 0 ? (
            <View style={[styles.heroFill, { width: `${pct}%`, backgroundColor: visual.accent }]} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ProgramStats({ stats }) {
  return (
    <View style={styles.statsCard}>
      {stats.map((item, index) => {
        const tone = STAT_TONES[index] ?? STAT_TONES[0];
        return (
          <View key={item.key} style={styles.statItem}>
            <Feather name={tone.icon} size={sf(16)} color={tone.color} />
            <Text style={[styles.statValue, { color: tone.color }]} numberOfLines={1}>
              {item.value}
            </Text>
            <Text style={styles.statLabel} numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ProgramCourseCard({
  index,
  categoryKey,
  categoryImageUrl,
  imageUrl,
  title,
  description,
  lessonCount,
  durationMin,
  progressPercent,
  isLast,
  onPress,
}) {
  const { t } = useTranslation();
  const visual = getWellnessVisual(categoryKey, categoryImageUrl);
  const thumb = getCourseThumbnailPair(title, categoryKey, imageUrl);
  const progress = Math.min(100, Math.max(0, progressPercent));
  const done = progress >= 100;
  const started = progress > 0 && !done;

  let statusLabel = null;
  let statusStyle = null;
  if (done) {
    statusLabel = t("wellness.completed");
    statusStyle = styles.statusDone;
  } else if (started) {
    statusLabel = t("wellness.inProgress");
    statusStyle = [styles.statusActive, { color: visual.accent, backgroundColor: visual.wash }];
  }

  const metaParts = [];
  if (lessonCount > 0) metaParts.push(t("wellness.lessonCount", { count: lessonCount }));
  if (durationMin > 0) metaParts.push(t("wellness.minDuration", { minutes: durationMin }));

  return (
    <View style={[styles.courseCard, isLast && styles.courseCardLast]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.coursePressed]}
      >
        <View style={styles.courseRow}>
          <View style={styles.thumbWrap}>
            <WellnessCoverImage
              source={thumb.image}
              fallback={thumb.fallbackImage}
              style={styles.thumb}
              resizeMode="cover"
            />
            <View style={[styles.numBadge, { borderColor: visual.accent }]}>
              <Text style={[styles.numBadgeText, { color: visual.accent }]}>{index + 1}</Text>
            </View>
          </View>

          <View style={styles.courseCopy}>
            <View style={styles.courseTitleRow}>
              <Text style={styles.courseTitle} numberOfLines={2}>
                {title}
              </Text>
              <Feather name={chevronForward()} size={sf(15)} color="#CBD5E1" />
            </View>
            {description ? (
              <Text style={styles.courseDescription} numberOfLines={2}>
                {description}
              </Text>
            ) : null}
            <View style={styles.courseMetaRow}>
              <View style={styles.courseMetaLeft}>
                <Feather name="play-circle" size={sf(13)} color={visual.accent} />
                {metaParts.length ? (
                  <Text style={styles.courseMeta} numberOfLines={1}>
                    {metaParts.join(" · ")}
                  </Text>
                ) : null}
              </View>
              {statusLabel ? (
                <Text style={[styles.statusPill, statusStyle]} numberOfLines={1}>
                  {statusLabel}
                </Text>
              ) : null}
            </View>
            {started ? (
              <View style={styles.courseTrack}>
                <View
                  style={[styles.courseFill, { width: `${progress}%`, backgroundColor: visual.accent }]}
                />
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function ProgramFooter({ progress, onExploreMore }) {
  const { t } = useTranslation();
  const pct = Math.min(100, Math.max(0, progress));

  let titleKey = "wellness.getStarted";
  let bodyKey = "wellness.getStartedBody";
  if (pct >= 100) {
    titleKey = "wellness.keepItUp";
    bodyKey = "wellness.keepItUpBody";
  } else if (pct > 0) {
    titleKey = "wellness.keepGoing";
    bodyKey = "wellness.keepGoingBody";
  }

  return (
    <View style={styles.footerCard}>
      <View style={styles.footerIcon}>
        <Lightbulb size={sf(16)} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <View style={styles.footerCopy}>
        <Text style={styles.footerTitle}>
          {t(titleKey, {
            defaultValue:
              titleKey === "wellness.keepItUp"
                ? "Keep it up!"
                : titleKey === "wellness.keepGoing"
                  ? "Keep going!"
                  : "Ready when you are",
          })}
        </Text>
        <Text style={styles.footerBody}>
          {t(bodyKey, {
            defaultValue:
              bodyKey === "wellness.keepItUpBody"
                ? "You've completed all courses in this program. Explore other wellness programs."
                : bodyKey === "wellness.keepGoingBody"
                  ? "You're making progress. Finish the next lesson when you're ready."
                  : "Start a course below to begin this wellness program.",
          })}
        </Text>
      </View>
      {onExploreMore ? (
        <Pressable onPress={onExploreMore} style={styles.exploreBtn} hitSlop={8}>
          <Text style={styles.exploreText}>
            {t("wellness.exploreMore", { defaultValue: "Explore more" })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Shared Wellness program detail layout — used for every category.
 * Content, imagery, accent color, courses, and progress come from props.
 */
export default function WellnessProgramDetail({
  categoryKey,
  categoryImageUrl,
  heroTitle,
  heroDescription,
  courses = [],
  onCoursePress,
  onExploreMore,
}) {
  const { t, i18n } = useTranslation();
  const progress = useMemo(() => programProgress(courses), [courses]);
  const totalMinutes = courses.reduce((sum, c) => sum + (c.durationMin || 0), 0);
  const totalLessons = courses.reduce((sum, c) => sum + (c.lessonCount || 0), 0);
  const coursesLabel = t("wellness.courses");
  const sectionLabel = i18n.language === "ar" ? coursesLabel : coursesLabel.toUpperCase();

  const stats = [
    { key: "courses", label: t("wellness.statCourses", { defaultValue: t("wellness.courses") }), value: String(courses.length) },
    { key: "time", label: t("wellness.statTotalTime", { defaultValue: "Total time" }), value: t("wellness.minDuration", { minutes: totalMinutes }) },
    { key: "done", label: t("wellness.statCompleted", { defaultValue: t("wellness.completed") }), value: `${progress}%` },
    { key: "lessons", label: t("wellness.statLessons", { defaultValue: t("wellness.lessons") }), value: String(totalLessons) },
  ];

  return (
    <View>
      <ProgramHero
        categoryKey={categoryKey}
        categoryImageUrl={categoryImageUrl}
        title={heroTitle}
        description={heroDescription}
        courseCount={courses.length}
        progress={progress}
      />

      {courses.length > 0 ? <ProgramStats stats={stats} /> : null}

      {courses.length > 0 ? (
        <View style={styles.coursesSection}>
          <Text style={styles.sectionLabel}>{sectionLabel}</Text>
          {courses.map((item, index) => (
            <ProgramCourseCard
              key={item.id}
              index={index}
              categoryKey={categoryKey}
              categoryImageUrl={categoryImageUrl}
              imageUrl={item.imageUrl}
              title={item.title}
              description={item.description}
              lessonCount={item.lessonCount}
              durationMin={item.durationMin}
              progressPercent={item.progressPercent}
              isLast={index === courses.length - 1}
              onPress={() => onCoursePress?.(item)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t("wellness.noCoursesYet")}</Text>
          <Text style={styles.emptyText}>
            {t("wellness.noCoursesDescription", { category: (heroTitle || "").toLowerCase() })}
          </Text>
        </View>
      )}

      {courses.length > 0 ? (
        <ProgramFooter progress={progress} onExploreMore={onExploreMore} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: WellnessTheme.surface,
    borderRadius: sw(22),
    overflow: "hidden",
    borderWidth: 1,
    borderColor: WellnessTheme.border,
  },
  heroMedia: {
    height: HERO_MEDIA,
    overflow: "hidden",
  },
  heroImageCircle: {
    position: "absolute",
    end: HERO_IMAGE_END,
    top: HERO_IMAGE_TOP,
    zIndex: 2,
  },
  heroIcon: {
    position: "absolute",
    start: sw(16),
    top: sw(14),
    width: ICON,
    height: ICON,
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 1 }, opacity: 0.08, radius: 3 }),
    elevation: 2,
  },
  heroCopy: {
    position: "absolute",
    start: sw(16),
    end: HERO_TITLE_END,
    top: sw(62),
    zIndex: 3,
  },
  heroTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    lineHeight: sf(22),
    fontWeight: "700",
    color: WellnessTheme.text,
    includeFontPadding: false,
  },
  heroDescription: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: WellnessTheme.textMuted,
    marginBottom: sw(12),
    includeFontPadding: false,
  },
  heroFooter: {
    paddingHorizontal: sw(16),
    paddingTop: sw(14),
    paddingBottom: sw(16),
    backgroundColor: WellnessTheme.surface,
  },
  heroMeta: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "600",
    includeFontPadding: false,
  },
  heroMetaMuted: {
    color: WellnessTheme.caption,
    fontFamily: Fonts.medium,
    fontWeight: "500",
  },
  heroTrack: {
    height: sw(5),
    borderRadius: 999,
    backgroundColor: "#E8EEF5",
    overflow: "hidden",
    marginTop: sw(10),
  },
  heroFill: {
    height: "100%",
    borderRadius: 999,
  },
  statsCard: {
    marginTop: sw(14),
    backgroundColor: WellnessTheme.surface,
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    paddingVertical: sw(14),
    paddingHorizontal: sw(8),
    flexDirection: "row",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(20),
    fontWeight: "700",
    marginTop: sw(6),
    includeFontPadding: false,
  },
  statLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: WellnessTheme.caption,
    marginTop: sw(2),
    includeFontPadding: false,
  },
  coursesSection: {
    marginTop: sw(18),
  },
  sectionLabel: {
    marginBottom: sw(10),
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    letterSpacing: 0.8,
    color: WellnessTheme.caption,
    fontWeight: "600",
    includeFontPadding: false,
  },
  courseCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    padding: sw(16),
    marginBottom: sw(12),
  },
  courseCardLast: {
    marginBottom: sw(12),
  },
  coursePressed: {
    opacity: 0.92,
  },
  courseRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  thumbWrap: {
    width: THUMB,
    height: THUMB,
    borderRadius: sw(14),
    overflow: "hidden",
    backgroundColor: "#E8EEF5",
    flexShrink: 0,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: sw(14),
  },
  numBadge: {
    position: "absolute",
    start: sw(6),
    top: sw(6),
    minWidth: sw(20),
    height: sw(20),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(5),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
  },
  numBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    fontWeight: "700",
    includeFontPadding: false,
  },
  courseCopy: {
    flex: 1,
    minWidth: 0,
    marginStart: sw(12),
    paddingTop: sw(1),
  },
  courseTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
  },
  courseTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    fontWeight: "700",
    color: WellnessTheme.text,
    includeFontPadding: false,
  },
  courseDescription: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: WellnessTheme.textMuted,
    marginTop: sw(4),
    includeFontPadding: false,
  },
  courseMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    marginTop: sw(8),
  },
  courseMetaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    flex: 1,
    minWidth: 0,
  },
  courseMeta: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: WellnessTheme.caption,
    includeFontPadding: false,
  },
  statusPill: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(13),
    fontWeight: "600",
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
    borderRadius: 999,
    overflow: "hidden",
    includeFontPadding: false,
  },
  statusDone: {
    color: "#0F766E",
    backgroundColor: "#D1FAF5",
  },
  statusActive: {
    paddingHorizontal: sw(8),
  },
  courseTrack: {
    height: sw(3),
    borderRadius: 999,
    backgroundColor: WellnessTheme.progressTrack,
    overflow: "hidden",
    marginTop: sw(10),
  },
  courseFill: {
    height: "100%",
    borderRadius: 999,
  },
  footerCard: {
    marginTop: sw(6),
    marginBottom: 0,
    backgroundColor: "#F5F3FF",
    borderRadius: sw(18),
    padding: sw(14),
    flexDirection: "row",
    alignItems: "center",
  },
  footerIcon: {
    width: STAT_ICON + sw(8),
    height: STAT_ICON + sw(8),
    borderRadius: sw(12),
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
  footerCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: sw(10),
  },
  footerTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "700",
    color: "#5B21B6",
    includeFontPadding: false,
  },
  footerBody: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#6D28D9",
    marginTop: sw(2),
    includeFontPadding: false,
  },
  exploreBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderWidth: 1,
    borderColor: "#EDE9FE",
    flexShrink: 0,
  },
  exploreText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontWeight: "600",
    color: "#6D28D9",
    includeFontPadding: false,
  },
  empty: {
    marginTop: sw(24),
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    backgroundColor: "#FFFFFF",
    padding: sw(24),
    alignItems: "center",
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    fontWeight: "700",
    color: WellnessTheme.text,
    marginBottom: sw(6),
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: WellnessTheme.textMuted,
    textAlign: "center",
  },
});
