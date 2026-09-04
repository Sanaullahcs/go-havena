import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FOOTER_KEYBOARD_GAP = 12;
/** Extra scroll padding above sticky footer when keyboard is open */
const KEYBOARD_FIELD_FOOTER_GAP = 28;
const LIFT_EPSILON = 2;
/** One delayed re-measure for Android adjustResize (window shrinks after keyboardDidShow). */
const RESIZE_RETRY_MS = 120;
const ANDROID_RESIZE_THRESHOLD = 0.2;
const IOS_KEYBOARD_AVOID = Platform.OS === "ios";

function resolveKeyboardTop(event) {
  const { screenY, height } = event.endCoordinates;
  const windowHeight = Dimensions.get("window").height;
  const topFromHeight = windowHeight - height;

  if (Number.isFinite(screenY) && screenY > 0 && screenY < windowHeight) {
    return Math.min(screenY, topFromHeight);
  }

  return topFromHeight;
}

/** Lifts a pinned footer (composer, submit bar) above the software keyboard on iOS and Android. */
export function useKeyboardFooterLift(hasFooter) {
  const footerMeasureRef = useRef(null);
  const keyboardTopRef = useRef(null);
  const retryTimerRef = useRef(null);
  const [lift, setLift] = useState(0);

  const setLiftStable = useCallback((next) => {
    setLift((current) => (Math.abs(current - next) < LIFT_EPSILON ? current : next));
  }, []);

  const computeLift = useCallback(() => {
    const keyboardTop = keyboardTopRef.current;

    if (!hasFooter || keyboardTop == null || !footerMeasureRef.current) {
      setLiftStable(0);
      return;
    }

    footerMeasureRef.current.measureInWindow((_x, y, _w, height) => {
      const overlap = y + height - keyboardTop + FOOTER_KEYBOARD_GAP;
      setLiftStable(overlap > 0 ? overlap : 0);
    });
  }, [hasFooter, setLiftStable]);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!hasFooter) return undefined;

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (event) => {
      keyboardTopRef.current = resolveKeyboardTop(event);
      requestAnimationFrame(computeLift);
      clearRetry();
      retryTimerRef.current = setTimeout(computeLift, RESIZE_RETRY_MS);
    };

    const onHide = () => {
      keyboardTopRef.current = null;
      clearRetry();
      setLiftStable(0);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      clearRetry();
      showSub.remove();
      hideSub.remove();
    };
  }, [hasFooter, clearRetry, computeLift, setLiftStable]);

  return { footerMeasureRef, lift };
}

/** True while the software keyboard is visible. */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = "keyboardWillShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = () => setVisible(true);
    const onHide = () => setVisible(false);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    // Android fallback when keyboardWillShow is not emitted.
    const didShowSub =
      Platform.OS === "android" ? Keyboard.addListener("keyboardDidShow", onShow) : null;
    const willHideSub =
      Platform.OS === "android" ? Keyboard.addListener("keyboardWillHide", onHide) : null;

    return () => {
      showSub.remove();
      hideSub.remove();
      didShowSub?.remove();
      willHideSub?.remove();
    };
  }, []);

  return visible;
}

/**
 * Bottom offset for absolutely positioned composers (chat, comment bars).
 * iOS: keyboard overlays the window — lift by keyboard height.
 * Android: only lift when adjustResize did not shrink the window.
 */
