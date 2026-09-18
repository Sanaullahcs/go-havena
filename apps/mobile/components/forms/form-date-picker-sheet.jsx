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
  const min = dateOnly(minimumDate) ?? startOfToday();
  const current = dateOnly(value);
  if (current && current.getTime() < min.getTime()) return current;
  return min;
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

  if (Platform.OS === "android") {
    return (
      <DateTimePicker
        value={draft}
        mode="date"
        display="default"
        themeVariant={theme.variant}
        minimumDate={minDate}
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

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={closeWithoutSaving}>
      <View style={styles.root}>
        <Pressable style={styles.overlay} onPress={closeWithoutSaving} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.sheetBg,
              paddingBottom: Math.max(insets.bottom, 12),
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
            <Text style={[styles.preview, { color: theme.text }]}>{formatDisplayDate(draft)}</Text>
            <DateTimePicker
              value={draft}
              mode="date"
              display="spinner"
              themeVariant={theme.variant}
              textColor={theme.text}
              accentColor={theme.accent}
              minimumDate={minDate}
              onChange={handleChange}
              onValueChange={handleChange}
              style={[styles.picker, { backgroundColor: theme.pickerBg }]}
            />
          </View>
        </View>
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
});
