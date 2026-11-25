import { useState } from "react";
import { Platform, View, Text, Pressable, StyleSheet } from "react-native";
import LocaleTextInput from "./locale-text-input";
import { Ionicons } from "@expo/vector-icons";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { authStyles } from "../../constants/auth-styles";
import { Fonts } from "../../constants/font";
import { DEFAULT_PHONE_COUNTRY, formatDialLabel } from "../../constants/phone-countries";
import CountryCodePicker from "./country-code-picker";
import PhoneKeyboardAccessory, {
  PHONE_KEYBOARD_ACCESSORY_ID,
} from "./phone-keyboard-accessory";
import { sw, sf } from "../../utils/responsive";

import {
  formatNationalDisplay,
  getCountryPlaceholder,
  getFormattedMaxLength,
  getPhoneValidationError,
  normalizeDigitsForCountry,
  parsePhoneInputChange,
} from "../../utils/phone";

const iosPhonePadProps =
  Platform.OS === "ios"
    ? { inputAccessoryViewID: PHONE_KEYBOARD_ACCESSORY_ID }
    : {};

/** Plain object so StyleSheet text-metrics cannot add lineHeight (iOS then sits the digits high). */
const FORM_PHONE_FIELD_STYLE = {
  flex: 1,
  margin: 0,
  paddingTop: 0,
  paddingBottom: 0,
  paddingHorizontal: 0,
  fontFamily: Fonts.regular,
  fontSize: sf(14),
  color: "#1B4F8A",
  textAlignVertical: "center",
  includeFontPadding: false,
  backgroundColor: "transparent",
};

function PhoneFieldMessage({ digits, country, showError }) {
  const { t } = useTranslation();
  if (!digits) {
    if (showError) {
      return <Text style={authStyles.inputErrorText}>{t("auth.enterPhoneShort")}</Text>;
    }
    return null;
  }

  const error = getPhoneValidationError(digits, country);
  if (error) {
    return <Text style={authStyles.inputErrorText}>{error}</Text>;
  }

  return null;
}

function ClearButton({ onPress, label }) {
  return (
    <Pressable
      onPress={onPress}
      style={authStyles.phoneClearBtn}
      hitSlop={8}
      accessibilityLabel={label}
    >
      <Ionicons name="close-circle" size={22} color="#9CA3AF" />
    </Pressable>
  );
}

function CountryCodeButton({ country, variant, onPress }) {
  const { t } = useTranslation();
  const label = formatDialLabel(country);

  if (variant === "signup") {
    return (
      <Pressable
        style={[authStyles.countryCode, styles.countryCodeWide]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t("auth.countryCodeLabel", { code: label })}
      >
        <Text style={authStyles.countryCodeText}>{label}</Text>
        <Ionicons name="chevron-down" size={14} color="#6B7280" style={styles.chevron} />
      </Pressable>
    );
  }

  return (
    <Pressable
      style={styles.loginPrefixBtn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("auth.countryCodeLabel", { code: label })}
    >
      <Text style={authStyles.loginPhonePrefix}>{label}</Text>
      <Ionicons name="chevron-down" size={14} color="#6B7280" />
    </Pressable>
  );
}

