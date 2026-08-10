import React, { forwardRef } from "react";
import { TextInput } from "react-native";
import { useInputLocale } from "../../hooks/use-input-locale";

/**
 * Drop-in TextInput that respects the active app language
 * (RTL alignment for Arabic + native keyboard locale sync).
 */
const LocaleTextInput = forwardRef(function LocaleTextInput(
  { style, ...rest },
  ref,
) {
  const inputLocale = useInputLocale();

  return (
    <TextInput
      ref={ref}
      {...inputLocale}
      {...rest}
      style={[inputLocale.style, style]}
      textAlign={rest.textAlign ?? inputLocale.textAlign}
    />
  );
});

export default LocaleTextInput;
