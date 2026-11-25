import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors, Layout } from "../../constants/tokens";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";

export const NAVY = "#1B4F8A";

export function ChoiceChip({ label, count, active, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, active && styles.chipOn, disabled && styles.disabled]}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
      {count != null ? (
        <Text style={[styles.chipCount, active && styles.chipTextOn]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

export function EmptyState({ icon = "inbox", title, body, actionLabel, actionIcon = "plus", onAction }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name={icon} size={sf(22)} color={NAVY} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.primary}>
          {actionIcon ? <Feather name={actionIcon} size={sf(16)} color="#fff" /> : null}
          <Text style={styles.primaryText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionLabel({ children }) {
  return <Text style={styles.section}>{children}</Text>;
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: sw(34),
    paddingHorizontal: sw(12),
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.divider,
    gap: sw(6),
  },
  chipOn: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    lineHeight: sf(16),
    color: Colors.textSecondary,
  },
  chipCount: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: Colors.textMuted,
  },
  chipTextOn: { color: "#fff" },
  disabled: { opacity: 0.45 },
  empty: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(28),
    paddingVertical: sw(36),
    gap: sw(8),
  },
  emptyIcon: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(28),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F0F7",
    marginBottom: sw(4),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    lineHeight: sf(22),
    color: Colors.textPrimary,
    textAlign: "center",
  },
  emptyBody: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textSecondary,
    textAlign: "center",
  },
  primary: {
    marginTop: sw(10),
    minHeight: sw(46),
    paddingHorizontal: sw(18),
    borderRadius: Layout.buttonRadius,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
  },
  primaryText: {
    color: "#fff",
    fontFamily: Fonts.bold,
    fontSize: sf(15),
  },
  section: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: Colors.textPrimary,
    marginTop: sw(16),
    marginBottom: sw(8),
  },
});
