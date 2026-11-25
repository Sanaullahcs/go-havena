import React, { forwardRef } from "react";
import { Platform } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sw } from "../../utils/responsive";

/**
 * Drop-in ScrollView for forms: scrolls the focused field above the keyboard on
 * iOS and Android (edge-to-edge included). Pass `footerHeight` when a
 * KeyboardFooter sits under it so fields clear the footer too.
 */
export const KeyboardScroll = forwardRef(function KeyboardScroll(
  { footerHeight = 0, bottomOffset, children, ...rest },
  ref,
) {
  return (
    <KeyboardAwareScrollView
      ref={ref}
      bottomOffset={bottomOffset ?? sw(24) + footerHeight}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});

/** Footer (primary action bar) that rides on top of the keyboard. */
export function KeyboardFooter({ children, style }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={style}>
      {children}
    </KeyboardStickyView>
  );
}
