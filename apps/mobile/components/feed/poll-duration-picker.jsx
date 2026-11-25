import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import LocaleTextInput from "../ui/locale-text-input";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import {
  DEFAULT_POLL_DURATION,
  POLL_MAX_DAYS,
  POLL_MAX_HOURS,
  clampPollCustomValue,
  presetsForUnit,
} from "../../utils/poll-duration";
import { sf, sw } from "../../utils/responsive";

function durationPresetLabel(t, unit, value) {
  if (unit === "hours") {
    return value === 1
      ? t("feed.createPost.pollDurationOneHour")
      : t("feed.createPost.pollDurationHours", { count: value });
  }
  return value === 1
    ? t("feed.createPost.pollDurationOneDay")
    : t("feed.createPost.pollDurationDays", { count: value });
}

function isPresetSelected(selection, unit, value) {
  return selection.unit === unit && selection.kind === "preset" && selection.value === value;
}

export default function PollDurationPicker({ value, onChange, disabled = false, required = false }) {
  const { t } = useTranslation();
  const unit = value?.unit ?? "hours";
  const presets = useMemo(() => presetsForUnit(unit), [unit]);
  const [customDraft, setCustomDraft] = useState(
    value?.kind === "custom" ? String(value.value) : "",
  );

  const setUnit = (nextUnit) => {
    if (nextUnit === unit) return;
    const first = presetsForUnit(nextUnit)[0];
    onChange({ unit: nextUnit, kind: "preset", value: first });
    setCustomDraft("");
  };

  const isCustom = value?.kind === "custom" && value.unit === unit;

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Feather name="clock" size={sf(16)} color={T.gray} />
        <View style={styles.titleTextWrap}>
          <Text style={styles.title}>
            {t("feed.createPost.pollDuration")}
            {required ? <Text style={styles.requiredMark}> *</Text> : null}
          </Text>
          <Text style={styles.subtitle}>{t("feed.createPost.pollDurationHint")}</Text>
        </View>
      </View>

      <View style={styles.tabRow} accessibilityRole="tablist">
        {["hours", "days"].map((tab) => {
          const active = unit === tab;
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              disabled={disabled}
              onPress={() => setUnit(tab)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {tab === "hours" ? t("feed.createPost.pollDurationTabHours") : t("feed.createPost.pollDurationTabDays")}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.grid}>
        {presets.map((preset) => {
          const active = isPresetSelected(value, unit, preset);
          return (
            <Pressable
              key={`${unit}-${preset}`}
              disabled={disabled}
              onPress={() => {
                onChange({ unit, kind: "preset", value: preset });
                setCustomDraft("");
              }}
              style={[styles.cell, active && styles.cellActive]}
            >
              <Text style={[styles.cellText, active && styles.cellTextActive]}>
                {durationPresetLabel(t, unit, preset)}
              </Text>
              {active ? <Feather name="check" size={sf(14)} color={T.teal} /> : null}
            </Pressable>
          );
        })}
        <Pressable
          disabled={disabled}
          onPress={() => {
            const nextValue =
              value?.unit === unit && value?.kind === "custom" ? value.value : presets[0];
            onChange({ unit, kind: "custom", value: nextValue });
            setCustomDraft(String(nextValue));
          }}
          style={[styles.cell, isCustom && styles.cellActive]}
        >
          <Text style={[styles.cellText, isCustom && styles.cellTextActive]}>
            {t("feed.createPost.pollDurationCustom")}
          </Text>
          {isCustom ? <Feather name="check" size={sf(14)} color={T.teal} /> : null}
        </Pressable>
      </View>

      {isCustom ? (
        <View style={styles.customBlock}>
          <Text style={styles.customLabel}>
            {unit === "hours"
              ? t("feed.createPost.pollDurationCustomHours")
              : t("feed.createPost.pollDurationCustomDays")}
          </Text>
          <LocaleTextInput
            value={customDraft}
            onChangeText={(text) => {
              const digits = text.replace(/[^\d]/g, "");
              setCustomDraft(digits);
              if (digits.length > 0) {
                onChange({
                  unit,
                  kind: "custom",
                  value: clampPollCustomValue(unit, Number(digits)),
                });
              }
            }}
            keyboardType="number-pad"
            editable={!disabled}
            style={styles.customInput}
            placeholder={unit === "hours" ? "24" : "7"}
            placeholderTextColor={T.gray}
          />
          <Text style={styles.customHint}>
            {unit === "hours"
              ? t("feed.createPost.pollDurationCustomHoursHint", { max: POLL_MAX_HOURS })
              : t("feed.createPost.pollDurationCustomDaysHint", { max: POLL_MAX_DAYS })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export { DEFAULT_POLL_DURATION };

const styles = StyleSheet.create({
  wrap: { gap: sw(10) },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: sw(8) },
  titleTextWrap: { flex: 1 },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: T.navy,
  },
  requiredMark: {
    color: "#DC2626",
    fontFamily: Fonts.semiBold,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: T.gray,
  },
  tabRow: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: 3,
    borderRadius: 999,
    backgroundColor: "#E8EEF5",
    gap: 2,
  },
  tab: {
    minWidth: sw(76),
    paddingHorizontal: sw(14),
    paddingVertical: sw(7),
    borderRadius: 999,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
  },
  tabText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: T.gray,
  },
  tabTextActive: {
    color: T.navy,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
  },
  cell: {
    width: "31%",
    minHeight: sw(52),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D7E3EC",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(6),
    paddingVertical: sw(8),
    gap: 4,
  },
  cellActive: {
    borderColor: T.teal,
    backgroundColor: T.mint,
  },
  cellText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11.5),
    textAlign: "center",
    color: T.navy,
  },
  cellTextActive: {
    color: T.teal,
  },
  customBlock: { marginTop: sw(2) },
  customLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: T.gray,
  },
  customInput: {
    marginTop: sw(6),
    borderWidth: 1,
    borderColor: "#D7E3EC",
    borderRadius: 12,
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: T.navy,
    backgroundColor: "#F8FBFD",
  },
  customHint: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: T.gray,
  },
});
