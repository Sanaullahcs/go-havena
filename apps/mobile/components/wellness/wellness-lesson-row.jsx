import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { getWellnessCategoryMeta } from "../../constants/wellness-theme";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

/** Lesson row — icon, title/subtitle, trailing action. */
export default function WellnessLessonRow({
  categoryKey,
  index = 0,
  title,
  timeLabel,
  completed = false,
  isWatching = false,
  onPress,
}) {
  const { t } = useTranslation();
  const meta = getWellnessCategoryMeta(categoryKey);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: completed ? "#ECFDF5" : meta.bg },
          ]}
        >
          {completed ? (
            <Feather name="check" size={sf(15)} color="#059669" />
          ) : isWatching ? (
            <Feather name="play" size={sf(14)} color={meta.color} />
          ) : (
            <Text style={[styles.indexText, { color: meta.color }]}>
              {index + 1}
            </Text>
          )}
        </View>

        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {timeLabel}
            {isWatching ? ` · ${t("wellness.upNext")}` : completed ? ` · ${t("wellness.lessonDone")}` : ""}
          </Text>
        </View>

        {isWatching ? (
          <View style={[styles.startPill, { backgroundColor: meta.color }]}>
            <Text style={styles.startText}>{t("wellness.start")}</Text>
          </View>
        ) : (
          <View style={styles.chevronWrap}>
            <Feather name={chevronForward()} size={sf(16)} color="#CBD5E1" />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: "100%",
    alignSelf: "stretch",
  },
  pressed: { backgroundColor: "#F8FAFC" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minHeight: sw(56),
    paddingVertical: sw(12),
    paddingHorizontal: sw(14),
    backgroundColor: "#FFFFFF",
  },
  iconWrap: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginEnd: sw(12),
  },
  indexText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "700",
    includeFontPadding: false,
  },
  text: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    marginEnd: sw(8),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#101828",
    fontWeight: "700",
    includeFontPadding: false,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "#6A7282",
    marginTop: sw(2),
    includeFontPadding: false,
  },
  startPill: {
    paddingVertical: sw(6),
    paddingHorizontal: sw(12),
    borderRadius: 999,
    flexShrink: 0,
  },
  startText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    lineHeight: sf(14),
    fontWeight: "700",
    color: "#FFFFFF",
    includeFontPadding: false,
  },
  chevronWrap: {
    width: sw(20),
    height: sw(20),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
