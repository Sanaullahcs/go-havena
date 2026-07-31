import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTopInset, SYSTEM_CHROME_COLOR } from "./system-chrome";
import { sw } from "../../utils/responsive";

/** Shared shell — white bar, soft shadow, comfortable vertical padding. */
export function HeaderShell({ children, style, padded = true, safeTop = true, dense = false }) {
  const insets = useSafeAreaInsets();
  const topInset = safeTop ? getTopInset(insets) : 0;

  return (
    <View
      style={[
        styles.shell,
        style,
        safeTop ? { paddingTop: topInset } : null,
      ]}
    >
      {safeTop && topInset > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.statusBarFill, { height: topInset }]}
        />
      ) : null}
      <View style={[styles.inner, padded && styles.padded, dense && styles.paddedDense]}>
        {children}
      </View>
    </View>
  );
}

/** Rounded icon slot for header actions (search, settings, etc.). */
export function HeaderIconSlot({ children, style }) {
  return <View style={[styles.iconSlot, style]}>{children}</View>;
}

export const headerChromeStyles = StyleSheet.create({
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: sw(44),
    gap: sw(10),
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: sw(4),
  },
  right: {
    marginLeft: "auto",
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
  },
  sideSlot: {
    width: sw(40),
    flexShrink: 0,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  centerSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: sw(4),
  },
  centerText: {
    textAlign: "center",
  },
});

const styles = StyleSheet.create({
  statusBarFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: SYSTEM_CHROME_COLOR,
  },
  shell: {
    backgroundColor: SYSTEM_CHROME_COLOR,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.06)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    zIndex: 10,
  },
  inner: {},
  padded: {
    paddingHorizontal: sw(18),
    paddingVertical: sw(12),
  },
  paddedDense: {
    paddingVertical: sw(8),
  },
  iconSlot: {
    width: sw(38),
    height: sw(38),
    borderRadius: sw(11),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
});
