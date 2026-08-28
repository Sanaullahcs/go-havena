import React from "react";
import { Text, View } from "react-native";
import LocaleTextInput from "../ui/locale-text-input";
import { authLayoutStyles as layout } from "../../constants/auth-layout";

/**
 * Email field with placeholder in the vertical middle of the box.
 * Native TextInput placeholders sit high on Android/web, so the hint is
 * a centered Text overlay until the user types.
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
  const empty = !String(value ?? "").length;

  return (
    <View style={[layout.emailField, error && layout.emailFieldError, style]}>
      {empty ? (
        <Text pointerEvents="none" style={layout.emailPlaceholder}>
          {placeholder}
        </Text>
      ) : null}
      <LocaleTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder=""
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
