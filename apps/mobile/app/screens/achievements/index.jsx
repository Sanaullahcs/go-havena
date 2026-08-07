import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import InternalPageShell from "../../../components/layout/internal-page-shell";
import { pageStyles } from "../../../constants/page-styles";
import { fetchAchievements } from "../../../services/achievements-api";
import { getFallbackAchievements } from "../../../constants/achievements-fallback";
import { sw, sf } from "../../../utils/responsive";

function AchievementBadgeIcon({ icon, iconColor, iconBg, locked = false }) {
  return (
    <View
      style={[
        styles.badgeIconWrap,
        { backgroundColor: iconBg ?? "#D1FAF5" },
        locked ? styles.badgeIconWrapLocked : null,
      ]}
    >
      <Ionicons
        name={icon ?? "trophy-outline"}
        size={sf(24)}
        color={locked ? "rgba(74, 85, 101, 0.45)" : (iconColor ?? "#0A2A43")}
      />
    </View>
  );
}

const calculatePercentage = (earned, total) => {
  if (!total || total === 0) return 0;

  return Math.round((earned / total) * 100);
};

export default function Achievements() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const achievements = await fetchAchievements();
      setData(achievements);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const earnedBadges = data?.earned ?? [];
  const lockedBagdes = data?.locked?.length
    ? data.locked
    : getFallbackAchievements().locked;
  const earnedCount = data?.earnedCount ?? 0;
  const totalCount = data?.totalCount ?? 8;
  const overallPercent = data?.overallProgressPercent ?? 0;

  return (
    <InternalPageShell
      title={t('achievements.title')}
      subtitle={t('achievements.subtitle', { earned: earnedCount, total: totalCount })}
      contentStyle={pageStyles.scrollBottom}
    >
      <View style={styles.overAllProgress}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={styles.overallProgressTitle}>{t('achievements.overallProgress')}</Text>
          <Text
            style={{
              ...styles.overallProgressTitle,
              color: "rgba(30, 30, 30, 1)",
            }}
          >
            {overallPercent}%
          </Text>
        </View>
        <View style={styles.progressContainer}>
          <View
            style={[
              styles.progressFill,
              { width: `${overallPercent}%` },
            ]}
          />
        </View>
      </View>

      {/* earned badges */}

      <View
        style={{
          paddingVertical: 24,
          borderBottomWidth: 1,
          borderBottomColor: "#E5E7EB80",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Image
            source={require("../../../assets/images/earned-badges.png")}
            style={{ width: 20, height: 20 }}
            contentFit="contain"
          />
          <Text style={styles.overallProgressTitle}>{t('achievements.earnedBadges')}</Text>
        </View>

        <View
          style={{
            paddingTop: 16,
            flex: 1,
          }}
        >
          {earnedBadges.map((item) => (
            <View
              key={item.id}
              style={{
                borderWidth: 1,
                borderColor: "rgba(20, 184, 166, 0.35)",
                borderRadius: 16,
                padding: 22,
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 16,
                flex: 1,
                overflow: "hidden",
                backgroundColor: "#FFFFFF",
                shadowColor: "#000",
                shadowOffset: {
                  width: 0,
                  height: 1,
                },
                shadowOpacity: 0.1,
                shadowRadius: 3,
                elevation: 2,
                marginBottom: 16,
              }}
            >
              <AchievementBadgeIcon
                icon={item.icon}
                iconColor={item.iconColor}
                iconBg={item.iconBg}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.achievementTitle}>{item.title}</Text>
                <Text style={styles.achievementSubtitle}>{item.subtitle}</Text>
                {item.earnedDateLabel ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <Image
                      source={require("../../../assets/images/earned-badges.png")}
                      style={{ width: 20, height: 20 }}
                      contentFit="contain"
                    />
                    <Text style={styles.achievementDate}>{item.earnedDateLabel}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* locked badges */}

      <View
        style={{
          paddingVertical: 24,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Image
            source={require("../../../assets/images/lock-badges.png")}
            style={{ width: 20, height: 20 }}
            contentFit="contain"
          />
          <Text style={styles.overallProgressTitle}>{t('achievements.lockedBadges')}</Text>
        </View>

        <View
          style={{
            paddingTop: 16,
            flex: 1,
          }}
        >
          {lockedBagdes.map((item) => (
            <View
              key={item.id}
              style={{
                borderWidth: 1,
                borderColor: "#E5E7EB99",
                borderRadius: 16,
                padding: 22,
                flexDirection: "column",
                gap: 16,
                flex: 1,
                overflow: "hidden",
                backgroundColor: "#FFFFFF",
                shadowColor: "#000",
                shadowOffset: {
                  width: 0,
                  height: 1,
                },
                shadowOpacity: 0.1,
                shadowRadius: 3,
                elevation: 2,
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 16,
                }}
              >
                <AchievementBadgeIcon
                  icon={item.icon}
                  iconColor={item.iconColor}
                  iconBg={item.iconBg}
                  locked
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.achievementTitle}>{item.title}</Text>
                  <Text style={styles.achievementSubtitle}>
                    {item.subtitle}
                  </Text>
                  <View style={{ marginTop: 4 }}>
                    <Text style={styles.achievementDate}>{item.statusLabel}</Text>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: "column", gap: 8 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={styles.progressText}>{t('achievements.progress')}</Text>
                  <Text style={styles.progressText}>
                    {item.progress.current}/{item.progress.total}
                  </Text>
                </View>

                <View>
                  <View style={styles.progressContainer}>
                    <View
                      style={{
                        width: `${calculatePercentage(item.progress.current, item.progress.total)}%`,
                        height: "100%",
                        backgroundColor: item.progressColor,
                        borderRadius: 10,
                      }}
                    />
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    </InternalPageShell>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderColor: "rgba(229, 231, 235, 0.6)",
    boxShadow: " 0px 1px 2px -1px rgba(0, 0, 0, 0.1)",
    boxShadow: " 0px 1px 3px 0px rgba(0, 0, 0, 0.1)",
    flexDirection: "column",
    gap: 6,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0,
    color: "rgba(0, 0, 0, 1)",
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0,
    color: "rgba(74, 85, 101, 1)",
    flexShrink: 1,
  },
  overAllProgress: {
    backgroundColor: "rgba(233, 248, 255, 1)",
    borderWidth: 1,
    borderColor: "rgba(0, 124, 250, 1)",
    borderRadius: 16,
    padding: 20,
    boxShadow: " 0px 1px 2px -1px rgba(0, 0, 0, 0.1)",
    boxShadow: "0px 1px 3px 0px rgba(0, 0, 0, 0.1)",
    flexDirection: "column",
    gap: 12,
  },
  overallProgressTitle: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 18,
    letterSpacing: 0,
    color: "rgba(54, 65, 83, 1)",
  },
  progressContainer: {
    width: "100%",
    height: 8,
    backgroundColor: "#E5E5E5",
    borderRadius: 10,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    backgroundColor: "rgba(254, 154, 0, 1)",
    borderRadius: 10,
  },
  achievementTitle: {
    fontFamily: Fonts.bold,
    fontWeight: 700,
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: 0,
    color: "rgba(0, 0, 0, 1)",
    marginBottom: 4,
  },
  achievementSubtitle: {
    fontFamily: Fonts.regular,
    fontWeight: 400,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0,
    color: "rgba(54, 65, 83, 1)",
    flexShrink: 1,
  },
  achievementDate: {
    fontFamily: Fonts.medium,
    fontWeight: 500,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0,
    color: "rgba(74, 85, 101, 1)",
  },

  progressText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0,
    color: "#4A5565",
  },
  badgeIconWrap: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
  },
  badgeIconWrapLocked: {
    opacity: 0.72,
  },
});
