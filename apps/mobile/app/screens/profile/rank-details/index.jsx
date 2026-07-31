import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import InternalPageShell, { SectionLabel } from "../../../../components/layout/internal-page-shell";
import { Fonts } from "../../../../constants/font";
import { pageStyles } from "../../../../constants/page-styles";
import { PointsHistorySkeleton } from "../../../../components/ui/skeleton-loader";
import {
  fetchRankDetails,
  formatPoints,
  formatRank,
} from "../../../../services/points-api";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function RankDetails() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rankData = await fetchRankDetails();
      setData(rankData);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const weekPoints = data?.points_this_week ?? 0;
  const peopleBelow = data?.people_below ?? 0;

  return (
    <InternalPageShell title="Rank Details" subtitle="Your community standing" contentStyle={pageStyles.scrollBottom}>
      {loading ? (
        <PointsHistorySkeleton />
      ) : (
        <>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, styles.rankCard]}>
              <Text style={styles.summaryLabel}>Current Rank</Text>
              <Text style={styles.rankValue}>{formatRank(data?.rank)}</Text>
            </View>
            <View style={[styles.summaryCard, styles.pointsCard]}>
              <View style={styles.weekHeader}>
                <Feather name="award" size={14} color="#059669" />
                <Text style={styles.summaryLabel}>Total Points</Text>
              </View>
              <Text style={styles.pointsValue}>{formatPoints(data?.total_points ?? 0)}</Text>
            </View>
          </View>

          <View style={styles.metaCard}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>This week</Text>
              <Text style={styles.metaValue}>+{formatPoints(weekPoints)} pts</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Community members</Text>
              <Text style={styles.metaValue}>{data?.community_members ?? 0}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>People below you</Text>
              <Text style={styles.metaValue}>
                {peopleBelow === 1 ? "1 person" : `${peopleBelow} people`}
              </Text>
            </View>
            {data?.points_to_next_rank != null && data?.next_rank != null ? (
              <View style={[styles.metaRow, styles.metaRowLast]}>
                <Text style={styles.metaLabel}>Points to rank #{data.next_rank}</Text>
                <Text style={styles.metaValue}>{formatPoints(data.points_to_next_rank)}</Text>
              </View>
            ) : null}
          </View>

          <SectionLabel>Community Rankings</SectionLabel>
          {(data?.entries ?? []).length === 0 ? (
            <Text style={styles.emptyText}>No community rankings yet.</Text>
          ) : (
            (data?.entries ?? []).map((entry) => (
              <View
                key={entry.user_id}
                style={[styles.entryRow, entry.is_me && styles.entryRowMe]}
              >
                <View style={styles.entryLeft}>
                  <View style={[styles.rankBadge, entry.is_me && styles.rankBadgeMe]}>
                    <Text style={[styles.rankBadgeText, entry.is_me && styles.rankBadgeTextMe]}>
                      #{entry.rank}
                    </Text>
                  </View>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(entry.name)}</Text>
                  </View>
                  <View style={styles.entryBody}>
                    <Text style={styles.entryName}>{entry.name}{entry.is_me ? " (You)" : ""}</Text>
                    <Text style={styles.entryUnit}>
                      {entry.unit_number ? `Unit ${entry.unit_number}` : "Community member"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.entryPoints}>{formatPoints(entry.total_points)}</Text>
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.leaderboardLink}
            onPress={() => router.push("/screens/leaderboard")}
            activeOpacity={0.85}
          >
            <Text style={styles.leaderboardLinkText}>View full leaderboard</Text>
            <Feather name="chevron-right" size={16} color="#0052DF" />
          </TouchableOpacity>
        </>
      )}
    </InternalPageShell>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  rankCard: {
    backgroundColor: "#ECFDF5",
    borderColor: "#86EFAC",
  },
  pointsCard: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
  },
  weekHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    lineHeight: 14,
    color: "#6A7282",
  },
  rankValue: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    lineHeight: 32,
    color: "#059669",
    fontWeight: "700",
  },
  pointsValue: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    lineHeight: 32,
    color: "#D97706",
    fontWeight: "700",
  },
  metaCard: {
    borderWidth: 1,
    borderColor: "#BEDBFF99",
    borderRadius: 14,
    backgroundColor: "#EEF6FF",
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  metaRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  metaLabel: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#4A5565",
  },
  metaValue: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#101828",
    fontWeight: "600",
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB99",
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  entryRowMe: {
    borderColor: "#0EA5E999",
    backgroundColor: "#DBEAFE",
  },
  entryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  rankBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB99",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  rankBadgeMe: {
    backgroundColor: "#0EA5E9",
    borderColor: "#0EA5E999",
  },
  rankBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#364153",
    fontWeight: "600",
  },
  rankBadgeTextMe: {
    color: "#FFFFFF",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0052DF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  entryBody: { flex: 1, gap: 2 },
  entryName: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: "#101828",
    fontWeight: "600",
  },
  entryUnit: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "#6A7282",
  },
  entryPoints: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: "#101828",
    fontWeight: "700",
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#6A7282",
    paddingVertical: 12,
  },
  leaderboardLink: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
  },
  leaderboardLinkText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#0052DF",
    fontWeight: "600",
  },
});
