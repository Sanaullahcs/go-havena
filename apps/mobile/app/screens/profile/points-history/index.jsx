import { View, Text, StyleSheet } from "react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import InternalPageShell, { SectionLabel } from "../../../../components/layout/internal-page-shell";
import { Fonts } from "../../../../constants/font";
import { pageStyles } from "../../../../constants/page-styles";
import { PointsHistorySkeleton } from "../../../../components/ui/skeleton-loader";
import {
  fetchPointsHistory,
  fetchPointsStats,
  formatPoints,
} from "../../../../services/points-api";

export default function PointsHistory() {
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, historyData] = await Promise.all([
        fetchPointsStats(),
        fetchPointsHistory(),
      ]);
      setStats(statsData);
      setItems(historyData.items ?? []);
    } catch {
      setStats(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const weekPoints = stats?.points_this_week ?? 0;

  return (
    <InternalPageShell title="Points History" subtitle="Track your wellness rewards" contentStyle={pageStyles.scrollBottom}>
      {loading ? (
        <PointsHistorySkeleton />
      ) : (
        <>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, styles.totalCard]}>
              <Text style={styles.summaryLabel}>Total Points</Text>
              <Text style={styles.totalValue}>{formatPoints(stats?.total_points ?? 0)}</Text>
            </View>
            <View style={[styles.summaryCard, styles.weekCard]}>
              <View style={styles.weekHeader}>
                <Feather name="trending-up" size={14} color="#0EA5E9" />
                <Text style={styles.summaryLabel}>This Week</Text>
              </View>
              <Text style={styles.weekValue}>
                {weekPoints >= 0 ? `+${formatPoints(weekPoints)}` : formatPoints(weekPoints)}
              </Text>
            </View>
          </View>

          <SectionLabel>Recent Activity</SectionLabel>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>No point activity yet.</Text>
          ) : (
            items.map((item) => (
              <View key={item.id} style={styles.activityRow}>
                <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
                  <Feather name={item.icon} size={18} color={item.iconColor} />
                </View>
                <View style={styles.activityBody}>
                  <Text style={styles.activityTitle}>{item.title}</Text>
                  <Text style={styles.activitySub}>{item.subtitle}</Text>
                  <Text style={styles.activityTime}>{item.time}</Text>
                </View>
                <View style={styles.pointsCol}>
                  <Text style={styles.points}>{item.points}</Text>
                  <Text style={styles.pointsLabel}>pts</Text>
                </View>
              </View>
            ))
          )}

          <View style={styles.tip}>
            <Text style={styles.tipText}>
              Earn points by completing courses, engaging with community, and maintaining wellness streaks.
            </Text>
          </View>
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
  totalCard: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
  },
  weekCard: {
    backgroundColor: "#D1FAF5",
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  weekHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    lineHeight: 14,
    color: "#6A7282",
  },
  totalValue: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    lineHeight: 32,
    color: "#D97706",
    fontWeight: "700",
  },
  weekValue: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    lineHeight: 32,
    color: "#0EA5E9",
    fontWeight: "700",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  activityBody: { flex: 1, gap: 2 },
  activityTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: "#101828",
    fontWeight: "600",
  },
  activitySub: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    color: "#6A7282",
  },
  activityTime: {
    fontFamily: Fonts.regular,
    fontSize: 10,
    lineHeight: 13,
    color: "#9CA3AF",
    marginTop: 2,
  },
  pointsCol: { alignItems: "flex-end", flexShrink: 0 },
  points: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 18,
    color: "#059669",
    fontWeight: "700",
  },
  pointsLabel: {
    fontFamily: Fonts.regular,
    fontSize: 10,
    lineHeight: 12,
    color: "#6A7282",
  },
  tip: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  tipText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: "#6A7282",
    textAlign: "center",
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#6A7282",
    paddingVertical: 12,
  },
});
