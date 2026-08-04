import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";

const DEFAULT_MESSAGE =
  "This post has been reported and hidden due to community guidelines.";

const COMPACT_MESSAGE = "Reported and hidden due to community guidelines.";

/**
 * Sensitive content warning for feed posts.
 * Use compact on constrained home cards so the message fits without overflow.
 */
export default function FeedSensitiveContent({
  message,
  compact = false,
  style,
}) {
  const copy = compact
    ? COMPACT_MESSAGE
    : message || DEFAULT_MESSAGE;

  if (compact) {
    return (
      <View style={[styles.compactWrap, style]}>
        <View style={styles.compactIcon}>
          <Feather name="alert-triangle" size={sf(12)} color="#B45309" />
        </View>
        <View style={styles.compactCopy}>
          <Text style={styles.compactTitle} numberOfLines={1}>
            Sensitive Content
          </Text>
          <Text style={styles.compactMessage} numberOfLines={2}>
            {copy}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.title}>⚠️ Sensitive Content</Text>
      <Text style={styles.message}>{copy}</Text>
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
  compactWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "center",
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
});
