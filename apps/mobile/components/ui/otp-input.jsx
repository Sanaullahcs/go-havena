import React, { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, Text, View, StyleSheet, useWindowDimensions } from "react-native";
import LocaleTextInput from "./locale-text-input";
import { Colors, Shadows } from "../../constants/tokens";
import { Fonts } from "../../constants/font";
import { rnShadow } from "../../utils/shadow";
import PhoneKeyboardAccessory, {
  PHONE_KEYBOARD_ACCESSORY_ID,
} from "./phone-keyboard-accessory";

const MAX_CELL_WIDTH = 48;
const MIN_CELL_WIDTH = 34;

function useOtpCellMetrics(length, splitAt) {
  const { width: windowWidth } = useWindowDimensions();

  return useMemo(() => {
    const horizontalInset = 56;
    const gap = windowWidth < 360 ? 6 : 8;
    const separatorWidth = splitAt > 0 ? 12 : 0;
    const gapTotal = (length - 1) * gap + (splitAt > 0 ? gap * 2 : 0);
    const available = Math.max(windowWidth - horizontalInset, 240);
    const rawCellWidth = Math.floor((available - separatorWidth - gapTotal) / length);
    const cellWidth = Math.min(MAX_CELL_WIDTH, Math.max(rawCellWidth, MIN_CELL_WIDTH));
    const cellHeight = Math.round(cellWidth * (56 / 46));

    return { cellWidth, cellHeight, gap, separatorWidth };
  }, [windowWidth, length, splitAt]);
}

/**
 * One real text field, drawn as separate cells.
 * Per-cell inputs restart the Android IME on every digit (and SMS autofill
 * truncates each box to one character), so the same code that works on iOS
 * is dropped or submitted wrong on Android.
 */
