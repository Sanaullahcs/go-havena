import React from "react";
import { Modal } from "react-native";
import { StatusBar } from "expo-status-bar";
import useOverlayChrome from "../../hooks/use-overlay-chrome";

/**
 * Modal with correct status bar handling for dim overlays.
 * Uses light status icons while open; restores screen chrome on close.
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
      {...rest}
    >
      {visible ? <StatusBar style={statusBarStyle} /> : null}
      {children}
    </Modal>
  );
}
