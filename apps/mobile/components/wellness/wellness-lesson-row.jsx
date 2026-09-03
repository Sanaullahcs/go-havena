import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { WellnessTheme } from "../../constants/wellness-theme";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

const NUM = sw(36);
const TICK = sf(16);
const GAP = sw(10);
const TICK_GAP = sw(8);

/** Standalone lesson card matching the course-detail reference layout. */
export default function WellnessLessonRow({
  index = 0,
  title,
  description,
  timeLabel,
  completed = false,
  isWatching = false,
  expanded = false,
  onPress,
}) {
  const { t } = useTranslation();
  const indent = completed ? NUM + GAP + TICK + TICK_GAP : NUM + GAP;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <View style={styles.topRow}>
          <View style={styles.numWrap}>
            <Text style={styles.numText}>{index + 1}</Text>
          </View>
          {completed ? (
            <Feather
              name="check-circle"
              size={TICK}
              color={T.deepTeal}
              style={styles.tick}
            />
          ) : null}
          <Text
            style={[styles.title, { marginStart: completed ? TICK_GAP : GAP }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Feather name={chevronForward()} size={sf(16)} color="#CBD5E1" />
        </View>

        {description ? (
          <Text
            style={[styles.description, { marginStart: indent }]}
            numberOfLines={expanded ? 8 : 2}
          >
            {description}
          </Text>
        ) : null}

        <View style={[styles.metaRow, { marginStart: indent }]}>
          {timeLabel ? (
            <View style={styles.duration}>
              <Feather name="clock" size={sf(12)} color={WellnessTheme.caption} />
              <Text style={styles.meta} numberOfLines={1}>
                {timeLabel}
              </Text>
            </View>
          ) : null}
          {completed ? (
            <View style={styles.donePill}>
              <Text style={styles.donePillText} numberOfLines={1}>
                {t("wellness.lessonDone")}
              </Text>
            </View>
          ) : isWatching ? (
            <View style={styles.nextPill}>
              <Text style={styles.nextPillText} numberOfLines={1}>
                {t("wellness.upNext")}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(18),
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    paddingVertical: sw(14),
    paddingHorizontal: sw(14),
    marginBottom: sw(10),
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  pressed: {
    opacity: 0.92,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  numWrap: {
    width: NUM,
    height: NUM,
    borderRadius: sw(12),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  numText: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(19),
    fontWeight: "700",
    color: T.deepTeal,
    includeFontPadding: false,
  },
  tick: {
    marginStart: GAP,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    marginEnd: sw(8),
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(19),
    fontWeight: "700",
    color: WellnessTheme.text,
    includeFontPadding: false,
  },
  description: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: WellnessTheme.textMuted,
    marginTop: sw(6),
    includeFontPadding: false,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: sw(8),
    marginTop: sw(8),
  },
  duration: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    flexShrink: 0,
  },
  meta: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: WellnessTheme.caption,
    includeFontPadding: false,
  },
  donePill: {
    backgroundColor: T.teal,
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderRadius: 999,
    flexShrink: 0,
  },
  donePillText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontWeight: "600",
    color: "#FFFFFF",
    includeFontPadding: false,
  },
  nextPill: {
    backgroundColor: "#E8F1FA",
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderRadius: 999,
    flexShrink: 0,
  },
  nextPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    fontWeight: "600",
    color: T.navy,
    includeFontPadding: false,
  },
});
