import React, { useCallback, useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, View } from "react-native";
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardEvents,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Space kept between the focused field and the keyboard (or the footer riding on it). */
const FIELD_GAP = 20;

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const show = KeyboardEvents.addListener("keyboardWillShow", (event) => setHeight(event?.height ?? 0));
    const hide = KeyboardEvents.addListener("keyboardWillHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

/** True while the software keyboard is visible. */
export function useKeyboardVisible() {
  return useKeyboardHeight() > 0;
}

/**
 * Bottom offset for absolutely positioned composers (chat, comment bars).
 * The keyboard overlays the window on both platforms (edge-to-edge), so lift by its height.
 */
export function useKeyboardBottomOffset() {
  const insets = useSafeAreaInsets();
  const bottomOffset = useKeyboardHeight();
  return {
    bottomOffset,
    safeBottom: Math.max(insets.bottom, 12),
  };
}

/**
 * Kept for screens built before KeyboardSafeScreen scrolled focused fields itself.
 * KeyboardAwareScrollView now keeps the focused field above the keyboard and footer.
 */
export function useScrollFieldRefIntoView() {
  const noop = useCallback(() => {}, []);
  return { scrollIntoView: noop, onScroll: noop, clearPending: noop };
}

/** Scroll a long form to a content offset (or to the end when omitted). */
export function useScrollFieldIntoView(scrollRef, { delayMs = 250, topPad = 20 } = {}) {
  return useCallback(
    (targetY) => {
      if (!scrollRef?.current) return;
      setTimeout(() => {
        if (typeof targetY === "number" && Number.isFinite(targetY)) {
          scrollRef.current?.scrollTo({ y: Math.max(0, targetY - topPad), animated: true });
          return;
        }
        scrollRef.current?.scrollToEnd({ animated: true });
      }, delayMs);
    },
    [scrollRef, delayMs, topPad],
  );
}

/** Lifts content above the software keyboard on iOS and Android. */
export function KeyboardSafeView({ children, style, keyboardVerticalOffset = 0 }) {
  return (
    <KeyboardAvoidingView style={[styles.flex, style]} behavior="padding" keyboardVerticalOffset={keyboardVerticalOffset}>
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * Scrollable form body + optional pinned footer (submit / post buttons).
 * The focused field is always scrolled above the keyboard, and the footer rides on
 * top of the keyboard unless `footerKeyboardLift` is false.
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
  onFooterHeight,
  dismissKeyboardOnPress = false,
  /** When false, the footer stays at the bottom and the keyboard covers it. */
  footerKeyboardLift = true,
  /** Extra space between a focused field and the footer. */
  keyboardFieldGap,
  /** Pin footer to the home indicator with no extra gap below the field. */
  dockFooter = false,
}) {
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const hasFooter = Boolean(footer);
  const liftFooter = hasFooter && footerKeyboardLift;
  const footerBottomPad = dockFooter ? 6 : Math.max(insets.bottom, 12);
  const bottomOffset = FIELD_GAP + (liftFooter ? footerHeight + (keyboardFieldGap ?? 0) : 0);

  const footerNode = hasFooter ? (
    <View
      collapsable={false}
      onLayout={(event) => {
        const next = Math.ceil(event.nativeEvent.layout.height);
        setFooterHeight(next);
        onFooterHeight?.(next);
      }}
      style={[
        styles.footerMeasure,
        footerBorderless && !dockFooter && styles.footerMeasureBorderless,
        dockFooter && styles.footerMeasureDocked,
        { paddingBottom: footerBottomPad },
      ]}
    >
      <View style={[styles.footer, footerBorderless && styles.footerBorderless, dockFooter && styles.footerDocked, footerStyle]}>
        {footer}
      </View>
    </View>
  ) : null;

  return (
    <View style={styles.flex}>
      <KeyboardAwareScrollView
        ref={scrollRef}
        style={[styles.flex, scrollStyle]}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        bottomOffset={bottomOffset}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
        {...scrollProps}
      >
        {dismissKeyboardOnPress ? (
          <Pressable onPress={Keyboard.dismiss} accessible={false} style={styles.scrollPressable}>
            {children}
          </Pressable>
        ) : (
          children
        )}
      </KeyboardAwareScrollView>
      {liftFooter ? (
        // The keyboard already covers the home indicator, so drop that padding while it is open.
        <KeyboardStickyView offset={{ closed: 0, opened: Math.max(0, footerBottomPad - 6) }}>
          {footerNode}
        </KeyboardStickyView>
      ) : (
        footerNode
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
  },
  scrollPressable: {
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
    // Keep a real gap above the primary CTA so it never sits on the field.
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
