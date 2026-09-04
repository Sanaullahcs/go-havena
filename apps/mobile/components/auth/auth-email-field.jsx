import React from "react";
import { View } from "react-native";
import LocaleTextInput from "../ui/locale-text-input";
import { authLayoutStyles as layout } from "../../constants/auth-layout";

/**
 * Email field. Placeholder and typed value share the same left + vertical
 * alignment. The native placeholder is used so iOS does not clip a 56px overlay
 * against the 1px border.
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
        {...rest}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        forceLtr
        textAlign="left"
        underlineColorAndroid="transparent"
        style={[
          layout.emailInput,
          // Inline so the global text-metrics patch cannot force a taller line box.
          {
            lineHeight: 20,
            includeFontPadding: false,
          },
          inputStyle,
        ]}
      />
    </View>
  );
}
