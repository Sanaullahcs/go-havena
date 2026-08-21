import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  StyleSheet,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { formatDisplayDate, formatDisplayTime } from "../../utils/form-datetime";

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromTs = new Date(value);
    return Number.isNaN(fromTs.getTime()) ? null : fromTs;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveSelected(event, selected) {
  const fromArg = toDate(selected);
  if (fromArg) return fromArg;
  const ts = event?.nativeEvent?.timestamp;
  if (ts != null) return toDate(ts);
  return null;
}

export default function SchedulePickerField({
  mode = "date",
  value,
  onChange,
  placeholder,
  inputStyle,
  placeholderTextColor = "#98A2B3",
}) {
  const { t } = useTranslation();
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIos, setShowIos] = useState(false);
  const [draft, setDraft] = useState(() => toDate(value) ?? new Date());

  const selectedDate = toDate(value);
  const displayValue =
    mode === "date" ? formatDisplayDate(selectedDate) : formatDisplayTime(selectedDate);

  const commit = useCallback(
    (next) => {
      const date = toDate(next);
      if (!date) return;
      onChange?.(date);
    },
    [onChange],
  );

  const openAndroidPicker = useCallback(() => {
    const current = selectedDate ?? new Date();

    // Prefer imperative API. Use onChange (not only onValueChange) for Expo Go compatibility.
    try {
      DateTimePickerAndroid.open({
        value: current,
        mode,
        is24Hour: false,
        onChange: (event, selected) => {
          if (event?.type === "dismissed" || event?.type === "neutralButtonPressed") return;
          const next = resolveSelected(event, selected);
          if (next) commit(next);
        },
      });
      return;
    } catch {
      // Fall back to declarative picker below.
      setDraft(current);
      setShowAndroid(true);
    }
  }, [commit, mode, selectedDate]);

  const openPicker = () => {
    if (Platform.OS === "android") {
      openAndroidPicker();
      return;
    }
    setDraft(selectedDate ?? new Date());
    setShowIos(true);
  };

  const closeAndroidPicker = useCallback(() => {
    setShowAndroid(false);
  }, []);

  const handleAndroidValueChange = useCallback(
    (event, selected) => {
      closeAndroidPicker();
      const next = resolveSelected(event, selected);
      if (next) commit(next);
    },
    [closeAndroidPicker, commit],
  );

  const handleIosValueChange = useCallback((_event, selected) => {
    const next = resolveSelected(_event, selected);
    if (next) setDraft(next);
  }, []);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={openPicker}
        style={[inputStyle, styles.touchField]}
      >
        <Text
          style={[
            styles.fieldText,
            { color: displayValue ? "rgba(10, 10, 10, 1)" : placeholderTextColor },
          ]}
          numberOfLines={1}
        >
          {displayValue || placeholder}
        </Text>
      </TouchableOpacity>

      {Platform.OS === "android" && showAndroid ? (
        <DateTimePicker
          value={draft}
          mode={mode}
          display="default"
          themeVariant="light"
          onValueChange={handleAndroidValueChange}
          onChange={handleAndroidValueChange}
          onDismiss={closeAndroidPicker}
          onNeutralButtonPress={closeAndroidPicker}
          is24Hour={false}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal
          transparent
          visible={showIos}
          animationType="fade"
          onRequestClose={() => setShowIos(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowIos(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowIos(false)} hitSlop={8}>
                  <Text style={styles.modalActionMuted}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {mode === "date" ? t("common.selectDate") : t("common.selectTime")}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    commit(draft);
                    setShowIos(false);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.modalActionPrimary}>{t("common.done")}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.iosPickerWrap}>
                <Text style={styles.modalPreview}>
                  {mode === "date" ? formatDisplayDate(draft) : formatDisplayTime(draft)}
                </Text>
                <DateTimePicker
                  value={draft}
                  mode={mode}
                  display="spinner"
                  themeVariant="light"
                  textColor="#111827"
                  accentColor="#1B4F8A"
                  onValueChange={handleIosValueChange}
                  onChange={handleIosValueChange}
                  style={styles.iosPicker}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  touchField: {
    justifyContent: "center",
  },
  fieldText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopStartRadius: 16,
    borderTopEndRadius: 16,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(243, 244, 246, 1)",
  },
  modalTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: "#111827",
  },
  modalActionMuted: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "rgba(106, 114, 130, 1)",
  },
  modalActionPrimary: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: "rgba(20, 184, 166, 1)",
  },
  iosPickerWrap: {
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 12,
  },
  modalPreview: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: "#111827",
    marginBottom: 4,
  },
  iosPicker: {
    width: "100%",
    height: 216,
    backgroundColor: "#F8FAFC",
  },
});
