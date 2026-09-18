import React, { forwardRef, useCallback, useMemo } from "react";
import { Platform, TextInput } from "react-native";
import { useLanguage } from "../../providers/language-provider";
import { useInputLocale } from "../../hooks/use-input-locale";
import { syncKeyboardForFocusedInput } from "../../utils/native-app-locale";

/** Keyboard types that should stay LTR (digits / phone / email), even in Arabic. */
const LTR_KEYBOARD_TYPES = new Set([
  "number-pad",
  "numeric",
  "phone-pad",
  "decimal-pad",
  "email-address",
]);

/**
 * Drop-in TextInput that follows the active app language:
 * - EN / ES → LTR + left align
 * - AR → RTL + right align
 * - On focus (Android native build): IME hint locales so Gboard can switch
 *
 * Pass `forceLtr` (or use phone/number keyboardType) for digit fields.
 */
const LocaleTextInput = forwardRef(function LocaleTextInput(
  { style, onFocus, forceLtr = false, textAlign: textAlignProp, keyboardType, imeSync = true, ...rest },
  ref,
) {
  const { language } = useLanguage();
  const preferLtr = forceLtr || LTR_KEYBOARD_TYPES.has(keyboardType);
  const { textInputProps } = useInputLocale({ forceLtr: preferLtr });

  const handleFocus = useCallback(
    (event) => {
      if (imeSync) syncKeyboardForFocusedInput(language);
      onFocus?.(event);
    },
    [imeSync, language, onFocus],
  );

  const resolvedTextAlign = useMemo(() => {
    if (textAlignProp != null) return textAlignProp;
    return textInputProps.textAlign;
  }, [textAlignProp, textInputProps.textAlign]);

  return (
    <TextInput
      ref={ref}
      writingDirection={textInputProps.writingDirection}
      accessibilityLanguage={textInputProps.accessibilityLanguage}
      {...(textInputProps.lang ? { lang: textInputProps.lang } : null)}
      {...rest}
      keyboardType={keyboardType}
      onFocus={handleFocus}
      textAlign={resolvedTextAlign}
      textAlignVertical={
        rest.multiline ? rest.textAlignVertical ?? "top" : "center"
      }
      style={[
        Platform.OS === "android" ? { includeFontPadding: false } : null,
        textInputProps.style,
        style,
        { textAlign: resolvedTextAlign },
      ]}
    />
  );
});

export default LocaleTextInput;
