import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";

/**
 * Sensitive moderation notice for feed posts and polls.
 * Residents see only this block — not the underlying content — until an admin releases it.
 */
export default function FeedSensitiveContent({
  label,
  message,
  reason,
  compact = false,
  style,
}) {
  const { t } = useTranslation();

  const heading =
    label ||
    (compact ? t("feed.sensitiveContent.title") : `⚠️ ${t("feed.sensitiveContent.title")}`);
  const copy = compact
    ? message || t("feed.sensitiveContent.compactMessage")
    : message || t("feed.sensitiveContent.defaultMessage");

  if (compact) {
    return (
      <View style={[styles.compactWrap, style]}>
        <View style={styles.compactIcon}>
          <Feather name="alert-triangle" size={sf(12)} color="#B45309" />
        </View>
        <View style={styles.compactCopy}>
          <Text style={styles.compactTitle} numberOfLines={2}>
            {label || t("feed.sensitiveContent.title")}
          </Text>
          <Text style={styles.compactMessage} numberOfLines={3}>
            {copy}
          </Text>
          {reason ? (
            <Text style={styles.compactReason} numberOfLines={2}>
              {t("feed.sensitiveContent.reasonPrefix", { reason })}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.title}>{heading.startsWith("⚠️") ? heading : `⚠️ ${heading}`}</Text>
      <Text style={styles.message}>{copy}</Text>
      {reason ? (
        <Text style={styles.reason}>{t("feed.sensitiveContent.reasonPrefix", { reason })}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: sw(8),
    padding: sw(14),
    borderRadius: sw(12),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#92400E",
    fontWeight: "700",
  },
  message: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#B45309",
  },
  action: {
    alignSelf: "flex-start",
    marginTop: sw(10),
    minHeight: sw(32),
    paddingHorizontal: sw(12),
    borderRadius: sw(8),
    backgroundColor: "#0A2A43",
    alignItems: "center",
    justifyContent: "center",
  },
  actionPressed: { opacity: 0.85 },
  actionText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  compactWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(8),
    paddingHorizontal: sw(10),
    paddingVertical: sw(8),
    borderRadius: sw(10),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  compactIcon: {
    width: sw(26),
    height: sw(26),
    borderRadius: sw(8),
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  compactCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  compactTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: "#92400E",
    fontWeight: "700",
  },
  compactMessage: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: "#B45309",
  },
  compactReason: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: "#92400E",
  },
  reason: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#92400E",
  },
  compactAction: {
    alignSelf: "flex-start",
    marginTop: sw(6),
    minHeight: sw(28),
    paddingHorizontal: sw(10),
    borderRadius: sw(7),
    backgroundColor: "#0A2A43",
    alignItems: "center",
    justifyContent: "center",
  },
  compactActionText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    lineHeight: sf(13),
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
