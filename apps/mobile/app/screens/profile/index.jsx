import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import React, { useState, useCallback, useRef } from "react";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { Colors, Layout } from "../../../constants/tokens";
import ScreenHeader from "../../../components/layout/screen-header";
import ProfilePhotoAvatar from "../../../components/profile/profile-photo-avatar";
import ProfileStats from "../../../components/profile/profilestats";
import RecentAchievements from "../../../components/profile/recentAchievements";
import QuickAccess from "../../../components/profile/quickAccess";
import ProfileSubscriptionTab from "../../../components/profile/profile-subscription-tab";
import {
  ProfileIdentitySkeleton,
  ProfileStatsSkeleton,
  ProfileAchievementsSkeleton,
} from "../../../components/ui/skeleton-loader";
import { fetchMe } from "../../../services/profile-api";
import { fetchPointsStats, formatPoints } from "../../../services/points-api";
import { fetchAchievements } from "../../../services/achievements-api";
import { isCommunityAdmin } from "../../../services/community-access";
import { useSessionUser } from "../../../hooks/use-session-user";
import { isResidentFeatureEnabled } from "../../../constants/resident-features";
import { formatResidentUnitLabel, getProfileFields } from "../../../utils/profile-display";
import { useProfilePhoto } from "../../../hooks/use-profile-photo";
import { sw, sf, hp } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";

