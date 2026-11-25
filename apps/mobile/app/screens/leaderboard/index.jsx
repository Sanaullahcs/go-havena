import { View, Text, StyleSheet } from "react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Feather, Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import UserAvatar from "../../../components/ui/user-avatar";
import { LeaderboardSkeleton } from "../../../components/ui/skeleton-loader";
import { pageStyles } from "../../../constants/page-styles";
import { Fonts } from "../../../constants/font";
import { Colors, Layout } from "../../../constants/tokens";
import { sw, sf } from "../../../utils/responsive";
import { fetchMe } from "../../../services/profile-api";
import {
  fetchLeaderboard,
  fetchPointsStats,
  formatPoints,
  formatRank,
} from "../../../services/points-api";
import { getProfileFields } from "../../../utils/profile-display";
import { useFocusEffect } from "expo-router";
import { rnShadow } from "../../../utils/shadow";


/** Medal palette for the top three positions. */
const MEDALS = {
  1: { ring: "#FBBF24", soft: "#FEF3C7", text: "#B45309", label: "1st" },
  2: { ring: "#B6C2D2", soft: "#EEF2F7", text: "#546074", label: "2nd" },
  3: { ring: "#D69A5C", soft: "#FBEFE2", text: "#9A5B22", label: "3rd" },
};

const NEUTRAL_RANK = { soft: "#D1FAF5", text: Colors.brandPrimaryDeep };

const PODIUM_ORDER = [2, 1, 3];

function firstName(name, fallback = "Member") {
  return name?.split(" ")[0] ?? fallback;
}

