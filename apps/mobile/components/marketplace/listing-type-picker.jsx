import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { MarketplaceType } from "../../constants/marketplace-type";
import { MarketplaceTheme as M, listingTypeTheme } from "../../constants/marketplace-theme";

const OPTIONS = [listingTypeTheme.item, listingTypeTheme.service];

/** Compact item/service toggle — matches other marketplace forms. */
export default function ListingTypePicker({ value, onChange, disabled = false }) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t("marketplace.listingType")}</Text>
      <View style={styles.track}>
        {OPTIONS.map((theme) => {
          const active = value === theme.id;
          return (
            <TouchableOpacity
              key={theme.id}
              activeOpacity={0.88}
              disabled={disabled}
              onPress={() => onChange(theme.id)}
              style={[
                styles.option,
                active && styles.optionActive,
                disabled && styles.optionDisabled,
              ]}
            >
              <Feather
                name={theme.feather}
                size={14}
                color={active ? M.navy : M.textMuted}
              />
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {t(theme.shortLabelKey ?? theme.shortLabel)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyLine,
    color: "#111827",
    fontWeight: "700",
  },
  track: {
    flexDirection: "row",
    gap: 8,
    padding: 4,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  option: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  optionActive: {
    backgroundColor: M.white,
    borderWidth: 1,
    borderColor: M.border,
  },
  optionDisabled: {
    opacity: 0.55,
  },
  optionText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: M.textMuted,
    fontWeight: "500",
  },
  optionTextActive: {
    fontFamily: Fonts.bold,
    color: M.navy,
    fontWeight: "700",
  },
});
