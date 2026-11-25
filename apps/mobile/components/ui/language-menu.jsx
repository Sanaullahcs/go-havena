import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Platform,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw, sf, SCREEN_WIDTH } from "../../utils/responsive";
import { rnShadow } from "../../utils/shadow";

export const LANGUAGE_OPTIONS = [
  { code: "en", nativeLabel: "English", flag: "🇬🇧" },
  { code: "es", nativeLabel: "Español", flag: "🇪🇸" },
  { code: "ar", nativeLabel: "العربية", flag: "🇸🇦" },
];

const PANEL_MIN_W = sw(128);
const PANEL_MAX_W = sw(148);
const PANEL_GAP = sw(4);
const H_MARGIN = sw(16);
const ROW_H = sw(32);

export default function LanguageMenu({
  visible,
  onClose,
  headerRef,
  triggerRef,
  selected,
  onSelect,
}) {
  const { t } = useTranslation();
  const [panel, setPanel] = useState({ top: 0, left: H_MARGIN, width: PANEL_MAX_W });

  const measurePanel = useCallback(() => {
    const layout = (bx, by, bw, bh, headerBottom) => {
      const triggerBottom = Number.isFinite(by) && Number.isFinite(bh) ? by + bh : headerBottom;
      const top = (triggerBottom ?? 0) + PANEL_GAP;
      const width = Math.max(
        PANEL_MIN_W,
        Math.min(PANEL_MAX_W, Math.ceil(Number.isFinite(bw) ? bw + sw(2) : PANEL_MAX_W)),
      );
      const anchorRight = Number.isFinite(bx) && Number.isFinite(bw) ? bx + bw : SCREEN_WIDTH - H_MARGIN;
      const alignedLeft = anchorRight - width;
      const left = Math.max(H_MARGIN, Math.min(alignedLeft, SCREEN_WIDTH - width - H_MARGIN));
      setPanel({ top, left, width });
    };

    const run = (bx, by, bw, bh, headerBottom) => {
      layout(bx, by, bw, bh, headerBottom);
    };

    headerRef?.current?.measureInWindow((hx, hy, _hw, hh) => {
      const headerBottom = Number.isFinite(hy) && Number.isFinite(hh) ? hy + hh : undefined;
      if (triggerRef?.current?.measureInWindow) {
        triggerRef.current.measureInWindow((bx, by, bw, bh) => {
          run(bx, by, bw, bh, headerBottom);
        });
      } else {
        run(hx, hy, PANEL_MAX_W, ROW_H, headerBottom);
      }
    });
  }, [headerRef, triggerRef]);

  useEffect(() => {
    if (!visible) return undefined;
    measurePanel();
    const t1 = setTimeout(measurePanel, 16);
    const t2 = setTimeout(measurePanel, 64);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [visible, measurePanel]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated={Platform.OS === "android" ? true : undefined}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />

        <View
          pointerEvents="box-none"
          style={[styles.panelHost, { top: panel.top, left: panel.left, width: panel.width }]}
        >
          <View style={styles.panel}>
            {LANGUAGE_OPTIONS.map((item, index) => {
              const active = item.code === selected;
              const isLast = index === LANGUAGE_OPTIONS.length - 1;
              return (
                <Pressable
                  key={item.code}
                  style={({ pressed }) => [styles.rowHit, pressed && styles.rowPressed]}
                  onPress={() => {
                    onClose();
                    if (!active) onSelect(item.code);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <View style={styles.row}>
                    <Text
                      style={styles.flag}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    >
                      {item.flag}
                    </Text>
                    <Text
                      style={[
                        styles.label,
                        item.code === "ar" && styles.labelAr,
                        active && styles.labelActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.nativeLabel}
                    </Text>
                    {active ? (
                      <Feather name="check" size={sf(11)} color={T.teal} style={styles.check} />
                    ) : (
                      <View style={styles.checkSpacer} />
                    )}
                  </View>
                  {!isLast ? <View style={styles.rowDivider} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
  },
  panelHost: {
    position: "absolute",
    zIndex: 2,
    elevation: 10,
  },
  panel: {
    borderRadius: sw(10),
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(27, 79, 138, 0.14)",
    paddingVertical: sw(2),
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 4 }, opacity: 0.08, radius: 8 })
      : { elevation: 5 }),
  },
  rowHit: {
    minHeight: ROW_H,
    justifyContent: "center",
  },
  rowPressed: {
    backgroundColor: "rgba(226, 245, 242, 0.55)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: sw(9),
    gap: sw(6),
    minHeight: ROW_H,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: T.border,
    marginStart: sw(9),
    marginEnd: sw(9),
  },
  flag: {
    fontSize: sf(12),
    lineHeight: sf(14),
    width: sw(18),
    textAlign: "center",
    flexShrink: 0,
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: T.navy,
    includeFontPadding: false,
  },
  labelAr: {
    writingDirection: "rtl",
    textAlign: "left",
  },
  labelActive: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
  },
  check: {
    flexShrink: 0,
    opacity: 0.88,
  },
  checkSpacer: {
    width: sf(11),
    flexShrink: 0,
  },
});