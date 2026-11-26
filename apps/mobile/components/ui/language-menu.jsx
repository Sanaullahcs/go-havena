import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  View,
  Text,
  StyleSheet,
  Modal,
  Platform,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sf, sw } from "../../utils/responsive";
import { rnShadow } from "../../utils/shadow";

export const LANGUAGE_OPTIONS = [
  { code: "en", nativeLabel: "English", mark: "EN" },
  { code: "es", nativeLabel: "Español", mark: "ES" },
  { code: "ar", nativeLabel: "العربية", mark: "ع" },
];

const H_MARGIN = 14;
const PANEL_GAP = 4;
const FALLBACK_PANEL_W = sw(120);
const ROW_H = sw(36);
const BADGE = sw(28);

/** Kept off StyleSheet so Arabic padding is not inflated and the word stays next to the mark. */
const arabicInk = {
  fontFamily: "NotoSansArabic-SemiBold",
  fontWeight: "normal",
  includeFontPadding: false,
  textAlignVertical: "center",
  textAlign: "left",
  writingDirection: "ltr",
  letterSpacing: 0,
};

export default function LanguageMenu({
  visible,
  onClose,
  triggerRef,
  selected,
  onSelect,
}) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const [place, setPlace] = useState({
    top: 0,
    left: H_MARGIN,
    width: FALLBACK_PANEL_W,
  });
  const rise = useRef(new Animated.Value(0)).current;

  const measurePanel = useCallback(() => {
    const trigger = triggerRef?.current;
    if (!trigger?.measureInWindow) return;

    trigger.measureInWindow((bx, by, bw, bh) => {
      if (!Number.isFinite(by) || !Number.isFinite(bh)) return;
      const top = by + bh + PANEL_GAP;
      const triggerW = Number.isFinite(bw) && bw > 0 ? bw : FALLBACK_PANEL_W;
      const width = Math.min(triggerW, windowWidth - H_MARGIN * 2);
      const maxLeft = Math.max(H_MARGIN, windowWidth - width - H_MARGIN);
      const left = Number.isFinite(bx)
        ? Math.max(H_MARGIN, Math.min(bx, maxLeft))
        : maxLeft;
      setPlace({ top, left, width });
    });
  }, [triggerRef, windowWidth]);

  useEffect(() => {
    if (!visible) return undefined;
    measurePanel();
    const t1 = requestAnimationFrame(measurePanel);
    const t2 = setTimeout(measurePanel, 48);
    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
    };
  }, [visible, measurePanel]);

  useEffect(() => {
    if (!visible) {
      rise.setValue(0);
      return undefined;
    }
    rise.setValue(0);
    const anim = Animated.timing(rise, {
      toValue: 1,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, rise]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated={Platform.OS === "android" ? true : undefined}
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
      >
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.host,
            {
              top: place.top,
              left: place.left,
              width: place.width,
              opacity: rise,
              transform: [
                {
                  translateY: rise.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-5, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
            {LANGUAGE_OPTIONS.map((item) => {
              const active = item.code === selected;
              const isAr = item.code === "ar";
              return (
                <Pressable
                  key={item.code}
                  style={({ pressed }) => [
                    styles.rowHit,
                    active && styles.rowOn,
                    pressed && !active && styles.rowPressed,
                  ]}
                  onPress={() => {
                    onClose();
                    if (!active) onSelect(item.code);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item.nativeLabel}
                >
                  <View style={styles.rowMarkOnly}>
                    <View style={[styles.badge, active && styles.badgeOn]}>
                      <Text
                        style={[
                          styles.badgeText,
                          isAr && styles.badgeAr,
                          isAr && arabicInk,
                          isAr && { fontSize: sf(13), lineHeight: BADGE, textAlign: "center" },
                          active && styles.badgeTextOn,
                        ]}
                        numberOfLines={1}
                        allowFontScaling={false}
                      >
                        {item.mark}
                      </Text>
                    </View>
                    {active ? <Feather name="check" size={sf(12)} color={T.navy} style={styles.rowCheck} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.1)",
  },
  host: {
    position: "absolute",
  },
  card: {
    width: "100%",
    flexDirection: "column",
    alignItems: "stretch",
    backgroundColor: T.white,
    borderRadius: sw(14),
    paddingVertical: sw(4),
    paddingHorizontal: sw(4),
    gap: 1,
    direction: "ltr",
    ...(Platform.OS === "ios"
      ? rnShadow({ color: "#0B2545", offset: { width: 0, height: 8 }, opacity: 0.14, radius: 18 })
      : { elevation: 8 }),
  },
  rowHit: {
    width: "100%",
    height: ROW_H,
    borderRadius: sw(10),
    overflow: "visible",
    justifyContent: "center",
  },
  rowMarkOnly: {
    width: "100%",
    height: ROW_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(4),
    direction: "ltr",
  },
  rowCheck: {
    position: "absolute",
    end: sw(6),
  },
  rowOn: {
    backgroundColor: "rgba(27, 79, 138, 0.08)",
  },
  rowPressed: {
    backgroundColor: "#F4F8FB",
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: sw(8),
    backgroundColor: "#EEF3F8",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  badgeOn: {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
  },
  badgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(13),
    letterSpacing: 0.4,
    color: T.navy,
    includeFontPadding: false,
  },
  badgeAr: {
    fontFamily: "NotoSansArabic-SemiBold",
    fontWeight: "normal",
    fontSize: sf(12),
    lineHeight: sf(13),
    letterSpacing: 0,
  },
  badgeTextOn: {
    color: T.navy,
  },
});