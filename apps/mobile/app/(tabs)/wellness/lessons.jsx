import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Trophy } from "lucide-react-native";
import WellnessScreenHeader from "../../../components/wellness/wellness-screen-header";
import WellnessCourseSummary from "../../../components/wellness/wellness-course-summary";
import WellnessLessonRow from "../../../components/wellness/wellness-lesson-row";
import { fetchCategoryCourses, fetchCourse } from "../../../services/wellness-api";
import { getWellnessCategoryMeta, WellnessTheme } from "../../../constants/wellness-theme";
import { HomeTheme as T } from "../../../constants/home-theme";
import { useApiAction } from "../../../hooks/use-api-action";
import GuestFeatureErrorState from "../../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../../utils/account-access-sync";
import { sf, sw } from "../../../utils/responsive";
import { useTranslation } from "react-i18next";

function CourseCompleteBanner({ onSeeNext }) {
  const { t } = useTranslation();

  return (
    <View style={styles.completeCard}>
      <View style={styles.completeIcon}>
        <Trophy size={sf(16)} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <View style={styles.completeCopy}>
        <Text style={styles.completeTitle}>
          {t("wellness.greatJob", { defaultValue: "Great job!" })}
          {" 🎉"}
        </Text>
        <Text style={styles.completeBody}>
          {t("wellness.courseCompleteBody", {
            defaultValue:
              "You've completed all lessons in this course. Keep going and build healthy habits every day!",
          })}
        </Text>
      </View>
      {onSeeNext ? (
        <Pressable onPress={onSeeNext} style={styles.nextBtn} hitSlop={8}>
          <Text style={styles.nextBtnText}>
            {t("wellness.seeNextCourse", { defaultValue: "See next course" })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function Lessons() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { title, type, courseId, categoryKey: categoryKeyParam } = useLocalSearchParams();
  const { showFailure } = useApiAction();
  const [course, setCourse] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandAll, setExpandAll] = useState(false);

  const decodedType = decodeURIComponent(String(type ?? ""));
  const categoryKey = String(categoryKeyParam || course?.categoryKey || "weight");
  const meta = getWellnessCategoryMeta(categoryKey);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const blocked = await resolveLoadRestriction("wellness");
      if (blocked) {
        setCourse(null);
        setError(blocked);
        return;
      }

      const data = await fetchCourse(Number(courseId));
      setCourse(data);

      const key = data?.categoryKey || categoryKeyParam;
      if (key) {
        try {
          const pack = await fetchCategoryCourses(String(key));
          setSiblings(pack.courses ?? []);
        } catch {
          setSiblings([]);
        }
      }
    } catch (err) {
      const restricted = await resolveLoadRestriction("wellness", err);
      if (restricted) {
        setCourse(null);
        setError(restricted);
        return;
      }
      await showFailure(t("wellness.couldNotLoadLessons"), err);
    } finally {
      setLoading(false);
    }
  }, [courseId, categoryKeyParam, showFailure, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const playlistDetails = course?.lessons ?? [];
  const totalDuration = useMemo(
    () => playlistDetails.reduce((sum, l) => sum + (l.durationMin ?? 0), 0),
    [playlistDetails],
  );
  const progress = course?.progressPercent ?? 0;
  const accessBlocked = Boolean(error && isFeatureAccessBlockedError(error));
  const lessonsLabel = t("wellness.lessons");
  const sectionLabel = i18n.language === "ar" ? lessonsLabel : lessonsLabel.toUpperCase();
  const courseComplete = playlistDetails.length > 0 && progress >= 100;

  const nextCourse = useMemo(() => {
    if (!course?.id || !siblings.length) return null;
    const idx = siblings.findIndex((item) => Number(item.id) === Number(course.id));
    if (idx < 0 || idx >= siblings.length - 1) return null;
    return siblings[idx + 1];
  }, [siblings, course]);

  const openLesson = useCallback(
    (item) => {
      router.push({
        pathname: "/wellness/lessonVedio",
        params: {
          lessonId: String(item.id),
          title: item.title,
          subTitle: course?.title ?? title,
          categoryKey,
        },
      });
    },
    [router, course?.title, title, categoryKey],
  );

  const openNextCourse = useCallback(() => {
    if (nextCourse) {
      router.replace({
        pathname: "/wellness/lessons",
        params: {
          courseId: String(nextCourse.id),
          title: nextCourse.title,
          type: decodedType,
          categoryKey,
        },
      });
      return;
    }
    router.back();
  }, [nextCourse, router, decodedType, categoryKey]);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <WellnessScreenHeader
        title={course?.title ?? title}
        subtitle={`${decodedType || t("wellness.wellness")} · ${t("wellness.wells")}`}
        categoryKey={categoryKey}
        onBack={() => router.back()}
      />

      <View style={styles.body}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={meta.color} />
          </View>
        ) : accessBlocked ? (
          <GuestFeatureErrorState
            error={error}
            fallbackFeature="wellness"
            defaultTitle={t("wellness.couldNotLoadLessons")}
            onRetry={load}
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <WellnessCourseSummary
              categoryKey={categoryKey}
              courseTitle={course?.title ?? title}
              description={course?.description}
              durationMin={totalDuration}
              lessonCount={playlistDetails.length}
              progress={progress}
            />

            {playlistDetails.length > 0 ? (
              <View style={styles.lessonsSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>{sectionLabel}</Text>
                  <Pressable
                    onPress={() => setExpandAll((value) => !value)}
                    style={styles.expandBtn}
                    hitSlop={8}
                  >
                    <Text style={styles.expandText}>
                      {expandAll
                        ? t("wellness.collapseAll", { defaultValue: "Collapse all" })
                        : t("wellness.expandAll", { defaultValue: "Expand all" })}
                    </Text>
                    <Feather
                      name={expandAll ? "chevron-up" : "chevron-down"}
                      size={sf(14)}
                      color={WellnessTheme.caption}
                    />
                  </Pressable>
                </View>

                {playlistDetails.map((item, index) => (
                  <WellnessLessonRow
                    key={item.id}
                    index={index}
                    title={item.title}
                    description={item.description}
                    timeLabel={item.timeLabel}
                    completed={item.completed}
                    isWatching={item.isWatching}
                    expanded={expandAll}
                    onPress={() => openLesson(item)}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>{t("wellness.noLessonsYet")}</Text>
            )}

            {courseComplete ? (
              <CourseCompleteBanner onSeeNext={openNextCourse} />
            ) : null}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WellnessTheme.screenBg },
  body: { flex: 1, backgroundColor: WellnessTheme.screenBg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: {
    paddingHorizontal: sw(18),
    paddingTop: sw(16),
    paddingBottom: sw(24),
  },
  lessonsSection: {
    marginTop: sw(18),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(10),
  },
  sectionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    letterSpacing: 0.8,
    color: WellnessTheme.caption,
    fontWeight: "600",
    includeFontPadding: false,
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
  },
  expandText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: WellnessTheme.textMuted,
    includeFontPadding: false,
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: WellnessTheme.textMuted,
    textAlign: "center",
    paddingVertical: sw(24),
  },
  completeCard: {
    marginTop: sw(8),
    backgroundColor: "#ECFDF5",
    borderRadius: sw(18),
    padding: sw(14),
    flexDirection: "row",
    alignItems: "center",
  },
  completeIcon: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(12),
    backgroundColor: T.teal,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  completeCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: sw(10),
  },
  completeTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "700",
    color: "#065F46",
    includeFontPadding: false,
  },
  completeBody: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#0F766E",
    marginTop: sw(2),
    includeFontPadding: false,
  },
  nextBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderWidth: 1,
    borderColor: "#A7F3D0",
    flexShrink: 0,
    maxWidth: sw(88),
  },
  nextBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontWeight: "600",
    color: T.deepTeal,
    textAlign: "center",
    includeFontPadding: false,
  },
});
