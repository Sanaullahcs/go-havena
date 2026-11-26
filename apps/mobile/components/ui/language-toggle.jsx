import React, { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLanguage } from "../../providers/language-provider";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw, sf } from "../../utils/responsive";
import LanguageMenu from "./language-menu";

const LANGS = [
  { code: "en", nativeLabel: "English", mark: "EN" },
  { code: "es", nativeLabel: "Español", mark: "ES" },
  { code: "ar", nativeLabel: "العربية", mark: "ع" },
];

const CHIP_H = sw(36);
const GLYPH = sf(16);

/** Inline so the Arabic metrics patch does not add extra font padding. */
const arabicInk = {
  includeFontPadding: false,
  textAlignVertical: "center",
  textAlign: "left",
  writingDirection: "ltr",
  fontSize: sf(13),
  lineHeight: sf(18),
};

export default function LanguageToggle({ headerRef, compact = false }) {
  const { language, changeLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const current = LANGS.find((item) => item.code === language) || LANGS[0];

  return (
    <>
      <View ref={triggerRef} collapsable={false} style={styles.anchor}>
        <Pressable
          style={({ pressed }) => [
            styles.trigger,
            compact && styles.triggerCompact,
            pressed && styles.triggerPressed,
            open && styles.triggerOpen,
          ]}
          onPress={() => setOpen((value) => !value)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Language ${current.nativeLabel}`}
        >
          <View style={[styles.triggerRow, compact && styles.triggerRowCompact]} pointerEvents="none">
            <View style={styles.glyph}>
              <Feather name="globe" size={sf(14)} color={open ? T.deepTeal : T.navy} />
            </View>
            <View style={[styles.labelSlot, compact && styles.labelSlotCompact]}>
              <Text
                style={[
                  styles.label,
                  compact && styles.labelMark,
                  current.code === "ar" && styles.labelAr,
                  current.code === "ar" && arabicInk,
                  current.code === "ar" && compact && styles.labelMarkAr,
                ]}
                numberOfLines={1}
              >
                {compact ? current.mark : current.nativeLabel}
              </Text>
            </View>
            <View style={styles.caret}>
              <Feather
                name={open ? "chevron-up" : "chevron-down"}
                size={sf(12)}
                color={open ? T.deepTeal : "#7B8DA3"}
              />
            </View>
          </View>
        </Pressable>
      </View>

      <LanguageMenu
        visible={open}
        onClose={() => setOpen(false)}
        headerRef={headerRef}
        triggerRef={triggerRef}
        selected={language}
        onSelect={changeLanguage}
      />
    </>
  );
}

const styles = StyleSheet.create({
  anchor: {
    flexShrink: 0,
    flexGrow: 0,
    alignSelf: "center",
    direction: "ltr",
  },
  trigger: {
    height: CHIP_H,
    borderRadius: CHIP_H / 2,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(27, 79, 138, 0.18)",
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    flexGrow: 0,
    direction: "ltr",
  },
  triggerPressed: {
    backgroundColor: "#FFFFFF",
  },
  triggerOpen: {
    backgroundColor: "#FFFFFF",
  },
  triggerCompact: {},
  triggerRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(8),
    gap: sw(4),
    direction: "ltr",
  },
  triggerRowCompact: {
    paddingHorizontal: sw(7),
    gap: sw(3),
  },
  glyph: {
    width: GLYPH,
    height: GLYPH,
    alignItems: "center",
    justifyContent: "center",
  },
  caret: {
    width: sf(12),
    height: GLYPH,
    alignItems: "center",
    justifyContent: "center",
  },
  labelSlot: {
    height: sf(20),
    maxWidth: sw(72),
    justifyContent: "center",
    alignItems: "flex-start",
    overflow: "visible",
  },
  labelSlotCompact: {
    maxWidth: sw(22),
    alignItems: "center",
  },
  label: {
    flexShrink: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.navy,
    textAlign: "left",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  labelMark: {
    fontSize: sf(11),
    lineHeight: sf(14),
    letterSpacing: 0.4,
    textAlign: "center",
  },
  labelAr: {
    fontFamily: "NotoSansArabic-SemiBold",
    fontWeight: "normal",
    fontSize: sf(13),
    lineHeight: sf(20),
    letterSpacing: 0,
    textAlign: "left",
  },
  labelMarkAr: {
    fontSize: sf(13),
    lineHeight: sf(16),
    letterSpacing: 0,
    textAlign: "center",
  },
});