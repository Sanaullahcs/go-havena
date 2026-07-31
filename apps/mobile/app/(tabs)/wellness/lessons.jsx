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
import WellnessCourseSummary from "../../../components/wellness/wellness-course-summary";
import WellnessLessonRow from "../../../components/wellness/wellness-lesson-row";
import MenuGroup from "../../../components/layout/menu-group";
import { fetchCourse } from "../../../services/wellness-api";
import { getWellnessCategoryMeta, WellnessTheme } from "../../../constants/wellness-theme";
import { useApiAction } from "../../../hooks/use-api-action";
import GuestFeatureErrorState from "../../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../../utils/account-access-sync";
import { sf, sw } from "../../../utils/responsive";

export default function Lessons() {
  const router = useRouter();
  const { title, type, courseId, categoryKey: categoryKeyParam } = useLocalSearchParams();
  const { showFailure } = useApiAction();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    } catch (err) {
      const restricted = await resolveLoadRestriction("wellness", err);
      if (restricted) {
        setCourse(null);
        setError(restricted);
        return;
      }
      await showFailure("Could not load lessons", err);
    } finally {
      setLoading(false);
    }
  }, [courseId, showFailure]);

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

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <WellnessScreenHeader
        title={course?.title ?? title}
        subtitle={`${decodedType || "Wellness"} · WELLS`}
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
            defaultTitle="Could not load lessons"
            onRetry={load}
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <WellnessCourseSummary
              categoryKey={categoryKey}
              description={course?.description}
              durationMin={totalDuration}
              lessonCount={playlistDetails.length}
              progress={progress}
            />

            {playlistDetails.length > 0 ? (
              <MenuGroup label="Lessons" style={styles.menuGroup}>
                {playlistDetails.map((item, index) => (
                  <WellnessLessonRow
                    key={item.id}
                    categoryKey={categoryKey}
                    index={index}
                    title={item.title}
                    timeLabel={item.timeLabel}
                    completed={item.completed}
                    isWatching={item.isWatching}
                    onPress={() =>
                      router.push({
                        pathname: "/wellness/lessonVedio",
                        params: {
                          lessonId: String(item.id),
                          title: item.title,
                          subTitle: course?.title ?? title,
                          categoryKey,
                        },
                      })
                    }
                  />
                ))}
              </MenuGroup>
            ) : (
              <Text style={styles.emptyText}>No lessons in this course yet.</Text>
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
  menuGroup: {
    marginTop: sw(20),
    marginBottom: 0,
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: WellnessTheme.textMuted,
    textAlign: "center",
    paddingVertical: sw(24),
  },
});
