import React, { useMemo } from "react";
import { View, Text, StyleSheet, Platform, PixelRatio } from "react-native";
import { formatUnreadBadgeCount } from "../../hooks/use-notification-unread";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

const BADGE_RED = "#FF3B30";

function px(value) {
  return PixelRatio.roundToNearestPixel(value);
}

function evenPx(value) {
  const rounded = px(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/** Tight iOS-style badge — width derived from digit count so "18" stays compact. */
function getBadgeMetrics(label, isCompact) {
  const height = evenPx(sw(isCompact ? 16 : 18));
  const fontSize = sf(isCompact ? 9 : 10);
  const hPad = px(sw(isCompact ? 3.5 : 4));
  const charStep = px(sw(isCompact ? 5.5 : 6));
  const inset = px(sw(isCompact ? 4 : 5));
  const len = label.length;

  if (len === 1) {
    return {
      width: height,
      height,
      fontSize,
      borderRadius: height / 2,
      inset,
    };
  }

  const width = evenPx(Math.max(height + 2, len * charStep + hPad * 2));

  return {
    width,
    height,
    fontSize,
    borderRadius: height / 2,
    inset,
  };
}

export default function NotificationCountBadge({ count, size = "md", style, label = "notifications" }) {
  const badgeLabel = count > 0 ? formatUnreadBadgeCount(count) : "";
  const isCompact = size === "sm";
  const metrics = useMemo(
    () => (badgeLabel ? getBadgeMetrics(badgeLabel, isCompact) : null),
    [badgeLabel, isCompact],
  );

  if (!count || count <= 0 || !metrics) return null;

  const { width, height, fontSize, borderRadius, inset } = metrics;

  return (
    <View
      style={[
        styles.badge,
        {
          top: -inset,
          right: -inset,
          width,
          height,
          minWidth: width,
          maxWidth: width,
          minHeight: height,
          maxHeight: height,
          borderRadius,
        },
        style,
      ]}
      accessibilityLabel={`${count} unread ${label}`}
    >
      <Text
        allowFontScaling={false}
        style={[styles.text, { fontSize, lineHeight: fontSize + 2, maxWidth: width - 4 }]}
        numberOfLines={1}
      >
        {badgeLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    zIndex: 2,
    backgroundColor: BADGE_RED,
    borderColor: "#FFFFFF",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
    flexGrow: 0,
    paddingHorizontal: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOpacity: 0.2,
        shadowRadius: 1.5,
        shadowOffset: { width: 0, height: 1 },
      },
      android: {
        elevation: 3,
      },
    }),
  },
  text: {
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
    fontWeight: "700",
    textAlign: "center",
    includeFontPadding: false,
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
    ...Platform.select({
      ios: {
        marginTop: -0.5,
      },
      android: {
        textAlignVertical: "center",
      },
    }),
  },
});
