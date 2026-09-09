import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";
import { arrowBack, arrowForward } from "../../utils/rtl";

const NAVY = "#1B4F8A";
const WHITE = "#FFFFFF";
const CANVAS = "#F4FBFD";
const MUTED = "#64748B";
const TITLE_MUTED = "#94A3B8";
const SLATE = "#64748B";
const BORDER = "#CBD5E1";

export default function WellnessLessonNav({ previousLesson, nextLesson, onOpen }) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <NavButton
          variant="prev"
          label={t("wellness.previousLesson")}
          title={previousLesson?.title || t("wellness.noPreviousLesson")}
          disabled={!previousLesson}
          onPress={() => onOpen(previousLesson)}
        />
        <NavButton
          variant="next"
          label={t("wellness.nextLesson")}
          title={nextLesson?.title || t("wellness.noNextLesson")}
          disabled={!nextLesson}
          onPress={() => onOpen(nextLesson)}
        />
      </View>
    </View>
  );
}

function NavButton({ variant, label, title, disabled, onPress }) {
  const isNext = variant === "next";
  const filled = isNext;
  const labelColor = filled ? WHITE : disabled ? MUTED : NAVY;
  const titleColor = filled ? WHITE : disabled ? TITLE_MUTED : NAVY;
  const iconColor = filled ? WHITE : disabled ? MUTED : NAVY;

  return (
    <TouchableOpacity
      activeOpacity={disabled ? 1 : 0.86}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={`${label}. ${title}`}
      style={styles.hit}
    >
      <View
        style={[
          styles.card,
          filled
            ? { backgroundColor: disabled ? SLATE : NAVY, borderColor: disabled ? SLATE : NAVY }
            : {
                backgroundColor: disabled ? CANVAS : WHITE,
                borderColor: disabled ? BORDER : NAVY,
              },
        ]}
      >
        {isNext ? null : (
          <View
            style={[
              styles.icon,
              { backgroundColor: disabled ? "#E2E8F0" : "#DBEAFE" },
            ]}
          >
            <Feather name={arrowBack()} size={sf(16)} color={iconColor} />
          </View>
        )}
        <View style={styles.copy}>
          <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.title, { color: titleColor }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {isNext ? (
          <View style={[styles.icon, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
            <Feather name={arrowForward()} size={sf(16)} color={iconColor} />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    paddingHorizontal: sw(18),
    paddingTop: sw(10),
    paddingBottom: sw(10),
    backgroundColor: CANVAS,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  row: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    alignItems: "stretch",
  },
  hit: {
    width: "48%",
  },
  card: {
    width: "100%",
    minHeight: sw(84),
    borderWidth: 2,
    borderRadius: sw(16),
    paddingVertical: sw(12),
    paddingHorizontal: sw(12),
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: sw(8),
  },
  label: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(15),
    fontWeight: "600",
    includeFontPadding: false,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(17),
    fontWeight: "700",
    marginTop: sw(3),
    includeFontPadding: false,
  },
});
