import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import { useLanguage } from "../../providers/language-provider";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw, sf } from "../../utils/responsive";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "ar", label: "ع" },
];

const SEGMENT_W = sw(30);
const TRACK_PAD = sw(3);
const TRACK_GAP = sw(1);

export default function LanguageToggle() {
  const { language, changeLanguage } = useLanguage();
  const activeIdx = LANGS.findIndex((l) => l.code === language) || 0;
  const slideX = useRef(new Animated.Value(activeIdx * (SEGMENT_W + TRACK_GAP))).current;

  useEffect(() => {
    Animated.spring(slideX, {
      toValue: activeIdx * (SEGMENT_W + TRACK_GAP),
      friction: 10,
      tension: 180,
      useNativeDriver: true,
    }).start();
  }, [activeIdx]);

  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          styles.indicator,
          { transform: [{ translateX: slideX }] },
        ]}
      />
      {LANGS.map((lang) => {
        const isActive = lang.code === language;
        return (
          <Pressable
            key={lang.code}
            style={styles.segment}
            onPress={() => {
              if (lang.code !== language) changeLanguage(lang.code);
            }}
            hitSlop={2}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Language ${lang.code}`}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {lang.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: sw(10),
    padding: TRACK_PAD,
    gap: TRACK_GAP,
    position: "relative",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#0A2A43",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
        }
      : { elevation: 1 }),
  },
  indicator: {
    position: "absolute",
    top: TRACK_PAD,
    left: TRACK_PAD,
    width: SEGMENT_W,
    height: SEGMENT_W,
    borderRadius: sw(8),
    backgroundColor: T.navy,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: T.navy,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.22,
          shadowRadius: 4,
        }
      : { elevation: 3 }),
  },
  segment: {
    width: SEGMENT_W,
    height: SEGMENT_W,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.2,
  },
  labelActive: {
    color: T.white,
  },
});
