import React, { useMemo, useState } from "react";
import { Modal, View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import LocaleTextInput from "./locale-text-input";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import {
  PHONE_COUNTRIES,
  formatDialLabel,
  getCountryFlag,
  getDialCode,
} from "../../constants/phone-countries";

/**
 * Plain object, not StyleSheet.create. The text-metrics patch adds a tall
 * lineHeight to stylesheet text styles, which top-aligns and clips iOS
 * TextInput placeholder and value inside this 44px row.
 */
const searchInputStyle = {
  flex: 1,
  margin: 0,
  paddingHorizontal: 0,
  paddingTop: 0,
  paddingBottom: 0,
  fontFamily: Fonts.regular,
  fontSize: 15,
  color: "#0F172A",
  textAlignVertical: "center",
  includeFontPadding: false,
  backgroundColor: "transparent",
};

export default function CountryCodePicker({
  visible,
  selectedCode,
  onSelect,
  onClose,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PHONE_COUNTRIES;
    const digits = q.replace(/\D/g, "");
    return PHONE_COUNTRIES.filter((country) => {
      const dial = String(getDialCode(country.code));
      const dialLabel = `+${dial}`;
      const nameMatch = country.name.toLowerCase().includes(q);
      const codeMatch = country.code.toLowerCase().includes(q);
      // Only compare dial codes when the query actually has digits.
      // An empty digit string matches every code (`"+92".includes("")`).
      const dialMatch =
        digits.length > 0 && (dial.includes(digits) || dialLabel.includes(q));
      return nameMatch || codeMatch || dialMatch;
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

  const noMatches = query.trim().length > 0 && filtered.length === 0;

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
          <Text style={styles.title}>{t("countryCode.selectCountryCode")}</Text>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="#9CA3AF" />
            <LocaleTextInput
              style={searchInputStyle}
              placeholder={t("countryCode.searchCountryOrCode")}
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              textAlignVertical="center"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </Pressable>
            ) : null}
          </View>

          <FlatList
            data={filtered}
            extraData={query}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            style={styles.list}
            contentContainerStyle={noMatches ? styles.listEmptyContent : undefined}
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
                    <Ionicons name="checkmark" size={20} color="#0D9488" />
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>{t("countryCode.noCountriesMatch")}</Text>
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
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
    height: "78%",
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
  list: {
    flex: 1,
  },
  listEmptyContent: {
    flexGrow: 1,
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
    backgroundColor: "#f4f8fd",
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
