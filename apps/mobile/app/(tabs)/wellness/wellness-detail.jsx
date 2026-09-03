import React, { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import WellnessScreenHeader from "../../../components/wellness/wellness-screen-header";
import WellnessProgramDetail from "../../../components/wellness/wellness-program-detail";
import { fetchCategoryCourses } from "../../../services/wellness-api";
import { getWellnessCategoryMeta, WellnessTheme } from "../../../constants/wellness-theme";
import { useApiAction } from "../../../hooks/use-api-action";
import GuestFeatureErrorState from "../../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../../utils/account-access-sync";
import { sw } from "../../../utils/responsive";
import { useTranslation } from "react-i18next";

function localizedCopy(t, key) {
  const value = t(key, { defaultValue: "" });
  if (!value || value === key) return "";
  return value;
}

function resolveCategoryKey(typeParam, category) {
  if (category?.key) return String(category.key);
  if (typeParam) return String(typeParam).toLowerCase();
  return "weight";
}

export default function WellnessDetail() {
  const router = useRouter();
  const { t } = useTranslation();
  const { title, subTitle, type } = useLocalSearchParams();
  const { showFailure } = useApiAction();
  const [courses, setCourses] = useState([]);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const categoryKey = resolveCategoryKey(type, category);
  const meta = getWellnessCategoryMeta(categoryKey);
  const displayTitle = meta.titleKey
    ? t(meta.titleKey)
    : (category?.title ?? title ?? t("wellness.defaultCategoryTitle"));
  const heroTitle =
    localizedCopy(t, `wellness.heroTitle.${categoryKey}`) ||
    category?.subtitle ||
    subTitle ||
    t("wellness.defaultCategorySubtitle");
  const heroDescription =
    localizedCopy(t, `wellness.heroCopy.${categoryKey}`) ||
    (meta.tipKey ? t(meta.tipKey) : "") ||
    "";

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
      await showFailure(t("wellness.couldNotLoadCourses"), err);
    } finally {
      setLoading(false);
    }
  }, [type, showFailure, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <WellnessScreenHeader
        title={displayTitle}
        subtitle={t("wellness.wellsFramework")}
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
            defaultTitle={t("wellness.couldNotLoadCourses")}
            onRetry={load}
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <WellnessProgramDetail
              categoryKey={categoryKey}
              heroTitle={heroTitle}
              heroDescription={heroDescription}
              courses={courses}
              onCoursePress={openCourse}
              onExploreMore={() => router.push("/wellness")}
            />
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
    paddingBottom: sw(16),
  },
});
