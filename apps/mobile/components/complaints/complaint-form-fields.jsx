import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { NAVY } from "./complaint-ui";
import { Colors } from "../../constants/tokens";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;

/**
 * Plain object, not StyleSheet. The text-metrics patch adds a lineHeight inside
 * StyleSheet.create, and that line height top-aligns the iOS placeholder.
 */
export const titleFieldText = {
  height: sw(52),
  margin: 0,
  borderWidth: 1,
  borderColor: "#E6EDF5",
  borderRadius: sw(14),
  backgroundColor: "#F8FAFC",
  paddingHorizontal: sw(14),
  paddingTop: 0,
  paddingBottom: 0,
  fontFamily: Fonts.medium,
  fontSize: sf(15),
  color: Colors.textPrimary,
  ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : null),
};

export function titleError(value) {
  const text = value.trim();
  if (text.length < 3) return "Title must be at least 3 characters.";
  if (!/\p{L}/u.test(text)) return "Title must include at least one letter.";
  return "";
}

export function descriptionError(value) {
  if (value.trim().length < 10) return "Description must be at least 10 characters.";
  return "";
}

export function FieldLabel({ children, required, count, max, first }) {
  return (
    <View style={[styles.labelRow, first && styles.labelFirst]}>
      <Text style={styles.labelText}>
        {children}
        {required ? <Text style={styles.star}> *</Text> : null}
      </Text>
      {count != null ? <Text style={styles.count}>{count}/{max}</Text> : null}
    </View>
  );
}

export function FormSelect({ label, value, placeholder = "Choose", open, options, selected, error, first, searchable = false, onToggle, onSelect }) {
  const [query, setQuery] = useState("");
  const canSearch = searchable || options.length > 7;
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!canSearch || !text) return options;
    return options.filter((option) => `${option.label} ${option.description || ""}`.toLowerCase().includes(text));
  }, [canSearch, options, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <View style={[styles.selectWrap, open && styles.selectWrapOpen]}>
      <Text style={[styles.label, first && styles.labelFirst]}>{label}</Text>
      <View style={styles.selectAnchor}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={onToggle}
          style={[styles.select, open && styles.selectOpen, error && styles.fieldError]}
        >
          <Text style={[styles.selectValue, !value && styles.placeholder]} numberOfLines={1}>{value || placeholder}</Text>
          <Feather name={open ? "chevron-up" : "chevron-down"} size={sf(16)} color="#64748B" />
        </Pressable>
        {open ? (
          <View style={styles.menu}>
            {canSearch ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search categories"
                placeholderTextColor="#94A3B8"
                autoCorrect={false}
                style={styles.search}
              />
            ) : null}
            <ScrollView style={styles.menuScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {visible.map((option, index) => {
                const on = option.id === selected;
                return (
                  <Pressable key={option.id} onPress={() => onSelect(option.id)} style={[styles.option, index === 0 && !canSearch && styles.optionFirst]}>
                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionText, on && styles.optionTextOn]} numberOfLines={1}>{option.label}</Text>
                      {option.description ? <Text style={styles.optionHint} numberOfLines={2}>{option.description}</Text> : null}
                    </View>
                    {on ? <Feather name="check" size={sf(14)} color={NAVY} /> : null}
                  </Pressable>
                );
              })}
              {visible.length === 0 ? <Text style={styles.empty}>No matching categories</Text> : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export const complaintInputStyles = StyleSheet.create({
  area: {
    height: sw(132),
    margin: 0,
    borderWidth: 1,
    borderColor: "#E6EDF5",
    borderRadius: sw(14),
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(14),
    paddingTop: sw(14),
    paddingBottom: sw(14),
    fontFamily: Fonts.medium,
    fontSize: sf(15),
    lineHeight: sf(22),
    color: Colors.textPrimary,
    textAlignVertical: "top",
  },
  fieldError: { borderColor: "#FECACA" },
  error: { marginTop: sw(6), fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16), color: Colors.error },
});

const styles = StyleSheet.create({
  label: {
    marginTop: sw(12),
    marginBottom: sw(8),
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(16),
    color: "#0F2744",
  },
  labelFirst: { marginTop: 0 },
  labelRow: {
    marginTop: sw(12),
    marginBottom: sw(8),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
  },
  labelText: { fontFamily: Fonts.semiBold, fontSize: sf(13), lineHeight: sf(16), color: "#0F2744" },
  star: { color: "#E11D48" },
  count: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#94A3B8" },
  selectWrap: { zIndex: 1 },
  selectWrapOpen: { zIndex: 30 },
  selectAnchor: { position: "relative", zIndex: 2 },
  select: {
    minHeight: sw(48),
    borderWidth: 1,
    borderColor: "#E6EDF5",
    borderRadius: sw(14),
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(14),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  selectOpen: { borderColor: "#C5D4E8", backgroundColor: Colors.surface },
  selectValue: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(14), color: Colors.textPrimary },
  placeholder: { color: "#94A3B8" },
  menu: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: sw(6),
    borderRadius: sw(12),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#E6EDF5",
    overflow: "hidden",
    zIndex: 40,
    elevation: 8,
  },
  menuScroll: { maxHeight: sw(280) },
  search: {
    height: sw(40),
    margin: sw(8),
    marginBottom: 0,
    borderWidth: 1,
    borderColor: "#E6EDF5",
    borderRadius: sw(10),
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(12),
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: Colors.textPrimary,
  },
  option: {
    minHeight: sw(40),
    paddingHorizontal: sw(14),
    paddingVertical: sw(8),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF2F6",
  },
  optionFirst: { borderTopWidth: 0 },
  optionCopy: { flex: 1, gap: sw(2) },
  optionText: { fontFamily: Fonts.medium, fontSize: sf(14), color: "#163A66" },
  optionTextOn: { color: NAVY },
  optionHint: { fontFamily: Fonts.medium, fontSize: sf(11), lineHeight: sf(15), color: "#64748B" },
  empty: { paddingHorizontal: sw(14), paddingVertical: sw(12), fontFamily: Fonts.medium, fontSize: sf(13), color: "#94A3B8" },
  fieldError: { borderColor: "#FECACA" },
  error: { marginTop: sw(6), fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(16), color: Colors.error },
});
