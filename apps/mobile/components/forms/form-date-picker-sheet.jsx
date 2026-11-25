import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { dateOnly, formatDisplayDate } from "../../utils/form-datetime";

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function toPickerDate(value) {
  return dateOnly(value) ?? startOfToday();
}

function resolveMinimumDate(value, minimumDate) {
  if (minimumDate == null) return undefined;
  const min = dateOnly(minimumDate) ?? startOfToday();
  const current = dateOnly(value);
  if (current && current.getTime() < min.getTime()) return current;
  return min;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function yearOptions(selectedYear) {
  const start = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, index) => start + index);
  if (selectedYear && !years.includes(selectedYear)) years.unshift(selectedYear);
  return years;
}

function pickerTheme(scheme) {
  const dark = scheme === "dark";
  return {
    variant: dark ? "dark" : "light",
    sheetBg: dark ? "#1C1C1E" : Colors.surface,
    pickerBg: dark ? "#1C1C1E" : Colors.surfaceMuted,
    text: dark ? "#F9FAFB" : Colors.textBody,
    muted: dark ? "#A1A1AA" : Colors.textMuted,
    border: dark ? "#2C2C2E" : "#F3F4F6",
    accent: Colors.brandPrimary,
  };
}

/**
 * Shared expiry/date sheet used by Resident and Community Admin deal flows.
 * Pairs iOS spinner theme + sheet colors so wheel text stays readable in light and dark mode.
 */
export default function FormDatePickerSheet({
  visible,
  value,
  title,
  minimumDate,
  onCancel,
  onConfirm,
  mode = "date",
  embedded = false,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const theme = useMemo(() => pickerTheme(scheme), [scheme]);
  const [draft, setDraft] = useState(() => toPickerDate(value));

  useEffect(() => {
    if (visible) setDraft(toPickerDate(value));
  }, [visible, value]);

  const minDate = useMemo(
    () => resolveMinimumDate(value, minimumDate),
    [value, minimumDate],
  );

  const closeWithoutSaving = () => onCancel?.();

  const applyDraft = () => {
    onConfirm?.(draft);
  };

  const handleChange = (_event, selected) => {
    if (selected) setDraft(dateOnly(selected) ?? selected);
  };

  if (!visible) return null;

  if (!embedded && mode === "date" && Platform.OS === "android") {
    return (
      <DateTimePicker
        value={draft}
        mode="date"
        display="default"
        themeVariant={theme.variant}
        {...(minDate ? { minimumDate: minDate } : {})}
        onChange={(event, selected) => {
          if (event?.type === "dismissed") {
            closeWithoutSaving();
            return;
          }
          closeWithoutSaving();
          if (selected) onConfirm?.(dateOnly(selected) ?? selected);
        }}
        onDismiss={closeWithoutSaving}
      />
    );
  }

  const sheet = (
        <View
          style={[
            styles.sheet,
            embedded && styles.embeddedSheet,
            {
              backgroundColor: theme.sheetBg,
              paddingBottom: embedded ? 8 : Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={[styles.toolbar, { borderBottomColor: theme.border }]}>
            <View style={styles.toolbarSide}>
              <TouchableOpacity onPress={closeWithoutSaving} hitSlop={8}>
                <Text style={[styles.cancel, { color: theme.muted }]}>{t("common.cancel")}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {title}
            </Text>
            <View style={[styles.toolbarSide, styles.toolbarSideEnd]}>
              <TouchableOpacity onPress={applyDraft} hitSlop={8}>
                <Text style={[styles.done, { color: theme.accent }]}>{t("common.done")}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.pickerWrap, { backgroundColor: theme.pickerBg }]}>
            {mode === "year" ? (
              <View style={styles.metaGrid}>
                {yearOptions(draft.getFullYear()).map((year) => {
                  const selected = year === draft.getFullYear();
                  return (
                    <TouchableOpacity
                      key={year}
                      onPress={() => setDraft(new Date(year, 0, 1))}
                      style={[styles.metaCell, selected && { backgroundColor: theme.accent }]}
                    >
                      <Text style={[styles.metaText, { color: selected ? "#FFFFFF" : theme.text }]}>{year}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : mode === "month" ? (
              <View style={styles.metaGrid}>
                {yearOptions(draft.getFullYear()).map((year) => {
                  const selected = year === draft.getFullYear();
                  return (
                    <TouchableOpacity
                      key={year}
                      onPress={() => setDraft(new Date(year, draft.getMonth(), 1))}
                      style={[styles.metaCell, selected && { backgroundColor: theme.accent }]}
                    >
                      <Text style={[styles.metaText, { color: selected ? "#FFFFFF" : theme.text }]}>{year}</Text>
                    </TouchableOpacity>
                  );
                })}
                {MONTHS.map((month, index) => {
                  const selected = index === draft.getMonth();
                  return (
                    <TouchableOpacity
                      key={month}
                      onPress={() => setDraft(new Date(draft.getFullYear(), index, 1))}
                      style={[styles.metaCell, selected && { backgroundColor: theme.accent }]}
                    >
                      <Text style={[styles.metaText, { color: selected ? "#FFFFFF" : theme.text }]}>
                        {month.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <>
                <Text style={[styles.preview, { color: theme.text }]}>{formatDisplayDate(draft)}</Text>
                <DateTimePicker
                  value={draft}
                  mode="date"
                  display="spinner"
                  themeVariant={theme.variant}
                  textColor={theme.text}
                  accentColor={theme.accent}
                  {...(minDate ? { minimumDate: minDate } : {})}
                  onChange={handleChange}
                  onValueChange={handleChange}
                  style={[styles.picker, { backgroundColor: theme.pickerBg }]}
                />
              </>
            )}
          </View>
        </View>
  );

  if (embedded) return sheet;

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={closeWithoutSaving}>
      <View style={styles.root}>
        <Pressable style={styles.overlay} onPress={closeWithoutSaving} />
        {sheet}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  embeddedSheet: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarSide: {
    width: 84,
  },
  toolbarSideEnd: {
    alignItems: "flex-end",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: Fonts.bold,
    fontSize: 15,
  },
  cancel: {
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  done: {
    fontFamily: Fonts.bold,
    fontSize: 15,
  },
  pickerWrap: {
    alignItems: "center",
    paddingTop: 8,
  },
  preview: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    marginBottom: 2,
  },
  picker: {
    width: "100%",
    height: 196,
  },
  metaGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  metaCell: {
    width: "30%",
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148, 163, 184, 0.12)",
  },
  metaText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },
});
