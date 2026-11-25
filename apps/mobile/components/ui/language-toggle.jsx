import React, { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLanguage } from "../../providers/language-provider";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw, sf } from "../../utils/responsive";
import { rnShadow } from "../../utils/shadow";
import LanguageMenu, { LANGUAGE_OPTIONS } from "./language-menu";

export default function LanguageSelector({ headerRef }) {
  const { language, changeLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const current = LANGUAGE_OPTIONS.find((item) => item.code === language) || LANGUAGE_OPTIONS[0];

  return (
    <>
      <Pressable
        ref={triggerRef}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        onPress={() => setOpen(true)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Language ${current.nativeLabel}`}
      >
        <View style={styles.triggerInner}>
          <Feather name="globe" size={sf(14)} color={T.navy} style={styles.triggerIcon} />
          <Text
            style={[styles.triggerText, language === "ar" && styles.triggerTextAr]}
            numberOfLines={1}
            ellipsizeMode="clip"
          >
            {current.nativeLabel}
          </Text>
          <Feather name="chevron-down" size={sf(13)} color={T.navy} style={styles.triggerIcon} />
        </View>
      </Pressable>

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
  trigger: {
    height: sw(36),
    paddingHorizontal: sw(8),
    borderRadius: sw(10),
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
    flexShrink: 0,
    justifyContent: "center",
    ...(Platform.OS === "ios"
      ? rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 1 }, opacity: 0.05, radius: 2 })
      : { elevation: 1 }),
  },
  triggerPressed: {
    backgroundColor: T.mint,
    borderColor: T.teal,
  },
  triggerInner: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: sw(4),
    maxWidth: sw(118),
  },
  triggerIcon: {
    flexShrink: 0,
  },
  triggerText: {
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: T.navy,
    includeFontPadding: false,
  },
  triggerTextAr: {
    writingDirection: "rtl",
  },
});