export default function OTPInput({
  length = 6,
  onOTPChange,
  onComplete,
  editable = true,
  hasError = false,
  autoFocus = true,
  splitAt = 3,
  containerStyle,
  /** Increment after an error dialog closes to restore keyboard focus. */
  refocusToken = 0,
}) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [locked, setLocked] = useState(false);
  const inputRef = useRef(null);
  const didAutoFocusRef = useRef(false);
  const completedRef = useRef(false);
  const prevLengthRef = useRef(0);
  const { cellWidth, cellHeight, gap, separatorWidth } = useOtpCellMetrics(length, splitAt);

  const focusInput = () => {
    inputRef.current?.focus?.();
  };

  const blurInput = () => {
    inputRef.current?.blur?.();
    setIsFocused(false);
    Keyboard.dismiss();
  };

  const unlockForCorrection = () => {
    completedRef.current = false;
    setLocked(false);
  };

  useEffect(() => {
    if (!autoFocus || !editable || didAutoFocusRef.current || completedRef.current) {
      return undefined;
    }
    didAutoFocusRef.current = true;
    const timer = setTimeout(() => {
      if (completedRef.current || !editable) return;
      focusInput();
    }, 120);
    return () => clearTimeout(timer);
  }, [autoFocus, editable]);

  useEffect(() => {
    if (!editable) blurInput();
  }, [editable]);

  useEffect(() => {
    if (hasError && (locked || completedRef.current)) {
      unlockForCorrection();
    }
  }, [hasError, locked]);

  useEffect(() => {
    if (!refocusToken || !editable) return undefined;
    unlockForCorrection();
    const timer = setTimeout(() => {
      if (!editable) return;
      focusInput();
    }, 60);
    return () => clearTimeout(timer);
  }, [refocusToken, editable]);

  const handleChangeText = (text) => {
    if (!editable) return;

    if (locked || completedRef.current) {
      unlockForCorrection();
    }

    const digits = String(text).replace(/[^0-9]/g, "").slice(0, length);
    const wasComplete = prevLengthRef.current >= length;
    prevLengthRef.current = digits.length;
    setValue(digits);
    onOTPChange?.(digits);

    if (digits.length < length) {
      completedRef.current = false;
      setLocked(false);
      return;
    }

    // Android can re-emit the same 6 digits on focus. Do not verify twice.
    if (wasComplete || completedRef.current) return;
    completedRef.current = true;
    setLocked(true);
    blurInput();
    requestAnimationFrame(() => {
      onComplete?.(digits);
    });
  };

  const handleFocus = () => {
    if (!editable) {
      blurInput();
      return;
    }
    if (locked || completedRef.current) {
      unlockForCorrection();
    }
    setIsFocused(true);
  };

  const activeIndex = value.length < length ? value.length : -1;

  const getCellStyle = (index) => {
    const filled = Boolean(value[index]);
    const active = editable && isFocused && !locked && index === activeIndex;
    const sizeStyle = { width: cellWidth, height: cellHeight };

    if (hasError) return [styles.cell, sizeStyle, styles.inputError];
    if (filled) return [styles.cell, sizeStyle, styles.inputFilled];
    if (active) return [styles.cell, sizeStyle, styles.inputActive];
    return [styles.cell, sizeStyle];
  };

  const digitColor = (index) => {
    if (hasError) return Colors.error;
    if (value[index]) return Colors.brandPrimaryDeep;
    return Colors.textPrimary;
  };

  return (
    <View style={[styles.container, { gap }, containerStyle]}>
      <Pressable
        accessibilityRole="button"
        disabled={!editable}
        onPress={focusInput}
        style={[styles.cells, { gap }]}
      >
        {Array.from({ length }).map((_, index) => (
          <React.Fragment key={index}>
            {splitAt > 0 && index === splitAt ? (
              <View style={[styles.separator, { width: separatorWidth }]} />
            ) : null}
            <View style={getCellStyle(index)}>
              <Text
                style={[
                  styles.digit,
                  { fontSize: cellWidth >= 44 ? 22 : 20, color: digitColor(index) },
                ]}
              >
                {value[index] || ""}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </Pressable>
      <LocaleTextInput
        ref={inputRef}
        imeSync={false}
        forceLtr
        value={value}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={() => setIsFocused(false)}
        editable={editable}
        showSoftInputOnFocus={editable}
        caretHidden
        maxLength={length}
        keyboardType="number-pad"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        textContentType={Platform.OS === "ios" ? "oneTimeCode" : "none"}
        autoComplete={Platform.OS === "android" ? "sms-otp" : "off"}
        {...(Platform.OS === "android" ? { importantForAutofill: "yes" } : {})}
        selectionColor="transparent"
        style={styles.capture}
        {...(Platform.OS === "ios"
          ? { inputAccessoryViewID: PHONE_KEYBOARD_ACCESSORY_ID }
          : {})}
      />
      <PhoneKeyboardAccessory mode="hidden" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    paddingHorizontal: 4,
    position: "relative",
  },
  cells: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  separator: {
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(148, 163, 184, 0.55)",
    flexShrink: 0,
  },
  cell: {
    borderWidth: 2,
    borderColor: "rgba(226, 232, 240, 1)",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  digit: {
    fontWeight: "700",
    fontFamily: Fonts.bold,
    textAlign: "center",
    padding: 0,
  },
  capture: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    left: -2000,
    top: 0,
    color: "transparent",
    backgroundColor: "transparent",
    fontSize: 1,
    padding: 0,
  },
  inputActive: {
    borderColor: Colors.brandPrimary,
    ...Shadows.card,
    ...rnShadow({ color: Colors.brandPrimaryDeep, offset: { width: 0, height: 2 }, opacity: 0.12, radius: 10 }),
  },
  inputFilled: {
    borderColor: Colors.brandPrimaryDeep,
    backgroundColor: "rgba(209, 250, 245, 0.85)",
  },
  inputError: {
    borderColor: Colors.error,
    backgroundColor: "rgba(254, 242, 242, 0.6)",
  },
});
