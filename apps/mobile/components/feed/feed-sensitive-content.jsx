import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";

/**
 * Sensitive content warning for feed posts.
 * Use compact on constrained home cards so the message fits without overflow.
 * Revealing the post is local to this visit and starts hidden again next time.
 */
export default function FeedSensitiveContent({
  message,
  compact = false,
  revealed = false,
  onToggle,
  style,
}) {
  const { t } = useTranslation();

  const copy = compact
    ? t("feed.sensitiveContent.compactMessage")
    : message || t("feed.sensitiveContent.defaultMessage");
  const actionLabel = revealed
    ? t("feed.sensitiveContent.hidePost")
    : t("feed.sensitiveContent.showPost");

  const toggle = (
    <Pressable
      onPress={onToggle}
      disabled={!onToggle}
      hitSlop={8}
      accessibilityRole="button"
      style={({ pressed }) => [
        compact ? styles.compactAction : styles.action,
        pressed && onToggle && styles.actionPressed,
      ]}
    >
      <Text style={compact ? styles.compactActionText : styles.actionText}>{actionLabel}</Text>
    </Pressable>
  );

  if (compact) {
    return (
      <View style={[styles.compactWrap, style]}>
        <View style={styles.compactIcon}>
          <Feather name="alert-triangle" size={sf(12)} color="#B45309" />
        </View>
        <View style={styles.compactCopy}>
          <Text style={styles.compactTitle} numberOfLines={1}>
            {t("feed.sensitiveContent.title")}
          </Text>
          <Text style={styles.compactMessage} numberOfLines={2}>
            {copy}
          </Text>
          {toggle}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.title}>⚠️ {t("feed.sensitiveContent.title")}</Text>
      <Text style={styles.message}>{copy}</Text>
      {toggle}
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