export default function Profile() {
  const router = useRouter();
  const { t } = useTranslation();
  const sessionUser = useSessionUser();
  const [profile, setProfile] = useState(sessionUser ?? null);
  const [pointsStats, setPointsStats] = useState(null);
  const [achievements, setAchievements] = useState(null);
  const [profileLoading, setProfileLoading] = useState(!sessionUser);
  const [statsLoading, setStatsLoading] = useState(false);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const hasProfileRef = useRef(Boolean(sessionUser));
  const hasStatsRef = useRef(false);
  const hasAchievementsRef = useRef(false);

  const load = useCallback(async () => {
    const showIdentitySkeleton = !hasProfileRef.current;
    if (showIdentitySkeleton) setProfileLoading(true);

    let nextProfile = null;
    try {
      nextProfile = await fetchMe();
      setProfile(nextProfile);
      hasProfileRef.current = true;
    } catch {
      if (!hasProfileRef.current) {
        setProfile(null);
        setPointsStats(null);
        setAchievements(null);
        hasStatsRef.current = false;
        hasAchievementsRef.current = false;
      }
    } finally {
      setProfileLoading(false);
    }

    const pointsEnabled = isResidentFeatureEnabled(nextProfile ?? sessionUser, "points");

    if (!pointsEnabled) {
      setPointsStats(null);
      setAchievements(null);
      hasStatsRef.current = false;
      hasAchievementsRef.current = false;
      setStatsLoading(false);
      setAchievementsLoading(false);
      return;
    }

    // Skeleton only when that section has no data yet; keep prior UI while refreshing.
    if (!hasStatsRef.current) setStatsLoading(true);
    if (!hasAchievementsRef.current) setAchievementsLoading(true);

    void fetchPointsStats()
      .then((statsData) => {
        setPointsStats(statsData);
        hasStatsRef.current = true;
      })
      .catch(() => {
        if (!hasStatsRef.current) setPointsStats(null);
      })
      .finally(() => setStatsLoading(false));

    void fetchAchievements()
      .then((achievementsData) => {
        setAchievements(achievementsData);
        hasAchievementsRef.current = true;
      })
      .catch(() => {
        if (!hasAchievementsRef.current) setAchievements(null);
      })
      .finally(() => setAchievementsLoading(false));
  }, [sessionUser]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const fields = getProfileFields(profile ?? sessionUser);
  const { changePhoto, uploading, uploadFailed, ProfilePhotoViewerModal } = useProfilePhoto({
    onUpdated: (data) => {
      setProfile(data);
      hasProfileRef.current = true;
      setProfileLoading(false);
    },
    avatarUrl: fields.avatarUrl,
  });
  const unitLine = formatResidentUnitLabel(profile ?? sessionUser, t, "profile");
  const regionLine = fields.regionTitle || null;
  const roleKey =
    fields.role === "guest"
      ? "guest"
      : fields.role === "community_admin" || fields.role === "admin"
        ? "admin"
        : "resident";
  const roleLabel = t(`profile.roles.${roleKey}`);
  const showSubscriptionTab = isCommunityAdmin(profile ?? sessionUser);
  const showSettingsGear = isCommunityAdmin(profile ?? sessionUser);
  const featureUser = profile ?? sessionUser;
  const showPoints = isResidentFeatureEnabled(featureUser, "points");
  const showPosts = isResidentFeatureEnabled(featureUser, "feed");
  const statsRowCount = [showPoints, showPoints, showPosts, showPoints].filter(Boolean).length;

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        title={t("profile.title")}
        iconOnly
        right={
          showSettingsGear ? (
            <Pressable
              onPress={() => router.push("/screens/settings")}
              style={styles.headerBtn}
              accessibilityLabel={t("profile.settings")}
            >
              <Feather name="settings" size={sf(17)} color={Colors.textPrimary} />
            </Pressable>
          ) : null
        }
      />

      {showSubscriptionTab ? (
        <View style={styles.tabBarWrap}>
          <View style={styles.tabBar}>
            {[
              { id: "profile", labelKey: "profile.tabs.profile", icon: "user" },
              { id: "subscription", labelKey: "profile.tabs.subscription", icon: "credit-card" },
            ].map((tab) => {
              const active = activeTab === tab.id;
              const label = t(tab.labelKey);
              return (
                <Pressable
                  key={tab.id}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                  onPress={() => setActiveTab(tab.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                >
                  <Feather
                    name={tab.icon}
                    size={sf(14)}
                    color={active ? "#FFFFFF" : Colors.textSecondary}
                  />
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {showSubscriptionTab && activeTab === "subscription" ? (
        <ProfileSubscriptionTab />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {profileLoading ? (
            <ProfileIdentitySkeleton />
          ) : (
            <View style={styles.identityCard}>
              <Pressable
                onPress={changePhoto}
                disabled={uploading}
                style={styles.avatarTap}
              >
                <View style={styles.avatarRing}>
                  <ProfilePhotoAvatar
                    avatarUrl={fields.avatarUrl}
                    size={sw(84)}
                    uploading={uploading}
                    uploadFailed={uploadFailed}
                  />
                </View>
              </Pressable>

              <Text style={styles.name}>
                {fields.displayName || fields.displayPhone || t("nav.welcome")}
              </Text>

              {fields.displayEmail || (fields.displayName && fields.displayPhone) ? (
                <Text style={styles.emailLine} numberOfLines={1}>
                  {fields.displayEmail || fields.displayPhone}
                </Text>
              ) : null}

              {fields.bio?.trim() ? (
                <Text style={styles.bioLine} numberOfLines={3}>
                  {fields.bio.trim()}
                </Text>
              ) : null}

              <View style={styles.metaRow}>
                <View style={styles.roleChip}>
                  <View style={styles.roleDot} />
                  <Text style={styles.roleChipText}>{roleLabel}</Text>
                </View>

                {showPoints ? (
                  <Pressable
                    onPress={() => router.push("/screens/profile/points-history")}
                    android_ripple={{ color: "rgba(0,82,223,0.08)" }}
                    style={styles.pointsPill}
                  >
                    <Feather name="star" size={sf(12)} color={Colors.brandPrimaryDeep} />
                    {statsLoading && !pointsStats ? (
                      <View style={styles.pointsPillSkeleton} />
                    ) : (
                      <Text style={styles.pointsPillText}>
                        {formatPoints(pointsStats?.total_points ?? 0)} {t("points.ptsLabel")}
                      </Text>
                    )}
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.divider} />

              <View style={styles.placeRow}>
                <View style={styles.placeIcon}>
                  <Feather name="map-pin" size={sf(16)} color={Colors.brandPrimaryDeep} />
                </View>
                <View style={styles.placeCopy}>
                  <Text style={styles.placeEyebrow}>{t("profile.yourCommunity")}</Text>
                  <Text style={styles.placeTitle} numberOfLines={1}>
                    {fields.communityName}
                  </Text>
                  {(unitLine || regionLine) && (
                    <Text style={styles.placeMeta} numberOfLines={1}>
                      {[unitLine, regionLine].filter(Boolean).join("  ·  ")}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          )}

          {showPoints || showPosts ? (
            statsLoading && !pointsStats ? (
              <ProfileStatsSkeleton rows={statsRowCount || 3} />
            ) : (
              <ProfileStats stats={pointsStats} showPoints={showPoints} showPosts={showPosts} />
            )
          ) : null}

          {showPoints ? (
            achievementsLoading && !achievements ? (
              <ProfileAchievementsSkeleton />
            ) : (
              <RecentAchievements achievements={achievements} />
            )
          ) : null}

          <QuickAccess />
        </ScrollView>
      )}
      <ProfilePhotoViewerModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  scrollContent: {
    paddingBottom: hp(5),
  },
  tabBarWrap: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(8),
    paddingBottom: sw(10),
  },
  tabBar: {
    flexDirection: "row",
    gap: sw(8),
  },
  tabButton: {
    flex: 1,
    minHeight: sw(40),
    borderRadius: sw(12),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    ...Platform.select({
      ios: { borderCurve: "continuous" },
      default: {},
    }),
  },
  tabButtonActive: {
    backgroundColor: Colors.brandPrimaryDeep,
    borderColor: Colors.brandPrimaryDeep,
  },
  tabLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: "#FFFFFF",
  },
  headerBtn: {
    width: sw(38),
    height: sw(38),
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  identityCard: {
    marginHorizontal: Layout.screenPadding,
    marginTop: sw(6),
    backgroundColor: Colors.surface,
    borderRadius: Layout.cardRadius + 2,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingTop: sw(22),
    paddingHorizontal: sw(18),
    paddingBottom: sw(6),
    alignItems: "center",
    ...rnShadow({ color: "#000", offset: { width: 0, height: 1 }, opacity: 0.03, radius: 4 }),
    elevation: 1,
  },
  avatarTap: {
    marginBottom: sw(12),
  },
  avatarRing: {
    padding: sw(4),
    borderRadius: sw(999),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E9F3",
    ...rnShadow({ color: "#000", offset: { width: 0, height: 1 }, opacity: 0.03, radius: 3 }),
    elevation: 1,
  },
  name: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(20),
    lineHeight: sf(26),
    color: Colors.textPrimary,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  emailLine: {
    marginTop: sw(4),
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textSecondary,
    textAlign: "center",
    maxWidth: "100%",
  },
  bioLine: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: Colors.textBody,
    textAlign: "center",
    maxWidth: "100%",
    paddingHorizontal: sw(8),
  },
  metaRow: {
    marginTop: sw(10),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
  },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
  },
  roleDot: {
    width: sw(6),
    height: sw(6),
    borderRadius: sw(3),
    backgroundColor: Colors.textSecondary,
  },
  roleChipText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(11),
    color: Colors.textBody,
  },
  pointsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    backgroundColor: "#D1FAF5",
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    overflow: "hidden",
    minHeight: sw(26),
  },
  pointsPillSkeleton: {
    width: sw(48),
    height: sf(11),
    borderRadius: 999,
    backgroundColor: "rgba(27, 79, 138, 0.18)",
  },
  pointsPillText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(11),
    color: Colors.brandPrimaryDeep,
  },
  divider: {
    alignSelf: "stretch",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0, 0, 0, 0.07)",
    marginTop: sw(18),
    marginBottom: sw(4),
  },
  placeRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(12),
  },
  placeIcon: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  placeCopy: {
    flex: 1,
    minWidth: 0,
  },
  placeEyebrow: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(10),
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Colors.brandPrimary,
    marginBottom: sw(2),
  },
  placeTitle: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(14),
    lineHeight: sf(19),
    color: Colors.textPrimary,
  },
  placeMeta: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(12),
    lineHeight: sf(16),
    color: Colors.textSecondary,
  },
});
