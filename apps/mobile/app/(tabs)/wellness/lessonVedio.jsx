import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../../constants/font";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import LazyVideoPlayer from "../../../components/ui/lazy-video";
import WellnessScreenHeader from "../../../components/wellness/wellness-screen-header";
import {
  fetchLesson,
  fetchCourse,
  completeWellnessLesson,
} from "../../../services/wellness-api";
import { WellnessTheme } from "../../../constants/wellness-theme";
import { HomeTheme as T } from "../../../constants/home-theme";
import { useApiAction } from "../../../hooks/use-api-action";
import { sf, sw } from "../../../utils/responsive";
import { arrowBack, arrowForward } from "../../../utils/rtl";
import { rnShadow } from "../../../utils/shadow";
import { useTranslation } from "react-i18next";

const cardShadow = rnShadow({
  color: "#0F172A",
  offset: { width: 0, height: 2 },
  opacity: 0.06,
  radius: 10,
  elevation: 2,
});

export default function LessonVedio() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { t } = useTranslation();
  const navBtnWidth = Math.floor((windowWidth - sw(18) * 2 - sw(12)) / 2);
  const { title, subTitle, lessonId, categoryKey: categoryKeyParam } = useLocalSearchParams();
  const { showFailure } = useApiAction();
  const [lesson, setLesson] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [loading, setLoading] = useState(Boolean(lessonId));
  const [marking, setMarking] = useState(false);
  const lessonRef = useRef(null);
  const loadIdRef = useRef(0);
  lessonRef.current = lesson;

  const categoryKey = String(categoryKeyParam || lesson?.categoryKey || "weight");

  const load = useCallback(async () => {
    if (!lessonId) return;
    const loadId = ++loadIdRef.current;
    const hasLesson = Boolean(lessonRef.current);
    if (!hasLesson) setLoading(true);
    try {
      const data = await fetchLesson(Number(lessonId));
      if (loadId !== loadIdRef.current) return;
      setLesson(data);
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      if (lessonRef.current) return;
      await showFailure(t("wellness.couldNotLoadLesson"), err);
    } finally {
      if (loadId === loadIdRef.current) setLoading(false);
    }
  }, [lessonId, showFailure, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    setPlaylist([]);
    setLesson(null);
  }, [lessonId]);

  useEffect(() => {
    const courseId = lesson?.courseId;
    if (!courseId) return;
    let cancelled = false;
    fetchCourse(courseId)
      .then((course) => {
        if (!cancelled) setPlaylist(course?.lessons ?? []);
      })
      .catch(() => {
        if (!cancelled) setPlaylist([]);
      });
    return () => {
      cancelled = true;
    };
  }, [lesson?.courseId]);

  const handleComplete = async () => {
    if (!lesson?.id || lesson.completed || marking) return;
    setMarking(true);
    try {
      await completeWellnessLesson(lesson.id);
      setLesson((prev) => (prev ? { ...prev, completed: true } : prev));
      setPlaylist((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(lesson.id) ? { ...item, completed: true } : item,
        ),
      );
    } catch (err) {
      await showFailure(t("wellness.couldNotSaveProgress"), err);
    } finally {
      setMarking(false);
    }
  };

  const mediaUri = lesson?.fileUrl || lesson?.linkUrl || lesson?.videoUrl || null;
  const videoSource = mediaUri ? { uri: mediaUri } : null;
  const displayTitle = lesson?.title ?? title;
  const courseTitle = lesson?.courseTitle ?? subTitle;
  const courseDescription = String(lesson?.courseDescription ?? "").trim();
  const lessonDescription = String(lesson?.description ?? "").trim();
  const description =
    lessonDescription ||
    courseDescription ||
    t("wellness.defaultLessonDescription");

  const structuredTakeaways = Array.isArray(lesson?.keyTakeaways)
    ? lesson.keyTakeaways.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const takeawayFallbackText = lessonDescription || courseDescription || description;
  const coveredTopics =
    structuredTakeaways.length > 0 ? structuredTakeaways : [takeawayFallbackText];

  const currentLessonId = Number(lesson?.id);
  const currentIndex = playlist.findIndex((item) => Number(item.id) === currentLessonId);
  const previousLesson =
    currentIndex > 0 && Number(playlist[currentIndex - 1]?.id) !== currentLessonId
      ? playlist[currentIndex - 1]
      : null;
  const nextLesson =
    currentIndex >= 0 &&
    currentIndex < playlist.length - 1 &&
    Number(playlist[currentIndex + 1]?.id) !== currentLessonId
      ? playlist[currentIndex + 1]
      : null;
  const headerSubtitle =
    playlist.length > 0 && currentIndex >= 0
      ? t("wellness.lessonOf", {
          course: courseTitle,
          current: currentIndex + 1,
          total: playlist.length,
        })
      : courseTitle;

  const openSibling = (item) => {
    if (!item?.id) return;
    router.replace({
      pathname: "/wellness/lessonVedio",
      params: {
        lessonId: String(item.id),
        title: item.title,
        subTitle: courseTitle,
        categoryKey,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <WellnessScreenHeader
        title={displayTitle}
        subtitle={headerSubtitle}
        categoryKey={categoryKey}
        subtitleColor={T.gray}
        onBack={() => router.back()}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("settings.title")}
            onPress={() => router.push("/screens/settings")}
            hitSlop={10}
            style={({ pressed }) => [styles.settingsBtn, pressed && styles.pressed]}
          >
            <Feather name="settings" size={sf(16)} color={T.navy} />
          </Pressable>
        }
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.navy} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.videoPad}>
            <View style={styles.videoCard}>
              <LazyVideoPlayer
                source={videoSource}
                poster={lesson?.thumbnailUrl || undefined}
                style={styles.video}
              />
            </View>
          </View>

          <View style={styles.body}>
              <View style={styles.infoCard}>
                <View style={styles.badgeRow}>
                  {lesson?.durationMin ? (
                    <View style={[styles.badge, styles.durationBadge]}>
                      <Feather name="clock" size={sf(12)} color={T.navy} />
                      <Text style={[styles.badgeText, { color: T.navy }]}>
                        {t("wellness.minDuration", { minutes: lesson.durationMin })}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.badge,
                      lesson?.completed ? styles.doneBadge : styles.progressBadge,
                    ]}
                  >
                    <Feather
                      name={lesson?.completed ? "check-circle" : "play-circle"}
                      size={sf(12)}
                      color={lesson?.completed ? T.deepTeal : T.teal}
                    />
                    <Text
                      style={[
                        styles.badgeText,
                        { color: lesson?.completed ? T.deepTeal : T.teal },
                      ]}
                    >
                      {lesson?.completed ? t("wellness.completed") : t("wellness.inProgress")}
                    </Text>
                  </View>
                </View>

                <Text style={styles.title}>{displayTitle}</Text>
                <Text style={styles.description}>{description}</Text>
              </View>

              <View style={styles.topicsCard}>
                <View style={styles.topicsHeader}>
                  <View style={styles.topicsIcon}>
                    <Feather name="target" size={sf(14)} color={T.navy} />
                  </View>
                  <View style={styles.topicsHeadingText}>
                    <Text style={styles.topicsTitle}>{t("wellness.whatYoullLearn")}</Text>
                    <Text style={styles.topicsHint}>{t("wellness.whatYoullLearnHint")}</Text>
                  </View>
                </View>
                {coveredTopics.map((item, index) => (
                  <View
                    key={`${index}-${item.slice(0, 12)}`}
                    style={[styles.topicRow, index > 0 && styles.topicRowSpaced]}
                  >
                    <View style={styles.tick}>
                      <Feather name="check" size={sf(11)} color={T.deepTeal} />
                    </View>
                    <Text style={styles.topicText}>{item}</Text>
                  </View>
                ))}
              </View>

              {!lesson?.completed ? (
                <Pressable
                  onPress={handleComplete}
                  disabled={marking}
                  style={({ pressed }) => [styles.completeWrap, pressed && styles.pressed]}
                >
                  <View style={styles.completeBtn}>
                    <Feather name="check-circle" size={sf(15)} color="#FFFFFF" />
                    <Text style={styles.completeText}>
                      {marking ? t("wellness.saving") : t("wellness.markLessonComplete")}
                    </Text>
                  </View>
                </Pressable>
              ) : null}

              <LessonNavRow
                btnWidth={navBtnWidth}
                previousLesson={previousLesson}
                nextLesson={nextLesson}
                onOpen={openSibling}
              />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function LessonNavRow({ btnWidth, previousLesson, nextLesson, onOpen }) {
  const { t } = useTranslation();

  return (
    <View style={styles.navRow}>
      <LessonNavButton
        width={btnWidth}
        direction="prev"
        label={t("wellness.previousLesson")}
        title={previousLesson?.title || t("wellness.noPreviousLesson")}
        disabled={!previousLesson}
        onPress={() => onOpen(previousLesson)}
      />
      <LessonNavButton
        width={btnWidth}
        direction="next"
        label={t("wellness.nextLesson")}
        title={nextLesson?.title || t("wellness.noNextLesson")}
        disabled={!nextLesson}
        onPress={() => onOpen(nextLesson)}
      />
    </View>
  );
}