export function useKeyboardBottomOffset() {
  const insets = useSafeAreaInsets();
  const baselineHeightRef = useRef(Dimensions.get("window").height);
  const retryTimerRef = useRef(null);
  const bottomOffsetRef = useRef(0);
  const [bottomOffset, setBottomOffset] = useState(0);

  useEffect(() => {
    bottomOffsetRef.current = bottomOffset;
  }, [bottomOffset]);

  const resolveOffset = useCallback((event) => {
    const { height = 0, screenY } = event?.endCoordinates ?? {};
    const windowHeight = Dimensions.get("window").height;

    let keyboardHeight = height;
    if (Number.isFinite(screenY) && screenY > 0 && screenY < windowHeight) {
      keyboardHeight = windowHeight - screenY;
    }

    if (keyboardHeight <= 0) {
      setBottomOffset(0);
      return;
    }

    if (Platform.OS === "ios") {
      setBottomOffset(keyboardHeight);
      return;
    }

    const resizeHandled =
      baselineHeightRef.current - windowHeight >= keyboardHeight * ANDROID_RESIZE_THRESHOLD;

    setBottomOffset(resizeHandled ? 0 : keyboardHeight);
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (event) => {
      resolveOffset(event);
      clearRetry();
      if (Platform.OS === "android") {
        retryTimerRef.current = setTimeout(() => resolveOffset(event), RESIZE_RETRY_MS);
      }
    };

    const onHide = () => {
      clearRetry();
      baselineHeightRef.current = Dimensions.get("window").height;
      setBottomOffset(0);
    };

    const dimSub = Dimensions.addEventListener("change", ({ window }) => {
      if (bottomOffsetRef.current === 0) {
        baselineHeightRef.current = window.height;
      }
    });

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      clearRetry();
      showSub.remove();
      hideSub.remove();
      dimSub?.remove?.();
    };
  }, [clearRetry, resolveOffset]);

  return {
    bottomOffset,
    safeBottom: Math.max(insets.bottom, 12),
  };
}

/**
 * Scroll a focused field above the keyboard (+ optional footer height).
 * Uses window measurements so it works with pinned footers and adjustResize.
 */
export function useScrollFieldRefIntoView(
  scrollRef,
  {
    delayMs = Platform.OS === "android" ? 320 : 280,
    topPad = 16,
    footerHeight = 0,
  } = {},
) {
  const keyboardTopRef = useRef(null);
  const scrollOffsetRef = useRef(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (event) => {
      keyboardTopRef.current = resolveKeyboardTop(event);
    };
    const onHide = () => {
      keyboardTopRef.current = null;
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const onScroll = useCallback((event) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const scrollIntoView = useCallback(
    (fieldRef) => {
      if (!scrollRef?.current || !fieldRef?.current) return;

      const run = () => {
        fieldRef.current?.measureInWindow((_x, fieldY, _w, fieldHeight) => {
          const windowHeight = Dimensions.get("window").height;
          const keyboardTop = keyboardTopRef.current ?? windowHeight;
          const visibleBottom = keyboardTop - footerHeight - topPad;
          const fieldBottom = fieldY + fieldHeight;

          if (fieldBottom <= visibleBottom) return;

          scrollRef.current?.scrollTo({
            y: scrollOffsetRef.current + (fieldBottom - visibleBottom),
            animated: true,
          });
        });
      };

      requestAnimationFrame(() => {
        setTimeout(run, delayMs);
        if (Platform.OS === "android") {
          setTimeout(run, delayMs + RESIZE_RETRY_MS);
        }
      });
    },
    [scrollRef, delayMs, topPad, footerHeight],
  );

  return { scrollIntoView, onScroll };
}

/**
 * Scroll long forms so a focused field stays above the keyboard + sticky footer.
 * Pass a content-offset Y (from onLayout) to land on that field; omit to scroll to end.
 */
export function useScrollFieldIntoView(
  scrollRef,
  { delayMs = Platform.OS === "android" ? 280 : 250, topPad = 20 } = {},
) {
  return useCallback(
    (targetY) => {
      if (!scrollRef?.current) return;
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (typeof targetY === "number" && Number.isFinite(targetY)) {
            scrollRef.current?.scrollTo({
              y: Math.max(0, targetY - topPad),
              animated: true,
            });
            return;
          }
          scrollRef.current?.scrollToEnd({ animated: true });
        }, delayMs);
      });
    },
    [scrollRef, delayMs, topPad],
  );
}

/**
 * Lifts scroll content above the software keyboard.
 * Prefer KeyboardSafeScreen for forms with a sticky footer.
 */
