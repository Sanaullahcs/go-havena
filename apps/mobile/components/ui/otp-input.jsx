import React, { useEffect, useMemo, useRef, useState } from "react";
import { InteractionManager, Keyboard, Platform, View, StyleSheet, useWindowDimensions } from "react-native";
import LocaleTextInput from "./locale-text-input";
import { Colors, Shadows } from "../../constants/tokens";
import { Fonts } from "../../constants/font";
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
  const [otp, setOtp] = useState(Array(length).fill(""));
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [locked, setLocked] = useState(false);
  const inputRefs = useRef(Array(length).fill(null));
  const didAutoFocusRef = useRef(false);
  const completedRef = useRef(false);
  const prevEditableRef = useRef(editable);
  /** Bumps to cancel stale dismissKeyboardHard callbacks after unlock/refocus. */
  const dismissGenRef = useRef(0);
  const { cellWidth, cellHeight, gap, separatorWidth } = useOtpCellMetrics(length, splitAt);

  const canEdit = editable && !locked;

  const cancelPendingDismiss = () => {
    dismissGenRef.current += 1;
  };

  const dismissKeyboard = () => {
    inputRefs.current.forEach((ref) => ref?.blur?.());
    setFocusedIndex(-1);
    Keyboard.dismiss();
  };

  /** Dismiss now and once more after interactions — blocks the one-frame keyboard flash. */
  const dismissKeyboardHard = () => {
    const gen = ++dismissGenRef.current;
    dismissKeyboard();
    requestAnimationFrame(() => {
      if (gen !== dismissGenRef.current) return;
      dismissKeyboard();
    });
    InteractionManager.runAfterInteractions(() => {
      if (gen !== dismissGenRef.current) return;
      dismissKeyboard();
    });
  };

  const unlockForCorrection = () => {
    cancelPendingDismiss();
    completedRef.current = false;
    setLocked(false);
  };

  // Autofocus only once on first mount — never again when `editable` toggles during verify.
  useEffect(() => {
    if (!autoFocus || !editable || didAutoFocusRef.current || completedRef.current) {
      return undefined;
    }
    didAutoFocusRef.current = true;
    const timer = setTimeout(() => {
      if (completedRef.current || !editable) return;
      inputRefs.current[0]?.focus();
      setFocusedIndex(0);
    }, 120);
    return () => clearTimeout(timer);
  }, [autoFocus, editable]);

  // If parent disables editing mid-entry (submit), keep keyboard down.
  useEffect(() => {
    if (!editable) {
      dismissKeyboardHard();
    }
  }, [editable]);

  // After verify finishes (editable false → true), unlock for corrections — do not autofocus
  // (success overlays / error dialogs own the screen; user tap reopens the keyboard).
  useEffect(() => {
    const wasEditable = prevEditableRef.current;
    prevEditableRef.current = editable;
    if (!wasEditable && editable && (locked || completedRef.current)) {
      unlockForCorrection();
    }
  }, [editable, locked]);

  // Wrong-code validation from parent should unlock so cells accept focus again.
  useEffect(() => {
    if (hasError && (locked || completedRef.current)) {
      unlockForCorrection();
    }
  }, [hasError, locked]);

  // Parent bumps this after the error dialog closes so the keyboard returns.
  useEffect(() => {
    if (!refocusToken || !editable) return undefined;
    unlockForCorrection();
    const timer = setTimeout(() => {
      if (!editable || completedRef.current) return;
      const firstEmpty = otp.findIndex((digit) => !digit);
      const target = firstEmpty >= 0 ? firstEmpty : Math.max(length - 1, 0);
      inputRefs.current[target]?.focus?.();
      setFocusedIndex(target);
    }, 60);
    return () => clearTimeout(timer);
  }, [refocusToken, editable, length]);

  const isComplete = (nextOtp) =>
    nextOtp.join("").length === length && !nextOtp.includes("");

  const emitChange = (nextOtp) => {
    const otpString = nextOtp.join("");
    onOTPChange?.(otpString);

    if (isComplete(nextOtp)) {
      completedRef.current = true;
      setLocked(true);
      dismissKeyboardHard();
      // Defer parent verify so blur/dismiss settles before submitting state flips.
      requestAnimationFrame(() => {
        onComplete?.(otpString);
      });
      return;
    }

    completedRef.current = false;
    setLocked(false);
  };

  const handleChangeText = (text, index) => {
    if (!editable) return;

    // User started typing again after a failed verify — unlock without waiting for effects.
    if (locked || completedRef.current) {
      unlockForCorrection();
    }

    const numericText = text.replace(/[^0-9]/g, "");

    if (numericText.length > 1) {
      const digits = numericText.slice(0, length - index).split("");
      const newOtp = [...otp];

      digits.forEach((digit, i) => {
        if (index + i < length) {
          newOtp[index + i] = digit;
        }
      });

      setOtp(newOtp);
      emitChange(newOtp);

      if (!isComplete(newOtp)) {
        const nextIndex = Math.min(index + digits.length, length - 1);
        inputRefs.current[nextIndex]?.focus();
        setFocusedIndex(nextIndex);
      }
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = numericText;
    setOtp(newOtp);
    emitChange(newOtp);

    if (numericText && index < length - 1 && !isComplete(newOtp)) {
      inputRefs.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key !== "Backspace") return;
    if (!editable) return;

    // Unlock after backspace so the user can correct a wrong code.
    if (locked || completedRef.current) {
      unlockForCorrection();
    }

    if (otp[index]) {
      const newOtp = [...otp];
      newOtp[index] = "";
      setOtp(newOtp);
      onOTPChange?.(newOtp.join(""));
      return;
    }

    if (index > 0) {
      inputRefs.current[index - 1]?.focus();
      setFocusedIndex(index - 1);
    }
  };

  const handleFocus = (index) => {
    // Parent still submitting — reject focus.
    if (!editable) {
      inputRefs.current[index]?.blur?.();
      Keyboard.dismiss();
      setFocusedIndex(-1);
      return;
    }

    // User tapped a cell after a failed/locked verify — unlock and keep focus so the keyboard opens.
    // Also cancel any delayed dismissKeyboardHard from the prior submit.
    if (locked || completedRef.current) {
      unlockForCorrection();
    } else {
      cancelPendingDismiss();
    }

    setFocusedIndex(index);
  };

  const getCellStyle = (index) => {
    const filled = Boolean(otp[index]);
    const active = editable && focusedIndex === index && !filled;
    const sizeStyle = { width: cellWidth, height: cellHeight, fontSize: cellWidth >= 44 ? 22 : 20 };

    if (hasError) return [styles.input, sizeStyle, styles.inputError];
    if (filled) return [styles.input, sizeStyle, styles.inputFilled];
    if (active) return [styles.input, sizeStyle, styles.inputActive];
    return [styles.input, sizeStyle];
  };

  return (
    <View style={[styles.container, { gap }, containerStyle]}>
      {Array.from({ length }).map((_, index) => (
        <React.Fragment key={index}>
          {splitAt > 0 && index === splitAt ? (
            <View style={[styles.separator, { width: separatorWidth }]} />
          ) : null}
          <LocaleTextInput
            ref={(ref) => {
              inputRefs.current[index] = ref;
            }}
            style={getCellStyle(index)}
            maxLength={1}
            forceLtr
            textAlign="center"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            onChangeText={(text) => handleChangeText(text, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            onFocus={() => handleFocus(index)}
            onBlur={() => setFocusedIndex((current) => (current === index ? -1 : current))}
            value={otp[index]}
            // Keep focusable whenever parent allows edits — local `locked` only blocks input logic, not taps.
            editable={editable}
            showSoftInputOnFocus={editable}
            selectTextOnFocus={editable}
            caretHidden={!canEdit}
            {...(Platform.OS === "ios"
              ? { inputAccessoryViewID: PHONE_KEYBOARD_ACCESSORY_ID }
              : {})}
          />
        </React.Fragment>
      ))}
      <PhoneKeyboardAccessory mode="hidden" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    paddingHorizontal: 4,
  },
  separator: {
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(148, 163, 184, 0.55)",
    flexShrink: 0,
  },
  input: {
    borderWidth: 2,
    borderColor: "rgba(226, 232, 240, 1)",
    borderRadius: 14,
    fontWeight: "700",
    fontFamily: Fonts.bold,
    textAlign: "center",
    textAlignVertical: "center",
    color: Colors.textPrimary,
    backgroundColor: "#FFFFFF",
    padding: 0,
    flexShrink: 0,
  },
  inputActive: {
    borderColor: Colors.brandPrimary,
    ...Shadows.card,
    shadowColor: Colors.brandPrimaryDeep,
    shadowOpacity: 0.12,
  },
  inputFilled: {
    borderColor: Colors.brandPrimaryDeep,
    backgroundColor: "rgba(209, 250, 245, 0.85)",
    color: Colors.brandPrimaryDeep,
  },
  inputError: {
    borderColor: Colors.error,
    backgroundColor: "rgba(254, 242, 242, 0.6)",
    color: Colors.error,
  },
});
