import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Fonts } from "../../../constants/font";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import WellnessScreenHeader from "../../../components/wellness/wellness-screen-header";
import WellnessStatBar from "../../../components/wellness/wellness-stat-bar";
import WellnessCategoryCard from "../../../components/wellness/wellness-category-card";
import {
  wellnessDetailRouteParams,
} from "../../../constants/wellness-categories";
import { fetchWellnessHub } from "../../../services/wellness-api";
import GuestFeatureErrorState from "../../../components/guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../../utils/guest-permission-errors";
import { resolveLoadRestriction } from "../../../utils/account-access-sync";
import { WellnessTheme } from "../../../constants/wellness-theme";
import { sf, sw } from "../../../utils/responsive";

export default function Wellness() {
  const router = useRouter();
  const [hub, setHub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const blocked = await resolveLoadRestriction("wellness");
      if (blocked) {
        setHub(null);
        setError(blocked);
        return;
      }

      const data = await fetchWellnessHub();
      setHub(data);
    } catch (err) {
      const restricted = await resolveLoadRestriction("wellness", err);
      if (restricted) {
        setHub(null);
        setError(restricted);
        return;
      }
      setError(err);
      setHub(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const stats = [
    {
      key: "courses",
      label: "Total Courses",
      value: loading && !hub ? "—" : String(hub?.stats?.totalCourses ?? 0),
    },
    {
      key: "progress",
      label: "Avg Progress",
      value: loading && !hub ? "—" : `${hub?.stats?.avgProgress ?? 0}%`,
    },
    {
      key: "week",
      label: "This Week",
      value: loading && !hub ? "—" : (hub?.stats?.weekLabel ?? "—"),
    },
  ];

  const accessBlocked = Boolean(error && isFeatureAccessBlockedError(error));
  const categories = hub?.categories ?? [];

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <WellnessScreenHeader
        title="Wellness Hub"
        subtitle="WELLS Framework for holistic health"
        onBack={() => router.back()}
      />

      {!accessBlocked ? <WellnessStatBar stats={stats} /> : null}

      <View style={styles.body}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#0A2A43" />
          </View>
        ) : error ? (
          <GuestFeatureErrorState
            error={error}
            fallbackFeature="wellness"
            defaultTitle="Could not load wellness"
            onRetry={load}
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {categories.map((item, index, arr) => (
              <WellnessCategoryCard
                key={item.key}
                categoryKey={item.iconKey ?? item.key}
                title={item.title}
                subtitle={item.subtitle}
                progressPercent={item.progressPercent}
                progressLabel={item.progressLabel}
                coursesLabel={item.coursesLabel}
                accentColor={item.color}
                isLast={index === arr.length - 1}
                onPress={() =>
                  router.push({
                    pathname: "/wellness/wellness-detail",
                    params: wellnessDetailRouteParams(item),
                  })
                }
              />
            ))}

            {categories.length === 0 ? (
              <Text style={styles.emptyText}>No wellness content available yet.</Text>
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
  listContent: {
    paddingHorizontal: sw(18),
    paddingTop: sw(16),
    paddingBottom: sw(110),
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#6A7282",
    textAlign: "center",
    paddingVertical: sw(24),
    includeFontPadding: false,
  },
});
