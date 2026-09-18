/**
 * Lightweight phone input for the business form.
 * Reuses the existing libphonenumber-js utilities and CountryCodePicker
 * already used throughout the app — no new libraries needed.
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import LocaleTextInput from "./locale-text-input";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { DEFAULT_PHONE_COUNTRY, formatDialLabel, getCountryByCode } from "../../constants/phone-countries";
import CountryCodePicker from "./country-code-picker";
import {
  formatNationalDisplay,
  getCountryPlaceholder,
  getFormattedMaxLength,
  getPhoneValidationError,
  parsePhoneInputChange,
  normalizeDigitsForCountry,
  toE164,
} from "../../utils/phone";

const buildE164 = toE164;

export default function BusinessPhoneInput({
  value = "",        // stored as raw digits (no dial code)
  country = DEFAULT_PHONE_COUNTRY,
  onChangePhone,     // called with { digits, country, e164, valid }
  showError = false,
  centerPlaceholder = false,
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  const display = formatNationalDisplay(value, country);
  const validationError = getPhoneValidationError(value, country);
  const isValid = value && !validationError;
  const shouldShowError = (touched || showError) && !!validationError;
  const placeholder = getCountryPlaceholder(country);
  const maxLength = getFormattedMaxLength(country);
  const dial = formatDialLabel(country);

  const emit = (nextDigits, nextCountry) => {
    const e164 = nextDigits ? buildE164(nextDigits, nextCountry) : null;
    const valid = !getPhoneValidationError(nextDigits, nextCountry) && !!nextDigits;
    onChangePhone?.({ digits: nextDigits, country: nextCountry, e164, valid });
  };

  const handleChange = (text) => {
    const nextDigits = parsePhoneInputChange(text, country, value);
    emit(nextDigits, country);
  };

  const handleCountrySelect = (nextCountry) => {
    setPickerOpen(false);
    const nextDigits = value ? normalizeDigitsForCountry(value, nextCountry) : value;
    emit(nextDigits, nextCountry);
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.row,
          shouldShowError && styles.rowError,
          isValid && styles.rowValid,
        ]}
      >
        {/* Country selector */}
        <TouchableOpacity
          style={styles.countryBtn}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.dialText}>{dial}</Text>
          <Ionicons name="chevron-down" size={12} color="#6B7280" />
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Number input */}
        {centerPlaceholder ? (
          <View style={styles.inputWrap}>
            {!value ? (
              <View pointerEvents="none" style={styles.placeholderOverlay}>
                <Text style={styles.placeholderOverlayText}>{placeholder}</Text>
              </View>
            ) : null}
            <LocaleTextInput
              style={styles.input}
              value={display}
              onChangeText={handleChange}
              onBlur={() => setTouched(true)}
              placeholder={undefined}
              placeholderTextColor="rgba(153,161,175,1)"
              forceLtr
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              maxLength={maxLength}
              returnKeyType="done"
            />
          </View>
        ) : (
        <LocaleTextInput
          style={styles.input}
          value={display}
          onChangeText={handleChange}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          placeholderTextColor="rgba(153,161,175,1)"
          forceLtr
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={maxLength}
          returnKeyType="done"
        />
        )}

        {/* Status indicator */}
        {isValid ? (
          <View style={styles.validIcon}>
            <Ionicons name="checkmark" size={13} color="#059669" />
          </View>
        ) : value ? (
          <View style={styles.pendingDot} />
        ) : null}
      </View>

      {shouldShowError ? (
        <Text style={styles.errorText}>{validationError}</Text>
      ) : isValid ? (
        <Text style={styles.successText}>{t("businessPhone.savedAs", { dial, display })}</Text>
      ) : value ? (
        <Text style={styles.hintText}>{t("businessPhone.keepEntering", { country: getCountryByCode(country).name })}</Text>
      ) : (
        <Text style={styles.hintText}>{t("businessPhone.countryFormat", { country: getCountryByCode(country).name, dial })}</Text>
      )}

      <CountryCodePicker
        visible={pickerOpen}
        selectedCode={country}
        onSelect={handleCountrySelect}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#EEF2F6",
    backgroundColor: "rgba(249,250,251,1)",
    overflow: "hidden",
  },
  rowError: {
    borderColor: "#F04438",
  },
  rowValid: {
    borderColor: "#34D399",
  },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    height: "100%",
  },
  dialText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: "#111827",
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: "#E5E7EB",
  },
  inputWrap: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
  },
  placeholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  placeholderOverlayText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "rgba(153,161,175,1)",
  },
  input: {
    flex: 1,
    margin: 0,
    paddingHorizontal: 12,
    paddingVertical: 0,
    paddingTop: 0,
    paddingBottom: 0,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#111827",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  validIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
    marginEnd: 10,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FCD34D",
    marginEnd: 12,
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
  successText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "#059669",
  },
});
