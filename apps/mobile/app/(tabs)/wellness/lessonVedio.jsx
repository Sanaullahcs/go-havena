import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../../constants/font";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import LazyVideoPlayer from "../../../components/ui/lazy-video";
import WellnessScreenHeader from "../../../components/wellness/wellness-screen-header";
import { fetchLesson, completeWellnessLesson } from "../../../services/wellness-api";
import { getWellnessCategoryMeta, WellnessTheme } from "../../../constants/wellness-theme";
import { useApiAction } from "../../../hooks/use-api-action";
import { sf, sw } from "../../../utils/responsive";

export default function LessonVedio() {
  const router = useRouter();
  const { title, subTitle, lessonId, categoryKey: categoryKeyParam } = useLocalSearchParams();
  const { showFailure } = useApiAction();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(Boolean(lessonId));
  const [marking, setMarking] = useState(false);

  const categoryKey = String(categoryKeyParam || lesson?.categoryKey || "weight");
  const meta = getWellnessCategoryMeta(categoryKey);

  const load = useCallback(async () => {
    if (!lessonId) return;
    setLoading(true);
    try {
      const data = await fetchLesson(Number(lessonId));
      setLesson(data);
    } catch (err) {
      await showFailure("Could not load lesson", err);
    } finally {
      setLoading(false);
    }
  }, [lessonId, showFailure]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleComplete = async () => {
    if (!lesson?.id || lesson.completed || marking) return;
    setMarking(true);
    try {
      await completeWellnessLesson(lesson.id);
      setLesson((prev) => (prev ? { ...prev, completed: true } : prev));
    } catch (err) {
      await showFailure("Could not save progress", err);
    } finally {
      setMarking(false);
    }
  };

  const mediaUri = lesson?.fileUrl || lesson?.linkUrl || lesson?.videoUrl || null;
  const videoSource = mediaUri ? { uri: mediaUri } : null;
  const displayTitle = lesson?.title ?? title;
  const displaySubtitle = lesson?.courseTitle ?? subTitle;
  const courseDescription = String(lesson?.courseDescription ?? "").trim();
  const lessonDescription = String(lesson?.description ?? "").trim();
  // Lesson description optional → fall back to course description.
  const description =
    lessonDescription ||
    courseDescription ||
    "In this lesson, you'll learn practical techniques you can apply right away.";

  // Key takeaways → else lesson description → else course description.
  const structuredTakeaways = Array.isArray(lesson?.keyTakeaways)
    ? lesson.keyTakeaways.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const takeawayFallbackText = lessonDescription || courseDescription || description;
  const coveredTopics =
    structuredTakeaways.length > 0
      ? structuredTakeaways
      : [takeawayFallbackText];

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <WellnessScreenHeader
        title={displayTitle}
        subtitle={displaySubtitle}
        categoryKey={categoryKey}
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={meta.color} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.videoContainer}>
            <LazyVideoPlayer source={videoSource} style={styles.video} />
          </View>

          <View style={styles.body}>
            <View style={styles.infoCard}>
              <View style={styles.badgeRow}>
                {lesson?.durationMin ? (
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                    <Feather name="clock" size={sf(11)} color={meta.color} />
                    <Text style={[styles.badgeText, { color: meta.color }]}>
                      {lesson.durationMin} min
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Feather
                    name={lesson?.completed ? "check-circle" : "play-circle"}
                    size={sf(11)}
                    color={meta.color}
                  />
                  <Text style={[styles.badgeText, { color: meta.color }]}>
                    {lesson?.completed ? "Completed" : "In progress"}
                  </Text>
                </View>
              </View>

              <Text style={styles.title}>{displayTitle}</Text>
              {displaySubtitle ? (
                <Text style={styles.courseLabel} numberOfLines={1}>
                  {displaySubtitle}
                </Text>
              ) : null}
              <Text style={styles.description}>{description}</Text>
            </View>

            <View style={styles.topicsCard}>
              <Text style={styles.topicsTitle}>Key takeaways</Text>
              {(coveredTopics.length ? coveredTopics : [description]).map((item, index) => (
                <View
                  key={`${index}-${item.slice(0, 12)}`}
                  style={[styles.topicRow, index > 0 && styles.topicRowSpaced]}
                >
                  <View style={[styles.tick, { backgroundColor: meta.bg }]}>
                    <Feather name="check" size={sf(11)} color={meta.color} />
                  </View>
                  <Text style={styles.topicText}>{item}</Text>
                </View>
              ))}
            </View>

            <Pressable
              onPress={lesson?.completed ? undefined : handleComplete}
              disabled={marking || lesson?.completed}
              style={({ pressed }) => [
                styles.completeWrap,
                pressed && !lesson?.completed && { opacity: 0.92 },
              ]}
            >
              <View
                style={[
                  styles.completeBtn,
                  {
                    backgroundColor: lesson?.completed ? "#ECFDF5" : meta.color,
                    borderColor: lesson?.completed ? "#A7F3D0" : meta.color,
                  },
                ]}
              >
                <Feather
                  name={lesson?.completed ? "check" : "check-circle"}
                  size={sf(15)}
                  color={lesson?.completed ? "#059669" : "#FFFFFF"}
                />
                <Text
                  style={[
                    styles.completeText,
                    { color: lesson?.completed ? "#059669" : "#FFFFFF" },
                  ]}
                >
                  {marking
                    ? "Saving..."
                    : lesson?.completed
                      ? "Lesson completed"
                      : "Mark lesson complete"}
                </Text>
              </View>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
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
  scrollContent: { paddingBottom: sw(110) },
  videoContainer: {
    width: "100%",
    height: sw(210),
    backgroundColor: "#0F172A",
  },
  video: { width: "100%", height: "100%" },
  body: {
    paddingHorizontal: sw(18),
    paddingTop: sw(16),
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    borderRadius: 14,
    padding: sw(16),
    marginBottom: sw(12),
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: sw(10),
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: sw(5),
    paddingHorizontal: sw(10),
    marginRight: sw(6),
    marginBottom: sw(4),
  },
  badgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(14),
    fontWeight: "600",
    marginLeft: sw(4),
    includeFontPadding: false,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    lineHeight: sf(24),
    fontWeight: "700",
    color: WellnessTheme.text,
    includeFontPadding: false,
  },
  courseLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: WellnessTheme.caption,
    fontWeight: "500",
    marginTop: sw(4),
    includeFontPadding: false,
  },
  description: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: WellnessTheme.textMuted,
    marginTop: sw(8),
    includeFontPadding: false,
  },
  topicsCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    borderRadius: 14,
    padding: sw(16),
    marginBottom: sw(12),
  },
  topicsTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "700",
    color: WellnessTheme.text,
    marginBottom: sw(12),
    includeFontPadding: false,
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  topicRowSpaced: {
    marginTop: sw(10),
  },
  tick: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(7),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: sw(10),
    marginTop: 1,
  },
  topicText: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: WellnessTheme.textMuted,
    includeFontPadding: false,
  },
  completeWrap: {
    marginTop: sw(4),
  },
  completeBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: sw(14),
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
    marginLeft: sw(8),
    includeFontPadding: false,
  },
});