export function KeyboardSafeView({
  children,
  style,
  keyboardVerticalOffset = 0,
}) {
  if (Platform.OS === "android") {
    return <View style={[styles.flex, style]}>{children}</View>;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior="padding"
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * Scrollable body + optional pinned footer (submit / post buttons).
 * iOS: KeyboardAvoidingView keeps footer in layout flow (no translateY overlap).
 * Android: automaticallyAdjustKeyboardInsets + optional footer lift.
 */
export default function KeyboardSafeScreen({
  children,
  footer,
  scrollRef,
  contentContainerStyle,
  scrollStyle,
  footerBorderless = false,
  footerStyle,
  scrollProps,
  keyboardVerticalOffset = 0,
  /** When false, iOS uses ScrollView keyboard insets instead of KeyboardAvoidingView (better for long forms). */
  keyboardAvoiding = true,
  /** When false, sticky footer stays at the layout bottom (no translateY lift above keyboard). */
  footerKeyboardLift = true,
  /** Extra bottom padding while keyboard is open so lower fields can scroll above the CTA */
  keyboardFieldGap,
  /** Pin footer to the home indicator with no extra gap below the field. */
  dockFooter = false,
}) {
  const insets = useSafeAreaInsets();
  const hasFooter = Boolean(footer);
  const keyboardVisible = useKeyboardVisible();
  const resolvedFieldGap =
    keyboardFieldGap ??
    (hasFooter ? KEYBOARD_FIELD_FOOTER_GAP : 0);
  const fieldFooterGap = keyboardVisible && hasFooter ? resolvedFieldGap : 0;
  const enableFooterLift = hasFooter && footerKeyboardLift && !IOS_KEYBOARD_AVOID;
  const { footerMeasureRef, lift } = useKeyboardFooterLift(enableFooterLift);
  const footerBottomPad = keyboardVisible
    ? 6
    : dockFooter
      ? 6
      : Math.max(insets.bottom, 12);

  const body = (
    <View style={styles.flex}>
      <ScrollView
        ref={scrollRef}
        style={[styles.flex, scrollStyle]}
        contentContainerStyle={[
          styles.scrollContent,
          contentContainerStyle,
          fieldFooterGap > 0 && { paddingBottom: fieldFooterGap },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={
          keyboardAvoiding ? !IOS_KEYBOARD_AVOID : true
        }
        {...scrollProps}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          ref={footerMeasureRef}
          collapsable={false}
          style={[
            styles.footerMeasure,
            footerBorderless && !dockFooter && styles.footerMeasureBorderless,
            dockFooter && styles.footerMeasureDocked,
            // Keyboard covers the home indicator — don't stack large bottom inset on top of it
            {
              paddingBottom: footerBottomPad,
            },
          ]}
        >
          <View
            style={[
              styles.footer,
              footerBorderless && styles.footerBorderless,
              dockFooter && styles.footerDocked,
              lift > 0 && { transform: [{ translateY: -lift }] },
              footerStyle,
            ]}
          >
            {footer}
          </View>
        </View>
      ) : null}
    </View>
  );

  if (IOS_KEYBOARD_AVOID && keyboardAvoiding) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {body}
      </KeyboardAvoidingView>
    );
  }

  return body;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
  },
  footerMeasure: {
    backgroundColor: "#FFFFFF",
  },
  footerMeasureBorderless: {
    backgroundColor: "transparent",
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
  },
  footerBorderless: {
    borderTopWidth: 0,
    // Keep a real gap above Send Code / primary CTA (was 0 → button sat on the field)
    paddingTop: 16,
    backgroundColor: "transparent",
  },
  footerMeasureDocked: {
    backgroundColor: "#FFFFFF",
  },
  footerDocked: {
    paddingTop: 0,
    paddingHorizontal: 0,
    borderTopWidth: 0,
    backgroundColor: "#FFFFFF",
  },
});