export default function LeaderBoard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const [myRank, setMyRank] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [profileData, statsData, boardData] = await Promise.all([
        fetchMe().catch(() => null),
        fetchPointsStats().catch(() => null),
        fetchLeaderboard().catch(() => ({ entries: [], my_rank: null })),
      ]);
      setProfile(profileData);
      setStats(statsData);
      setEntries(boardData.entries ?? []);
      setMyRank(boardData.my_rank ?? null);
    } catch {
      setProfile(null);
      setStats(null);
      setEntries([]);
      setMyRank(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const profileFields = useMemo(() => getProfileFields(profile), [profile]);
  const myEntry = useMemo(
    () => entries.find((entry) => entry.is_me) ?? null,
    [entries],
  );
  const resolvedRank = myRank ?? myEntry?.rank ?? stats?.rank ?? null;

  const podium = useMemo(() => {
    return PODIUM_ORDER.map((rank) => {
      const entry = entries.find((item) => item.rank === rank);
      if (!entry) return null;
      return {
        rank,
        id: entry.user_id,
        name: firstName(entry.name, t('achievements.member')),
        avatar: entry.avatar_url,
        points: formatPoints(entry.total_points),
        highlight: entry.is_me,
      };
    }).filter(Boolean);
  }, [entries]);

  const podiumLayout = podium.length <= 1 ? "single" : podium.length === 2 ? "double" : "triple";

  const peopleBelow = resolvedRank
    ? Math.max(entries.length - resolvedRank, 0)
    : 0;
  const weekPoints = stats?.points_this_week ?? 0;
  const nextRank = resolvedRank && resolvedRank > 1 ? resolvedRank - 1 : null;
  const pointsToNext = stats?.points_to_next_rank;
  const myPoints = myEntry?.total_points ?? stats?.total_points ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t('achievements.leaderboardTitle')}
        subtitle={t('achievements.leaderboardSubtitle')}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={pageStyles.scrollBottom}
      >
        {loading ? (
          <LeaderboardSkeleton />
        ) : (
          <View style={styles.body}>
            {/* Your position */}
            <View style={styles.positionCard}>
              <View style={styles.positionTop}>
                <Text style={styles.positionEyebrow}>{t('achievements.yourPosition')}</Text>
                {weekPoints > 0 ? (
                  <View style={styles.weekChip}>
                    <Feather name="trending-up" size={sf(12)} color={Colors.brandPrimaryDeep} />
                    <Text style={styles.weekChipText}>
                      {t('achievements.thisWeek', { points: formatPoints(weekPoints) })}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.positionMain}>
                <UserAvatar
                  source={profileFields.avatarUrl}
                  name={profileFields.displayName}
                  size={sw(52)}
                />
                <View style={styles.positionCopy}>
                  <Text style={styles.positionName} numberOfLines={1}>
                    {profileFields.displayName}
                  </Text>
                  <Text style={styles.positionSub} numberOfLines={1}>
                    {profileFields.unitNumber
                      ? t('achievements.unit', { number: profileFields.unitNumber })
                      : profileFields.communityName}
                  </Text>
                </View>
                <View style={styles.positionRankBox}>
                  <Text style={styles.positionRank}>{formatRank(resolvedRank)}</Text>
                  <Text style={styles.positionPoints}>{t('achievements.pointsValue', { points: formatPoints(myPoints) })}</Text>
                </View>
              </View>

              {peopleBelow > 0 ? (
                <View style={styles.positionFoot}>
                  <Feather name="users" size={sf(12)} color={Colors.textMuted} />
                  <Text style={styles.positionFootText}>
                    {peopleBelow === 1
                      ? t('achievements.oneNeighborBelow')
                      : t('achievements.neighborsBelow', { count: peopleBelow })}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Top performers podium */}
            {podium.length > 0 ? (
              <View style={styles.card}>
                <View style={styles.sectionHead}>
                  <Ionicons name="trophy" size={sf(15)} color="#F59E0B" />
                  <Text style={styles.sectionTitle}>{t('achievements.topPerformers')}</Text>
                </View>

                <View
                  style={[
                    styles.podium,
                    podiumLayout === "single" && styles.podiumSingle,
                    podiumLayout === "double" && styles.podiumDouble,
                  ]}
                >
                  {podium.map((item) => {
                    const medal = MEDALS[item.rank];
                    const isFirst = item.rank === 1;
                    const avatarSize = isFirst ? sw(72) : sw(56);

                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.podiumCol,
                          podiumLayout !== "single" && styles.podiumColFlex,
                          isFirst && styles.podiumColFirst,
                        ]}
                      >
                        {isFirst ? (
                          <Ionicons
                            name="star"
                            size={sf(16)}
                            color="#F59E0B"
                            style={styles.crown}
                          />
                        ) : null}

                        <View
                          style={[
                            styles.podiumAvatar,
                            { borderColor: medal.ring, padding: isFirst ? 3 : 2 },
                          ]}
                        >
                          <UserAvatar
                            source={item.avatar}
                            name={item.name}
                            size={avatarSize}
                          />
                          <View style={[styles.medalBadge, { backgroundColor: medal.ring }]}>
                            <Text style={styles.medalBadgeText}>{item.rank}</Text>
                          </View>
                        </View>

                        <Text style={styles.podiumName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View style={[styles.podiumPointsPill, { backgroundColor: medal.soft }]}>
                          <Text style={[styles.podiumPoints, { color: medal.text }]}>
                            {item.points}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Community rankings */}
            <View style={styles.card}>
              <View style={styles.sectionHead}>
                <Feather name="bar-chart-2" size={sf(15)} color={Colors.brandPrimaryDeep} />
                <Text style={styles.sectionTitle}>{t('achievements.communityRankings')}</Text>
              </View>

              {entries.length === 0 ? (
                <Text style={styles.emptyText}>{t('achievements.noMembersRanked')}</Text>
              ) : (
                <View style={styles.list}>
                  {entries.map((entry) => {
                    const medal = MEDALS[entry.rank];
                    const badgeSoft = medal?.soft ?? NEUTRAL_RANK.soft;
                    const badgeText = medal?.text ?? NEUTRAL_RANK.text;

                    return (
                      <View
                        key={entry.user_id}
                        style={[styles.listRow, entry.is_me && styles.listRowMe]}
                      >
                        <View style={[styles.rankBadge, { backgroundColor: badgeSoft }]}>
                          <Text style={[styles.rankBadgeText, { color: badgeText }]}>
                            {entry.rank}
                          </Text>
                        </View>

                        <UserAvatar
                          source={entry.avatar_url}
                          name={entry.name}
                          size={sw(40)}
                        />

                        <View style={styles.listCopy}>
                          <Text style={styles.listName} numberOfLines={1}>
                            {entry.name}
                            {entry.is_me ? `  · ${t('achievements.you')}` : ""}
                          </Text>
                          <Text style={styles.listUnit} numberOfLines={1}>
                            {entry.unit_number
                              ? t('achievements.unit', { number: entry.unit_number })
                              : t('achievements.communityMember')}
                          </Text>
                        </View>

                        <View style={styles.listPointsBox}>
                          <Text style={styles.listPoints}>
                            {formatPoints(entry.total_points)}
                          </Text>
                          <Text style={styles.listPointsLabel}>{t('achievements.pts')}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Points to next */}
            {pointsToNext != null && nextRank != null ? (
              <View style={styles.nextCard}>
                <Feather name="flag" size={sf(14)} color="#B45309" />
                <Text style={styles.nextText}>
                  {t('achievements.pointsToReach', { points: formatPoints(pointsToNext), rank: nextRank })}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const CARD = {
  backgroundColor: Colors.surface,
  borderRadius: sw(16),
  borderWidth: 1,
  borderColor: Colors.borderSubtle,
  ...rnShadow({ color: "#000", offset: { width: 0, height: 1 }, opacity: 0.03, radius: 4 }),
  elevation: 1,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  body: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(8),
    gap: sw(14),
  },

  /* Your position */
  positionCard: {
    ...CARD,
    padding: sw(16),
    gap: sw(14),
  },
  positionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  positionEyebrow: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(11),
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Colors.textMuted,
  },
  weekChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    backgroundColor: "#D1FAF5",
    borderRadius: 999,
    paddingHorizontal: sw(9),
    paddingVertical: sw(4),
  },
  weekChipText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(11),
    color: Colors.brandPrimaryDeep,
  },
  positionMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
  },
  positionCopy: {
    flex: 1,
    minWidth: 0,
  },
  positionName: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(16),
    lineHeight: sf(21),
    color: Colors.textPrimary,
  },
  positionSub: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: Colors.textSecondary,
  },
  positionRankBox: {
    alignItems: "flex-end",
  },
  positionRank: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(22),
    lineHeight: sf(26),
    color: Colors.brandPrimaryDeep,
    letterSpacing: -0.5,
  },
  positionPoints: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(12),
    color: Colors.textSecondary,
  },
  positionFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: sw(12),
  },
  positionFootText: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(12),
    color: Colors.textMuted,
  },

  /* Generic card + section head */
  card: {
    ...CARD,
    padding: sw(16),
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(15),
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },

  /* Podium */
  podium: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    marginTop: sw(22),
  },
  podiumSingle: {
    justifyContent: "center",
  },
  podiumDouble: {
    justifyContent: "center",
    gap: sw(36),
  },
  podiumCol: {
    alignItems: "center",
    gap: sw(6),
  },
  podiumColFlex: {
    flex: 1,
  },
  podiumColFirst: {
    marginBottom: sw(14),
  },
  crown: {
    marginBottom: sw(2),
  },
  podiumAvatar: {
    borderWidth: 2,
    borderRadius: 999,
    position: "relative",
  },
  medalBadge: {
    position: "absolute",
    bottom: -sw(6),
    start: "50%",
    marginStart: -sw(10),
    width: sw(20),
    height: sw(20),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  medalBadgeText: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(10),
    color: "#FFFFFF",
  },
  podiumName: {
    marginTop: sw(8),
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(12),
    color: Colors.textPrimary,
    maxWidth: sw(90),
  },
  podiumPointsPill: {
    borderRadius: 999,
    paddingHorizontal: sw(9),
    paddingVertical: sw(3),
  },
  podiumPoints: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(11),
  },

  /* Rankings list */
  list: {
    marginTop: sw(14),
    gap: sw(8),
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    backgroundColor: "#FFFFFF",
    paddingVertical: sw(10),
    paddingHorizontal: sw(12),
  },
  listRowMe: {
    borderColor: "rgba(20, 184, 166, 0.35)",
    backgroundColor: "#F5F9FF",
  },
  rankBadge: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(9),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rankBadgeText: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(12),
  },
  listCopy: {
    flex: 1,
    minWidth: 0,
  },
  listName: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textPrimary,
  },
  listUnit: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: Colors.textSecondary,
  },
  listPointsBox: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  listPoints: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(14),
    lineHeight: sf(18),
    color: Colors.textPrimary,
  },
  listPointsLabel: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: Colors.textMuted,
  },

  emptyText: {
    marginTop: sw(14),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: Colors.textMuted,
  },

  /* Points to next */
  nextCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "rgba(180, 83, 9, 0.18)",
    borderRadius: sw(14),
    paddingVertical: sw(14),
    paddingHorizontal: sw(16),
  },
  nextText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(12),
    color: "#B45309",
    textAlign: "center",
  },
});
