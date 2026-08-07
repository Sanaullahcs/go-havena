/**
 * BusinessHoursInput — time-range picker using @react-native-community/datetimepicker.
 *
 * Renders two tappable time chips (Open / Close).
 * Tapping opens the native time picker.
 * Value is stored as a human-readable string e.g. "9:00 AM - 5:00 PM".
 */
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, Pressable } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";

function parseHHMM(str) {
  if (!str) return null;
  const match = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function formatTime(date) {
  if (!date) return "";
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function parseInitialTimes(value) {
  if (!value?.trim()) return { open: null, close: null };
  const parts = value.split(/\s*[–-]\s*/);
  if (parts.length < 2) return { open: null, close: null };
  return {
    open: parseHHMM(parts[0].trim()),
    close: parseHHMM(parts[1].trim()),
  };
}

function buildHoursString(openDate, closeDate) {
  if (!openDate || !closeDate) return "";
  return `${formatTime(openDate)} - ${formatTime(closeDate)}`;
}

export default function BusinessHoursInput({ value = "", onChange, showError = false }) {
  const { t } = useTranslation();
  const initial = parseInitialTimes(value);

  const [openTime, setOpenTime] = useState(initial.open);
  const [closeTime, setCloseTime] = useState(initial.close);

  useEffect(() => {
    const next = parseInitialTimes(value);
    setOpenTime(next.open);
    setCloseTime(next.close);
  }, [value]);

  const [picking, setPicking] = useState(null); // "open" | "close" | null
  const [tempDate, setTempDate] = useState(null);

  const displayOpen = openTime ? formatTime(openTime) : t("businessHours.setTime");
  const displayClose = closeTime ? formatTime(closeTime) : t("businessHours.setTime");

  const isEmpty = !openTime || !closeTime;
  const shouldShowError = showError && isEmpty;

  const openPicker = (which) => {
    const existing = which === "open" ? openTime : closeTime;
    setTempDate(existing ?? new Date(new Date().setHours(which === "open" ? 9 : 17, 0, 0, 0)));
    setPicking(which);
  };

  const handleValueChange = (_event, selected) => {
    if (Platform.OS === "android") {
      setPicking(null);
      if (selected) applyTime(picking, selected);
      return;
    }
    if (selected) setTempDate(selected);
  };

  const handleDismiss = () => {
    setPicking(null);
  };

  const applyTime = (which, date) => {
    if (!date) return;
    const nextOpen = which === "open" ? date : openTime;
    const nextClose = which === "close" ? date : closeTime;
    if (which === "open") setOpenTime(date);
    else setCloseTime(date);
    const str = buildHoursString(nextOpen, nextClose);
    if (str) onChange?.(str);
  };

  const confirmIOS = () => {
    applyTime(picking, tempDate);
    setPicking(null);
  };

  const cancelIOS = () => setPicking(null);

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <TimeChip
          label={t("businessHours.opens")}
          value={displayOpen}
          onPress={() => openPicker("open")}
          filled={!!openTime}
          hasError={shouldShowError}
        />
        <View style={styles.dash}>
          <Ionicons name="arrow-forward" size={14} color="#9CA3AF" />
        </View>
        <TimeChip
          label={t("businessHours.closes")}
          value={displayClose}
          onPress={() => openPicker("close")}
          filled={!!closeTime}
          hasError={shouldShowError}
        />
      </View>

      {shouldShowError ? (
        <Text style={styles.errorText}>{t("businessHours.setTimesError")}</Text>
      ) : !isEmpty ? (
        <Text style={styles.hintText}>
          <Ionicons name="time-outline" size={11} color="#6B7280" /> {displayOpen} – {displayClose}
        </Text>
      ) : (
        <Text style={styles.hintText}>{t("businessHours.tapChipsHint")}</Text>
      )}

      {/* Android: system dialog */}
      {Platform.OS === "android" && picking ? (
        <DateTimePicker
          value={tempDate ?? new Date()}
          mode="time"
          is24Hour={false}
          display="default"
          onChange={handleValueChange}
          onDismiss={handleDismiss}
        />
      ) : null}

      {/* iOS: modal with Done/Cancel */}
      {Platform.OS === "ios" && picking ? (
        <Modal transparent animationType="slide" onRequestClose={cancelIOS}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalOverlay} onPress={cancelIOS} />
            <View style={styles.iosSheet}>
              <View style={styles.iosToolbar}>
                <TouchableOpacity onPress={cancelIOS} hitSlop={8}>
                  <Text style={styles.iosCancel}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <Text style={styles.iosTitle}>
                  {picking === "open" ? t("businessHours.openingTime") : t("businessHours.closingTime")}
                </Text>
                <TouchableOpacity onPress={confirmIOS} hitSlop={8}>
                  <Text style={styles.iosDone}>{t("common.done")}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.iosPickerWrap}>
                <DateTimePicker
                  value={tempDate ?? new Date()}
                  mode="time"
                  display="spinner"
                  themeVariant="light"
                  textColor="#111827"
                  accentColor="#0A2A43"
                  onChange={handleValueChange}
                  style={styles.iosPicker}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function TimeChip({ label, value, onPress, filled, hasError }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.chip,
        filled && styles.chipFilled,
        hasError && !filled && styles.chipError,
      ]}
    >
      <Ionicons
        name="time-outline"
        size={14}
        color={filled ? "#0A2A43" : hasError ? "#F04438" : "#9CA3AF"}
      />
      <View>
        <Text style={[styles.chipLabel, filled && styles.chipLabelFilled]}>{label}</Text>
        <Text style={[styles.chipValue, filled && styles.chipValueFilled, hasError && !filled && styles.chipValueError]}>
          {value}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#EEF2F6",
    backgroundColor: "rgba(249,250,251,1)",
    paddingHorizontal: 14,
  },
  chipFilled: {
    borderColor: "rgba(20, 184, 166, 0.28)",
    backgroundColor: "#D1FAF5",
  },
  chipError: {
    borderColor: "#FECACA",
    backgroundColor: "#FFF5F5",
  },
  chipLabel: {
    fontFamily: Fonts.regular,
    fontSize: 10,
    color: "#9CA3AF",
    letterSpacing: 0.3,
  },
  chipLabelFilled: {
    color: "#14B8A6",
  },
  chipValue: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: "#6B7280",
    marginTop: 1,
  },
  chipValueFilled: {
    color: "#111827",
  },
  chipValueError: {
    color: "#F04438",
  },
  dash: {
    paddingHorizontal: 2,
  },
  hintText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "#6B7280",
  },
  errorText: {
    marginTop: 4,
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#F04438",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  iosSheet: {
    backgroundColor: "#F8FAFC",
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    paddingBottom: 34,
    overflow: "hidden",
  },
  iosToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  iosTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: "#111827",
  },
  iosCancel: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: "#6B7280",
  },
  iosDone: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: "#0A2A43",
  },
  iosPickerWrap: {
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    paddingVertical: 8,
  },
  iosPicker: {
    width: "100%",
    height: 216,
    backgroundColor: "#F8FAFC",
  },
});
