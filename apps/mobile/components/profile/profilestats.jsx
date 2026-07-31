import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Colors, Layout } from "../../constants/tokens";
import { useRouter } from "expo-router";
import { formatRank } from "../../services/points-api";
import { sw, sf } from "../../utils/responsive";

export default function ProfileStats({ stats }) {
  const router = useRouter();

  const rows = useMemo(() => {
    const streak = stats?.current_streak ?? 0;
    const badgesEarned = stats?.badges_earned ?? 0;
    const badgesTotal = stats?.badges_total ?? 8;
    const posts = stats?.community_posts ?? 0;
    const rank = stats?.rank;

    return [
      {
        id: "streak",
        icon: "zap",
        label: "Current streak",
        value: `${streak} day${streak === 1 ? "" : "s"}`,
        route: null,
      },
      {
        id: "badges",
        icon: "award",
        label: "Badges earned",
        value: `${badgesEarned} of ${badgesTotal}`,
        route: "/screens/achievements",
      },
      {
        id: "posts",
        icon: "edit-3",
        label: "Community posts",
        value: String(posts),
        route: "/screens/profile/my-posts",
      },
      {
        id: "rank",
        icon: "bar-chart-2",
        label: "Community rank",
        value: formatRank(rank),
        route: "/screens/leaderboard",
      },
    ];
  }, [stats]);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Activity</Text>

      <View style={styles.card}>
        {rows.map((row, index) => (
          <Pressable
            key={row.id}
            disabled={!row.route}
            onPress={() => row.route && router.push(row.route)}
            android_ripple={row.route ? { color: "rgba(0,82,223,0.08)" } : undefined}
            style={[styles.row, index < rows.length - 1 && styles.rowBorder]}
          >
            <View style={styles.iconBox}>
              <Feather name={row.icon} size={sf(15)} color={Colors.brandPrimaryDeep} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.label} numberOfLines={1}>
                {row.label}
              </Text>
            </View>
            <Text style={styles.value} numberOfLines={1}>
              {row.value}
            </Text>
            {row.route ? (
              <Feather name="chevron-right" size={sf(15)} color="#C5CDD8" />
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(22),
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(12),
    lineHeight: sf(16),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Colors.brandPrimary,
    marginBottom: sw(10),
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.cardRadius,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
    minHeight: sw(56),
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.06)",
  },
  rowPressed: {
    backgroundColor: Colors.surfaceMuted,
  },
  iconBox: {
    width: sw(34),
    height: sw(34),
    borderRadius: sw(10),
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textPrimary,
  },
  value: {
    flexShrink: 0,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textSecondary,
  },
});
