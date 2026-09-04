import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BackButton from "../ui/back-button";
import { Fonts } from "../../constants/font";
import { getWellnessCategoryMeta, WellnessTheme } from "../../constants/wellness-theme";
import { getTopInset } from "../layout/system-chrome";
import { sf, sw } from "../../utils/responsive";

/** Flat white header — title only, no category icon. */
export default function WellnessScreenHeader({
  title,
  subtitle,
  categoryKey,
  onBack,
  right,
  subtitleColor,
}) {
  const insets = useSafeAreaInsets();
  const topInset = getTopInset(insets);
  const meta = categoryKey ? getWellnessCategoryMeta(categoryKey) : null;

  return (
    <View style={[styles.header, { paddingTop: sw(12) + topInset }]}>
      <View style={styles.navRow}>
        <BackButton onPress={onBack} iconOnly compact />

        <View style={styles.textBlock}>
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text
              style={[
                styles.subtitle,
                { color: subtitleColor ?? meta?.color ?? WellnessTheme.brand },
              ]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: WellnessTheme.surface,
    paddingBottom: sw(12),
    paddingHorizontal: sw(18),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: WellnessTheme.border,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: sw(44),
    gap: sw(10),
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(21),
    fontWeight: "700",
    color: WellnessTheme.text,
    includeFontPadding: false,
  },
  subtitle: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    fontWeight: "500",
    marginTop: sw(2),
    includeFontPadding: false,
  },
  right: {
    flexShrink: 0,
    marginStart: sw(8),
  },
});
