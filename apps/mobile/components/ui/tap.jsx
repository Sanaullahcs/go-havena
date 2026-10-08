import React from "react";
import { Pressable, View } from "react-native";

const DEFAULT_PRESSED = { opacity: 0.72 };

/**
 * Pressable whose visual style lives on an inner View. NativeWind's Pressable
 * interop drops `style={({ pressed }) => ...}`, so layout passed that way is lost.
 * `containerStyle` sizes the touch target itself (e.g. flex: 1, width).
 */
export default function Tap({ style, pressedStyle = DEFAULT_PRESSED, disabledStyle, containerStyle, disabled, children, ...rest }) {
  return (
    <Pressable {...rest} disabled={disabled} style={containerStyle}>
      {({ pressed }) => (
        <View style={[style, pressed && !disabled && pressedStyle, disabled && disabledStyle]}>
          {typeof children === "function" ? children({ pressed }) : children}
        </View>
      )}
    </Pressable>
  );
}
