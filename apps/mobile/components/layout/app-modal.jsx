import React from "react";
import { Modal, Platform, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import useOverlayChrome from "../../hooks/use-overlay-chrome";

/**
 * Modal with correct status bar handling for dim overlays.
 * Uses light status icons while open; restores screen chrome on close.
 *
 * `overFullScreen` keeps the transparent modal covering the full window from
 * the first frame (avoids the common “centered card jumps down” layout shift
 * when status-bar / presentation metrics settle a tick later). StatusBar is
 * kept out of the flex tree so it cannot affect vertical centering.
 */
export default function AppModal({
  visible,
  children,
  statusBarStyle = "light",
  animationType = "fade",
  manageOverlayChrome = true,
  ...rest
}) {
  useOverlayChrome(visible && manageOverlayChrome);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated={Platform.OS === "android" ? true : undefined}
      {...rest}
    >
      {visible ? <StatusBar style={statusBarStyle} /> : null}
      <View style={styles.host} collapsable={false} pointerEvents="box-none">
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
