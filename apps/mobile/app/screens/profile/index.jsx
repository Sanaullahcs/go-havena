import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import React, { useState, useCallback } from "react";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Fonts } from "../../../constants/font";
import { Colors, Layout } from "../../../constants/tokens";
import ScreenHeader from "../../../components/layout/screen-header";
import ProfilePhotoAvatar from "../../../components/profile/profile-photo-avatar";
import ProfileStats from "../../../components/profile/profilestats";
import RecentAchievements from "../../../components/profile/recentAchievements";
import QuickAccess from "../../../components/profile/quickAccess";
import { ProfileSkeleton } from "../../../components/ui/skeleton-loader";
import { fetchMe } from "../../../services/profile-api";
import { fetchPointsStats, formatPoints } from "../../../services/points-api";
import { fetchAchievements } from "../../../services/achievements-api";
import { getProfileFields, getRoleLabel } from "../../../utils/profile-display";
import { useProfilePhoto } from "../../../hooks/use-profile-photo";
import { sw, sf, hp } from "../../../utils/responsive";

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [pointsStats, setPointsStats] = useState(null);
  const [achievements, setAchievements] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [profileData, statsData, achievementsData] = await Promise.all([
        fetchMe(),
        fetchPointsStats().catch(() => null),
        fetchAchievements().catch(() => null),
      ]);
      setProfile(profileData);
      setPointsStats(statsData);
      setAchievements(achievementsData);
    } catch {
      setProfile(null);
      setPointsStats(null);
      setAchievements(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const { changePhoto, uploading } = useProfilePhoto({
    onUpdated: (data) => setProfile(data),
  });

  const fields = getProfileFields(profile);
  const unitLine = fields.unitNumber ? `Unit ${fields.unitNumber}` : null;
  const regionLine = fields.regionTitle || null;
  const roleLabel = getRoleLabel(profile);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        title="Profile"
        showBack={false}
        iconOnly
        right={
          <Pressable
            onPress={() => router.push("/screens/settings")}
            style={styles.headerBtn}
            accessibilityLabel="Settings"
          >
            <Feather name="settings" size={sf(17)} color={Colors.textPrimary} />
          </Pressable>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <ProfileSkeleton />
        ) : (
          <>
            {/* Identity card */}
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
                  />
                </View>
              </Pressable>

              <Text style={styles.name}>{fields.displayName}</Text>

              {fields.displayEmail ? (
                <Text style={styles.emailLine} numberOfLines={1}>
                  {fields.displayEmail}
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

                <Pressable
                  onPress={() => router.push("/screens/profile/points-history")}
                  android_ripple={{ color: "rgba(0,82,223,0.08)" }}
                  style={styles.pointsPill}
                >
                  <Feather name="star" size={sf(12)} color={Colors.brandPrimaryDeep} />
                  <Text style={styles.pointsPillText}>
                    {formatPoints(pointsStats?.total_points ?? 0)} pts
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.photoHint}>
                {fields.avatarUrl ? "Tap photo to update" : "Add a profile photo"}
              </Text>

              <View style={styles.divider} />

              <View style={styles.placeRow}>
                <View style={styles.placeIcon}>
                  <Feather name="map-pin" size={sf(16)} color={Colors.brandPrimaryDeep} />
                </View>
                <View style={styles.placeCopy}>
                  <Text style={styles.placeEyebrow}>Your community</Text>
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
          </>
        )}

        {!loading ? <ProfileStats stats={pointsStats} /> : null}
        <RecentAchievements achievements={achievements} />
        <QuickAccess />
      </ScrollView>
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
  pressed: {
    opacity: 0.9,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
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
  },
  pointsPillText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(11),
    color: Colors.brandPrimaryDeep,
  },
  photoHint: {
    marginTop: sw(8),
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(11),
    color: Colors.textSecondary,
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
