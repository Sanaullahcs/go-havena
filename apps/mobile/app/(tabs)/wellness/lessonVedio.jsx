import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Platform,
  Linking,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
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
import { arrowBack, arrowForward, chevronForward } from "../../../utils/rtl";
import { useTranslation } from "react-i18next";

const TABS = [
  { key: "overview", icon: "play-circle", labelKey: "wellness.overview" },
  { key: "notes", icon: "edit-3", labelKey: "wellness.notes" },
  { key: "resources", icon: "folder", labelKey: "wellness.resources" },
  { key: "discussion", icon: "message-circle", labelKey: "wellness.discussion" },
];

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  android: { elevation: 2 },
});

async function openExternalUrl(url) {
  if (!url) return;
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}

function uniqueUrls(...candidates) {
  const seen = new Set();
  const out = [];
  for (const value of candidates) {
    const url = String(value ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export default function LessonVedio() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { t } = useTranslation();
  const navBtnWidth = Math.floor((windowWidth - sw(18) * 2 - sw(12)) / 2);
  const { title, subTitle, lessonId, categoryKey: categoryKeyParam } = useLocalSearchParams();
  const { showFailure } = useApiAction();
  const scrollRef = useRef(null);
  const bodyOffsetRef = useRef(0);
  const learnOffsetRef = useRef(0);
  const [lesson, setLesson] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [tab, setTab] = useState("overview");
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
    setTab("overview");
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

  const resourceItems = useMemo(() => {
    const items = [];
    if (lesson?.fileUrl) {
      items.push({
        key: "file",
        url: lesson.fileUrl,
        label: t("wellness.openFile"),
        icon: "file-text",
      });
    }
    if (lesson?.linkUrl && lesson.linkUrl !== lesson.fileUrl) {
      items.push({
        key: "link",
        url: lesson.linkUrl,
        label: t("wellness.openLink"),
        icon: "external-link",
      });
    }
    return items;
  }, [lesson?.fileUrl, lesson?.linkUrl, t]);

  const resourceCount = uniqueUrls(lesson?.fileUrl, lesson?.linkUrl).length;
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
  const quickTip = structuredTakeaways[0] || t("wellness.quickTipsHint");

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

  const scrollToLearn = () => {
    setTab("overview");
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, learnOffsetRef.current - sw(8)), animated: true });
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
          ref={scrollRef}
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.videoPad}>
            <View style={styles.videoCard}>
              <LazyVideoPlayer source={videoSource} style={styles.video} />
            </View>
          </View>

          <View style={styles.tabBar}>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabRow}
              accessibilityRole="tablist"
            >
              {TABS.map((item) => {
                const active = tab === item.key;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setTab(item.key)}
                    style={({ pressed }) => [
                      styles.tabItem,
                      active && styles.tabItemActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Feather
                      name={item.icon}
                      size={sf(15)}
                      color={active ? T.navy : T.gray}
                    />
                    <Text
                      style={[styles.tabLabel, active && styles.tabLabelActive]}
                      numberOfLines={1}
                    >
                      {t(item.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {tab === "overview" ? (
            <View
              style={styles.body}
              onLayout={(e) => {
                bodyOffsetRef.current = e.nativeEvent.layout.y;
              }}
            >
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

              <View
                style={styles.topicsCard}
                onLayout={(e) => {
                  learnOffsetRef.current = bodyOffsetRef.current + e.nativeEvent.layout.y;
                }}
              >
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

              <View style={styles.actionRow}>
                <View style={styles.miniCard}>
                  <View style={styles.miniIcon}>
                    <Feather name="file-text" size={sf(14)} color={T.navy} />
                  </View>
                  <Text style={styles.miniTitle}>{t("wellness.lessonResources")}</Text>
                  <Text style={styles.miniHint} numberOfLines={2}>
                    {t("wellness.lessonResourcesHint")}
                  </Text>
                  <Pressable
                    onPress={() => setTab("resources")}
                    style={({ pressed }) => [styles.miniLink, pressed && styles.pressed]}
                  >
                    <Text style={styles.miniLinkText}>
                      {t("wellness.viewResources", { count: resourceCount })}
                    </Text>
                    <Feather name={chevronForward()} size={sf(13)} color={T.navy} />
                  </Pressable>
                </View>

                <View style={styles.miniCard}>
                  <View style={[styles.miniIcon, styles.miniIconTeal]}>
                    <Feather name="zap" size={sf(14)} color={T.deepTeal} />
                  </View>
                  <Text style={styles.miniTitle}>{t("wellness.quickTips")}</Text>
                  <Text style={styles.miniHint} numberOfLines={2}>
                    {quickTip}
                  </Text>
                  <Pressable
                    onPress={scrollToLearn}
                    style={({ pressed }) => [styles.miniLink, pressed && styles.pressed]}
                  >
                    <Text style={[styles.miniLinkText, { color: T.deepTeal }]}>
                      {t("wellness.viewSummary")}
                    </Text>
                    <Feather name={chevronForward()} size={sf(13)} color={T.deepTeal} />
                  </Pressable>
                </View>
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

            </View>
          ) : null}

          {tab === "notes" ? (
            <EmptyTab icon="edit-3" message={t("wellness.notesEmpty")} />
          ) : null}

          {tab === "resources" ? (
            <View style={styles.body}>
              {resourceItems.length ? (
                resourceItems.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => openExternalUrl(item.url)}
                    style={({ pressed }) => [styles.resourceRow, pressed && styles.pressed]}
                  >
                    <View style={styles.miniIcon}>
                      <Feather name={item.icon} size={sf(14)} color={T.navy} />
                    </View>
                    <Text style={styles.resourceLabel}>{item.label}</Text>
                    <Feather name={chevronForward()} size={sf(15)} color={T.navy} />
                  </Pressable>
                ))
              ) : (
                <EmptyTab icon="folder" message={t("wellness.resourcesEmpty")} nested />
              )}
            </View>
          ) : null}

          {tab === "discussion" ? (
            <EmptyTab icon="message-circle" message={t("wellness.discussionEmpty")} />
          ) : null}

          <View style={styles.navPad}>
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

function EmptyTab({ icon, message, nested }) {
  return (
    <View style={[styles.emptyCard, nested && styles.emptyCardNested]}>
      <View style={styles.emptyIcon}>
        <Feather name={icon} size={sf(16)} color={T.navy} />
      </View>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
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
  tabBar: {
    marginTop: sw(16),
    borderBottomWidth: 1,
    borderBottomColor: WellnessTheme.border,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sw(18),
    paddingTop: sw(6),
    paddingBottom: sw(10),
    gap: sw(8),
  },
  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    minHeight: sw(40),
    paddingHorizontal: sw(14),
    paddingVertical: sw(8),
    borderRadius: sw(999),
  },
  tabItemActive: {
    backgroundColor: T.mint,
  },
  tabLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    lineHeight: sf(17),
    fontWeight: "500",
    color: T.gray,
    includeFontPadding: false,
  },
  tabLabelActive: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    color: T.navy,
  },
  body: {
    paddingHorizontal: sw(18),
    paddingTop: sw(16),
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
  actionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: sw(10),
  },
  miniCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    borderRadius: sw(16),
    paddingHorizontal: sw(12),
    paddingTop: sw(12),
    paddingBottom: sw(12),
    ...cardShadow,
  },
  miniIcon: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(8),
    backgroundColor: WellnessTheme.brandBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(8),
  },
  miniIconTeal: {
    backgroundColor: T.mint,
  },
  miniTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "700",
    color: T.navy,
    includeFontPadding: false,
  },
  miniHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: WellnessTheme.textMuted,
    marginTop: sw(4),
    minHeight: sf(30),
    includeFontPadding: false,
  },
  miniLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    marginTop: sw(10),
  },
  miniLinkText: {
    flexShrink: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontWeight: "600",
    color: T.navy,
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
  navPad: {
    paddingHorizontal: sw(18),
    paddingTop: sw(18),
  },
  navRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
  },
  resourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    borderRadius: sw(16),
    paddingHorizontal: sw(14),
    paddingVertical: sw(14),
    ...cardShadow,
  },
  resourceLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "600",
    color: T.navy,
    includeFontPadding: false,
  },
  emptyCard: {
    marginHorizontal: sw(18),
    marginTop: sw(14),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    borderRadius: sw(18),
    paddingHorizontal: sw(18),
    paddingVertical: sw(28),
    alignItems: "center",
    ...cardShadow,
  },
  emptyCardNested: {
    marginHorizontal: 0,
    marginTop: 0,
  },
  emptyIcon: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(18),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(10),
  },
  emptyText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: WellnessTheme.textMuted,
    textAlign: "center",
    includeFontPadding: false,
  },
});
