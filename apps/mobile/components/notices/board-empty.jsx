import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Bookmark,
  Bell,
  CalendarDays,
  CircleAlert,
  Search,
  TriangleAlert,
  UserRoundPen,
  Users,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw } from "../../utils/responsive";

const VISUALS = {
  all: { Icon: Users, backgroundColor: "#E8F1F8", iconColor: T.navy },
  events: { Icon: CalendarDays, backgroundColor: "#FFEDD5", iconColor: "#EA580C" },
  alerts: { Icon: TriangleAlert, backgroundColor: "#FEE2E2", iconColor: "#DC2626" },
  notices: { Icon: Bell, backgroundColor: T.mint, iconColor: T.teal },
  yours: { Icon: UserRoundPen, backgroundColor: "#E8F0F8", iconColor: T.navy },
  saved: { Icon: Bookmark, backgroundColor: "#EEF2FF", iconColor: T.navy },
  search: { Icon: Search, backgroundColor: "#F1F5F9", iconColor: "#64748B" },
  error: { Icon: CircleAlert, backgroundColor: "#FEF2F2", iconColor: "#DC2626" },
};

export default function NoticeBoardEmpty({
  variant = "all",
  title,
  hint,
  onRetry,
}) {
  const { t } = useTranslation();
  const visual = VISUALS[variant] ?? VISUALS.all;
  const Icon = visual.Icon;

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWell, { backgroundColor: visual.backgroundColor }]}>
        <Icon size={sf(26)} color={visual.iconColor} strokeWidth={2} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
        >
          <Text style={styles.retryText}>{t("common.retry")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(32),
    paddingVertical: sw(28),
    gap: sw(8),
  },
  iconWell: {
    width: sw(64),
    height: sw(64),
    borderRadius: sw(32),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(22),
    color: "#1E293B",
    fontWeight: "700",
    textAlign: "center",
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#64748B",
    textAlign: "center",
    maxWidth: sw(280),
  },
  retry: {
    marginTop: sw(8),
    minHeight: sw(36),
    paddingHorizontal: sw(16),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D5DCE6",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  retryPressed: {
    backgroundColor: "#F8FAFC",
  },
  retryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: T.navy,
  },
});
