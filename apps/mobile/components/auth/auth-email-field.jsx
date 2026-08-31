import React from "react";
import { StyleSheet, Text, View } from "react-native";
import LocaleTextInput from "../ui/locale-text-input";
import { authLayoutStyles as layout } from "../../constants/auth-layout";

/**
 * Email field with centered placeholder and typed value.
 * iOS often ignores textAlign on the native placeholder, so the hint is a
 * centered overlay that only mounts while the field is empty.
 */
export default function AuthEmailField({
  value,
  onChangeText,
  placeholder,
  error = false,
  style,
  inputStyle,
  ...rest
}) {
  const showPlaceholder = !String(value ?? "").length;

  return (
    <View style={[layout.emailField, error && layout.emailFieldError, style]}>
      {showPlaceholder ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <Text style={layout.emailPlaceholder}>{placeholder}</Text>
        </View>
      ) : null}
      <LocaleTextInput
        {...rest}
        value={value}
        onChangeText={onChangeText}
        placeholder=""
        placeholderTextColor="#9CA3AF"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        forceLtr
        textAlign="center"
        underlineColorAndroid="transparent"
        className="havena-email-input"
        style={[layout.emailInput, inputStyle]}
      />
    </View>
  );
}
