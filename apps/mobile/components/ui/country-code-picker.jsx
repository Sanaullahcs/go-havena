import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import {
  PHONE_COUNTRIES,
  formatDialLabel,
  getCountryFlag,
  getDialCode,
} from "../../constants/phone-countries";

export default function CountryCodePicker({
  visible,
  selectedCode,
  onSelect,
  onClose,
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PHONE_COUNTRIES;
    return PHONE_COUNTRIES.filter((country) => {
      const dial = getDialCode(country.code);
      return (
        country.name.toLowerCase().includes(q) ||
        country.code.toLowerCase().includes(q) ||
        dial.includes(q.replace(/\D/g, "")) ||
        `+${dial}`.includes(q)
      );
    });
  }, [query]);

  const handleClose = () => {
    setQuery("");
    onClose?.();
  };

  const handleSelect = (code) => {
    setQuery("");
    onSelect?.(code);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Select country code</Text>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search country or code"
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </Pressable>
            ) : null}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => {
              const selected = item.code === selectedCode;
              return (
                <Pressable
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => handleSelect(item.code)}
                >
                  <Text style={styles.flag}>{getCountryFlag(item.code)}</Text>
                  <View style={styles.rowText}>
                    <Text style={styles.countryName}>{item.name}</Text>
                    <Text style={styles.dialCode}>{formatDialLabel(item.code)}</Text>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark" size={20} color="#0179FF" />
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>No countries match your search</Text>
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
    maxHeight: "78%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginTop: 10,
    marginBottom: 16,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    fontWeight: "700",
    color: "#101828",
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E6E9EE",
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 0,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6E9EE",
    gap: 12,
  },
  rowSelected: {
    backgroundColor: "#F0F7FF",
    borderRadius: 10,
  },
  flag: {
    fontSize: 22,
    width: 28,
    textAlign: "center",
  },
  rowText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  countryName: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: "#101828",
  },
  dialCode: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: "#364153",
  },
  empty: {
    textAlign: "center",
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: "#6B7280",
    paddingVertical: 24,
  },
});