function LessonNavButton({ width, direction, label, title, disabled, onPress }) {
  const isNext = direction === "next";
  const backgroundColor = isNext
    ? disabled
      ? "#64748B"
      : "#1B4F8A"
    : disabled
      ? "#F4FBFD"
      : "#FFFFFF";
  const borderColor = isNext ? backgroundColor : disabled ? "#CBD5E1" : "#1B4F8A";
  const textColor = isNext ? "#FFFFFF" : disabled ? "#64748B" : "#1B4F8A";
  const iconWell = isNext
    ? "rgba(255,255,255,0.2)"
    : disabled
      ? "#E2E8F0"
      : "#DBEAFE";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={`${label}. ${title}`}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        { width, opacity: pressed && !disabled ? 0.9 : 1 },
      ]}
    >
      <View
        style={{
          width,
          minHeight: sw(92),
          backgroundColor,
          borderColor,
          borderWidth: 2,
          borderRadius: sw(16),
          paddingVertical: sw(14),
          paddingHorizontal: sw(12),
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {isNext ? null : (
          <View
            style={{
              width: sw(28),
              height: sw(28),
              borderRadius: sw(14),
              backgroundColor: iconWell,
              alignItems: "center",
              justifyContent: "center",
              marginEnd: sw(8),
            }}
          >
            <Feather name={arrowBack()} size={sf(15)} color={textColor} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: Fonts.semiBold,
              fontSize: sf(11),
              lineHeight: sf(15),
              fontWeight: "600",
              color: textColor,
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
          <Text
            style={{
              fontFamily: Fonts.bold,
              fontSize: sf(13),
              lineHeight: sf(17),
              fontWeight: "700",
              color: textColor,
              marginTop: sw(3),
            }}
            numberOfLines={2}
          >
            {title}
          </Text>
        </View>
        {isNext ? (
          <View
            style={{
              width: sw(28),
              height: sw(28),
              borderRadius: sw(14),
              backgroundColor: iconWell,
              alignItems: "center",
              justifyContent: "center",
              marginStart: sw(8),
            }}
          >
            <Feather name={arrowForward()} size={sf(15)} color={textColor} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WellnessTheme.screenBg },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: sw(200),
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: sw(16),
  },
  settingsBtn: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(9),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: T.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.88,
  },
  videoPad: {
    paddingHorizontal: sw(18),
    paddingTop: sw(12),
  },
  videoCard: {
    height: sw(196),
    borderRadius: sw(18),
    overflow: "hidden",
    backgroundColor: "#0F172A",
    ...cardShadow,
  },
  video: { width: "100%", height: "100%" },
  body: {
    paddingHorizontal: sw(18),
    paddingTop: sw(14),
    gap: sw(14),
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    borderRadius: sw(18),
    paddingHorizontal: sw(16),
    paddingTop: sw(14),
    paddingBottom: sw(16),
    ...cardShadow,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: sw(8),
    marginBottom: sw(12),
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: sw(5),
    paddingHorizontal: sw(10),
    gap: sw(5),
  },
  durationBadge: {
    backgroundColor: WellnessTheme.brandBorder,
  },
  doneBadge: {
    backgroundColor: T.mint,
  },
  progressBadge: {
    backgroundColor: T.mint,
  },
  badgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontWeight: "600",
    includeFontPadding: false,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    lineHeight: sf(24),
    fontWeight: "700",
    color: T.navy,
    includeFontPadding: false,
  },
  description: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: WellnessTheme.textMuted,
    marginTop: sw(10),
    includeFontPadding: false,
  },
  topicsCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    borderRadius: sw(18),
    paddingHorizontal: sw(16),
    paddingTop: sw(14),
    paddingBottom: sw(14),
    ...cardShadow,
  },
  topicsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    marginBottom: sw(12),
  },
  topicsIcon: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(15),
    backgroundColor: WellnessTheme.brandBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  topicsHeadingText: {
    flex: 1,
    minWidth: 0,
  },
  topicsTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(18),
    fontWeight: "700",
    color: T.navy,
    includeFontPadding: false,
  },
  topicsHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: WellnessTheme.textMuted,
    marginTop: sw(2),
    includeFontPadding: false,
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: T.canvas,
    borderRadius: sw(12),
    paddingVertical: sw(10),
    paddingHorizontal: sw(10),
  },
  topicRowSpaced: {
    marginTop: sw(8),
  },
  tick: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(7),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginEnd: sw(10),
  },
  topicText: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: WellnessTheme.text,
    includeFontPadding: false,
  },
  completeWrap: {
    marginTop: sw(2),
  },
  completeBtn: {
    backgroundColor: T.teal,
    borderRadius: sw(14),
    paddingVertical: sw(12),
    paddingHorizontal: sw(14),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  completeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "700",
    color: "#FFFFFF",
    marginStart: sw(8),
    includeFontPadding: false,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
  },
});
