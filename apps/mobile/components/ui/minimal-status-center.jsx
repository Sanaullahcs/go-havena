import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

const ACCENT = "#1B4F8A";

/**
 * Centered status screen — large code, title, body, single button (404 / offline style).
 */
export default function MinimalStatusCenter({
  code,
  title,
  description,
  actionLabel,
  onAction,
  busy = false,
}) {
  return (
    <View style={styles.wrap}>
      {code ? <Text style={styles.code}>{code}</Text> : null}
      <Text style={[styles.title, !code && styles.titleNoCode]}>{title}</Text>
      <Text style={styles.body}>{description}</Text>
      <Pressable
        style={[styles.btn, busy && styles.btnBusy]}
        onPress={onAction}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={styles.btnText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(32),
    paddingVertical: sw(40),
    backgroundColor: "#F8F9FA",
  },
  code: {
    fontFamily: Fonts.bold,
    fontSize: sf(72),
    lineHeight: sf(76),
    color: ACCENT,
    letterSpacing: -2,
  },
  title: {
    marginTop: sw(18),
    fontFamily: Fonts.semiBold,
    fontSize: sf(20),
    color: "#1F2937",
    textAlign: "center",
  },
  titleNoCode: {
    marginTop: 0,
  },
  body: {
    marginTop: sw(12),
    maxWidth: sw(320),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(21),
    color: "#6B7280",
    textAlign: "center",
  },
  btn: {
    marginTop: sw(32),
    minWidth: sw(140),
    paddingHorizontal: sw(40),
    paddingVertical: sw(12),
    borderRadius: sw(6),
    backgroundColor: ACCENT,
    alignItems: "center",
  },
  btnBusy: {
    opacity: 0.65,
  },
  btnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
});