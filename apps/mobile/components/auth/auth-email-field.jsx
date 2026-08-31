import React from "react";
import { View } from "react-native";
import LocaleTextInput from "../ui/locale-text-input";
import { authLayoutStyles as layout } from "../../constants/auth-layout";

/**
 * Email field. Uses the native placeholder so typed text never draws on top
 * of a leftover overlay hint.
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
  return (
    <View style={[layout.emailField, error && layout.emailFieldError, style]}>
      <LocaleTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        forceLtr
        textAlign="left"
        underlineColorAndroid="transparent"
        style={[layout.emailInput, inputStyle]}
        {...rest}
      />
    </View>
  );
}
