import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import LocaleTextInput from "../ui/locale-text-input";
import { Fonts } from "../../constants/font";
import {
  AMENITY_SLOT_MAX_MINUTES,
  AMENITY_SLOT_MIN_MINUTES,
  SLOT_DURATION_OPTIONS,
  combineSlotDurationMinutes,
  isPresetSlotDurationMinutes,
  splitSlotDurationMinutes,
} from "../../utils/amenity-display";

export default function SlotDurationPicker({ minutes, onChangeMinutes, error }) {
  const { t } = useTranslation();
  const total = Number(minutes) || 0;
  const custom = !isPresetSlotDurationMinutes(total);
  const { hours, minutes: mins } = splitSlotDurationMinutes(total);
  const hoursDisplay = total === 0 ? "" : hours > 0 ? String(hours) : "";
  const minutesDisplay = total === 0 ? "" : mins > 0 ? String(mins) : "";

  const setCustomParts = (nextHours, nextMinutes) => {
    onChangeMinutes(combineSlotDurationMinutes(nextHours, nextMinutes));
  };

  return (
    <View>
      <View style={[styles.durationRow, error && styles.groupError]}>
        {SLOT_DURATION_OPTIONS.map((opt) => {
          const selected = !custom && total === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChangeMinutes(opt.value)}
              style={[styles.durationChip, selected && styles.durationChipActive]}
            >
              <Text style={[styles.durationText, selected && styles.durationTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            if (!custom) onChangeMinutes(180);
          }}
          style={[styles.durationChip, custom && styles.durationChipActive]}
        >
          <Text style={[styles.durationText, custom && styles.durationTextActive]}>
            {t("amenities.slotCustom")}
          </Text>
        </Pressable>
      </View>

      {custom ? (
        <View style={styles.customRow}>
          <View style={styles.customField}>
            <Text style={styles.customLabel}>{t("amenities.slotCustomHours")}</Text>
            <LocaleTextInput
              style={styles.customInput}
              value={hoursDisplay}
              onChangeText={(v) => setCustomParts(v.replace(/[^0-9]/g, ""), String(mins))}
              keyboardType="number-pad"
              placeholder="0"
            />
          </View>
          <View style={styles.customField}>
            <Text style={styles.customLabel}>{t("amenities.slotCustomMinutes")}</Text>
            <LocaleTextInput
              style={styles.customInput}
              value={minutesDisplay}
              onChangeText={(v) => setCustomParts(String(hours), v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              placeholder="0"
            />
          </View>
          <Text style={styles.customHint}>
            {t("amenities.slotDurationRangeHint", {
              min: AMENITY_SLOT_MIN_MINUTES,
              max: AMENITY_SLOT_MAX_MINUTES,
            })}
          </Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  durationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  groupError: {
    borderColor: "#FCA5A5",
  },
  durationChip: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  durationChipActive: {
    borderColor: "#1B4F8A",
    backgroundColor: "#E8F0F7",
  },
  durationText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  durationTextActive: {
    color: "#1B4F8A",
  },
  customRow: {
    marginTop: 12,
    gap: 10,
  },
  customField: {
    gap: 4,
  },
  customLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  customInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  customHint: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "#94A3B8",
    lineHeight: 16,
  },
  errorText: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#DC2626",
  },
});
