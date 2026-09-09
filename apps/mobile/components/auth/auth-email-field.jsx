import React from "react";
import { View } from "react-native";
import LocaleTextInput from "../ui/locale-text-input";
import { AUTH_FIELD_INPUT_STYLE, authLayoutStyles as layout } from "../../constants/auth-layout";

/**
 * Email field. The 56px box centers the native input; placeholder and typed
 * text share the same metrics (no lineHeight — iOS top-aligns when it is set).
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
        style={[AUTH_FIELD_INPUT_STYLE, inputStyle]}
      />
    </View>
  );
}
