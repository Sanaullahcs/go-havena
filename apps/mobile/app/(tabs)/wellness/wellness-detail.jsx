import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import WellnessScreenHeader from "../../../components/wellness/wellness-screen-header";
import WellnessCategoryHero from "../../../components/wellness/wellness-category-hero";
import WellnessCourseCard from "../../../components/wellness/wellness-course-card";
import { SectionLabel } from "../../../components/layout/internal-page-shell";
import { fetchCategoryCourses } from "../../../services/wellness-api";
import { getWellnessCategoryMeta, WellnessTheme, WELLNESS_CATEGORY_META } from "../../../constants/wellness-theme";
import { useApiAction } from "../../../hooks/use-api-action";
import GuestFeatureErrorState from "../../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../../utils/account-access-sync";
import { sf, sw } from "../../../utils/responsive";

function resolveCategoryKey(typeParam, category) {
  if (category?.key) return String(category.key);
  const raw = String(typeParam ?? "weight").toLowerCase();
  return WELLNESS_CATEGORY_META[raw] ? raw : "weight";
}

export default function WellnessDetail() {
  const router = useRouter();
  const { title, subTitle, type } = useLocalSearchParams();
  const { showFailure } = useApiAction();
  const [courses, setCourses] = useState([]);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const categoryKey = resolveCategoryKey(type, category);
  const meta = getWellnessCategoryMeta(categoryKey);
  const displayTitle = category?.title ?? title ?? "Weight & Diet";
  const displaySubtitle =
    category?.subtitle || subTitle || "Nutrition and healthy eating";

  const load = useCallback(async () => {
    if (!type) return;
    setLoading(true);
    setError(null);
    try {
      const blocked = await resolveLoadRestriction("wellness");
      if (blocked) {
        setCourses([]);
        setError(blocked);
        return;
      }

      const data = await fetchCategoryCourses(String(type));
      setCourses(data.courses);
      setCategory(data.category);
    } catch (err) {
      const restricted = await resolveLoadRestriction("wellness", err);
      if (restricted) {
        setCourses([]);
        setError(restricted);
        return;
      }
      await showFailure("Could not load courses", err);
    } finally {
      setLoading(false);
    }
  }, [type, showFailure]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const avgProgress = useMemo(() => {
    if (!courses.length) return 0;
    const sum = courses.reduce((acc, c) => acc + (c.progressPercent ?? 0), 0);
    return Math.round(sum / courses.length);
  }, [courses]);

  const openCourse = useCallback(
    (item) => {
      router.push({
        pathname: "/wellness/lessons",
        params: {
          courseId: String(item.id),
          title: item.title,
          type: String(displayTitle),
          categoryKey,
        },
      });
    },
    [router, displayTitle, categoryKey],
  );

  const accessBlocked = Boolean(error && isFeatureAccessBlockedError(error));

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <WellnessScreenHeader
        title={displayTitle}
        subtitle="WELLS Framework"
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
            defaultTitle="Could not load courses"
            onRetry={load}
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <WellnessCategoryHero
              categoryKey={categoryKey}
              subtitle={displaySubtitle}
              courseCount={courses.length}
              avgProgress={avgProgress}
            />

            {courses.length > 0 ? (
              <>
                <SectionLabel style={styles.sectionLabel}>Courses</SectionLabel>
                <View style={styles.courseList}>
                  {courses.map((item) => (
                    <WellnessCourseCard
                      key={item.id}
                      categoryKey={categoryKey}
                      title={item.title}
                      lessonCount={item.lessonCount}
                      durationMin={item.durationMin}
                      progressPercent={item.progressPercent}
                      onPress={() => openCourse(item)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No courses yet</Text>
                <Text style={styles.emptyText}>
                  New {displayTitle.toLowerCase()} programs will appear here when your community adds them.
                </Text>
              </View>
            )}
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
    paddingBottom: sw(110),
  },
  sectionLabel: {
    marginTop: sw(20),
    marginBottom: sw(12),
  },
  courseList: {
    width: "100%",
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