function usePhoneInputState({
  digits,
  onChangeDigits,
  country = DEFAULT_PHONE_COUNTRY,
  onCountryChange,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const display = formatNationalDisplay(digits, country);
  const validationError = getPhoneValidationError(digits, country);
  const hasError = Boolean(digits && validationError);
  const formattedMaxLength = getFormattedMaxLength(country);

  const handleChange = (text) => {
    onChangeDigits(parsePhoneInputChange(text, country, digits));
  };

  const handleCountrySelect = (nextCountry) => {
    setPickerOpen(false);
    onCountryChange?.(nextCountry);
    if (digits) {
      const normalized = normalizeDigitsForCountry(digits, nextCountry);
      if (normalized !== digits) {
        onChangeDigits(normalized);
      }
    }
  };

  return {
    pickerOpen,
    setPickerOpen,
    display,
    hasError,
    formattedMaxLength,
    handleChange,
    handleCountrySelect,
  };
}

export default function LoginPhoneInput({
  digits,
  onChangeDigits,
  country = DEFAULT_PHONE_COUNTRY,
  onCountryChange,
  showError = false,
  showHints = true,
  placeholder,
  containerStyle,
}) {
  const { t } = useTranslation();
  const {
    pickerOpen,
    setPickerOpen,
    display,
    hasError,
    formattedMaxLength,
    handleChange,
    handleCountrySelect,
  } = usePhoneInputState({ digits, onChangeDigits, country, onCountryChange });

  const resolvedPlaceholder = placeholder ?? getCountryPlaceholder(country);
  const showFieldError = Boolean(digits && hasError) || (showError && !digits);

  return (
    <View style={containerStyle}>
      <View style={[authStyles.loginPhoneRow, showFieldError && authStyles.loginInputError]}>
        <CountryCodeButton
          country={country}
          variant="login"
          onPress={() => setPickerOpen(true)}
        />
        <LocaleTextInput
          style={authStyles.loginPhoneField}
          placeholder={resolvedPlaceholder}
          placeholderTextColor="rgba(10, 10, 10, 0.45)"
          value={display}
          onChangeText={handleChange}
          forceLtr
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={formattedMaxLength}
          clearButtonMode="never"
          {...iosPhonePadProps}
        />
        {digits.length > 0 ? <ClearButton onPress={() => onChangeDigits("")} label={t("common.clear")} /> : null}
      </View>
      {showHints ? <PhoneFieldMessage digits={digits} country={country} showError={showError} /> : null}
      <PhoneKeyboardAccessory mode="hidden" />

      <CountryCodePicker
        visible={pickerOpen}
        selectedCode={country}
        onSelect={handleCountrySelect}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

/** Compact phone field styled for internal forms (matches text inputs). */
export function FormPhoneInput({
  digits,
  onChangeDigits,
  country = DEFAULT_PHONE_COUNTRY,
  onCountryChange,
  showError = false,
  placeholder,
  containerStyle,
  rowStyle,
  onFocus,
}) {
  const { t } = useTranslation();
  const {
    pickerOpen,
    setPickerOpen,
    display,
    hasError,
    formattedMaxLength,
    handleChange,
    handleCountrySelect,
  } = usePhoneInputState({ digits, onChangeDigits, country, onCountryChange });

  const resolvedPlaceholder = placeholder ?? getCountryPlaceholder(country);
  const showFieldError = Boolean(digits && hasError) || (showError && !digits);

  return (
    <View style={containerStyle}>
      <View style={[formStyles.row, rowStyle, showFieldError && formStyles.rowError]}>
        <Pressable
          style={formStyles.countryBtn}
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("auth.countryCodeLabel", { code: formatDialLabel(country) })}
        >
          <Text style={formStyles.countryText}>{formatDialLabel(country)}</Text>
          <Feather name="chevron-down" size={sf(12)} color="#64748B" />
        </Pressable>
        <View style={formStyles.divider} />
        <LocaleTextInput
          style={FORM_PHONE_FIELD_STYLE}
          placeholder={resolvedPlaceholder}
          placeholderTextColor="#9CA3AF"
          value={display}
          onChangeText={handleChange}
          onFocus={onFocus}
          forceLtr
          textAlignVertical="center"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={formattedMaxLength}
          clearButtonMode="never"
          {...iosPhonePadProps}
        />
        {digits.length > 0 ? (
          <Pressable
            onPress={() => onChangeDigits("")}
            style={formStyles.clearBtn}
            hitSlop={8}
            accessibilityLabel={t("common.clear")}
          >
            <Feather name="x-circle" size={sf(16)} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>
      <PhoneKeyboardAccessory mode="hidden" />

      <CountryCodePicker
        visible={pickerOpen}
        selectedCode={country}
        onSelect={handleCountrySelect}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

export function SignupPhoneInput({
  digits,
  onChangeDigits,
  country = DEFAULT_PHONE_COUNTRY,
  onCountryChange,
  showError = false,
  showHints = true,
  placeholder,
  containerStyle,
  rowStyle,
}) {
  const { t } = useTranslation();
  const {
    pickerOpen,
    setPickerOpen,
    display,
    hasError,
    formattedMaxLength,
    handleChange,
    handleCountrySelect,
  } = usePhoneInputState({ digits, onChangeDigits, country, onCountryChange });

  const resolvedPlaceholder = placeholder ?? getCountryPlaceholder(country);
  const showFieldError = Boolean(digits && hasError) || (showError && !digits);

  return (
    <View style={containerStyle}>
      <View style={[authStyles.signupRow, rowStyle]}>
        <CountryCodeButton
          country={country}
          variant="signup"
          onPress={() => setPickerOpen(true)}
        />
        <View style={[styles.signupFieldWrap, showFieldError && authStyles.signupInputError]}>
          <LocaleTextInput
            style={styles.signupField}
            placeholder={resolvedPlaceholder}
            placeholderTextColor="#9CA3AF"
            value={display}
            onChangeText={handleChange}
            forceLtr
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={formattedMaxLength}
            clearButtonMode="never"
            {...iosPhonePadProps}
          />
          {digits.length > 0 ? <ClearButton onPress={() => onChangeDigits("")} label={t("common.clear")} /> : null}
        </View>
      </View>
      {showHints ? <PhoneFieldMessage digits={digits} country={country} showError={showError} /> : null}
      <PhoneKeyboardAccessory mode="hidden" />

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
  loginPrefixBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginEnd: 8,
    flexShrink: 0,
  },
  countryCodeWide: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 4,
  },
  chevron: {
    marginTop: 1,
  },
  signupFieldWrap: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E6E9EE",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingStart: 16,
    paddingEnd: 8,
  },
  signupField: {
    flex: 1,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#0F172A",
    paddingVertical: 0,
    height: "100%",
  },
});

const formStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    paddingHorizontal: sw(16),
    paddingTop: 0,
    paddingBottom: 0,
    height: sw(52),
    minHeight: sw(52),
    overflow: "hidden",
  },
  rowError: {
    borderColor: "#DC2626",
  },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingEnd: sw(10),
    flexShrink: 0,
    height: "100%",
    justifyContent: "center",
  },
  countryText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(14),
    color: "#1B4F8A",
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#E5E7EB",
    marginVertical: sw(12),
    marginEnd: sw(10),
  },
  clearBtn: {
    paddingStart: sw(6),
    height: "100%",
    justifyContent: "center",
  },
});
