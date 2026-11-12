import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import LocaleTextInput from "../ui/locale-text-input";
import { Fonts } from "../../constants/font";
import { sw, sf } from "../../utils/responsive";
import { isDocumentOtherCategory } from "../../constants/document-categories";

export default function DocumentCategoryPicker({
  selection,
  customValue,
  options,
  onSelect,
  onCustomChange,
  error,
  placeholder,
  customPlaceholder,
  maxLength,
}) {
  const [open, setOpen] = useState(false);
  const showCustom = isDocumentOtherCategory(selection);

  return (
    <View>
      <Pressable style={[styles.combo, error && styles.comboError]} onPress={() => setOpen((value) => !value)}>
        <Text style={selection ? styles.value : styles.placeholder} numberOfLines={1}>
          {selection || placeholder}
        </Text>
        <View style={styles.chevron}>
          <Feather name={open ? "chevron-up" : "chevron-down"} size={sf(16)} color="#64748B" />
        </View>
      </Pressable>
      {open ? (
        <ScrollView style={styles.menu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {options.map((name) => {
            const selected = name === selection;
            return (
              <Pressable
                key={name}
                style={styles.menuItem}
                onPress={() => {
                  onSelect(name);
                  setOpen(false);
                }}
              >
                <Text style={[styles.menuText, selected && styles.menuTextOn]}>{name}</Text>
                {selected ? <Feather name="check" size={sf(14)} color="#1B4F8A" /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {showCustom ? (
        <LocaleTextInput
          style={[styles.custom, error && styles.comboError]}
          placeholder={customPlaceholder}
          placeholderTextColor="#9CA3AF"
          value={customValue}
          onChangeText={onCustomChange}
          maxLength={maxLength}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  combo: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(10),
    backgroundColor: "#FFFFFF",
    minHeight: sw(44),
  },
  comboError: { borderColor: "#DC2626" },
  value: { flex: 1, paddingHorizontal: sw(14), fontFamily: Fonts.regular, fontSize: sf(13), color: "#101828" },
  placeholder: { flex: 1, paddingHorizontal: sw(14), fontFamily: Fonts.regular, fontSize: sf(13), color: "#9CA3AF" },
  chevron: { paddingHorizontal: sw(12), alignSelf: "stretch", justifyContent: "center" },
  menu: {
    marginTop: sw(6),
    maxHeight: sw(220),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
    paddingHorizontal: sw(14),
    paddingVertical: sw(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF2F6",
  },
  menuText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(14), color: "#101828" },
  menuTextOn: { color: "#1B4F8A" },
  custom: {
    marginTop: sw(8),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(10),
    backgroundColor: "#FFFFFF",
    paddingHorizontal: sw(14),
    paddingVertical: sw(11),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#101828",
  },
});
