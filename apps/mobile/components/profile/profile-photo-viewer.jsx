import React from "react";
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  StatusBar,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import CrispImage from "../ui/crisp-image";
import { sf } from "../../utils/responsive";

export default function ProfilePhotoViewer({ visible, uri, onClose }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <CrispImage
          source={{ uri }}
          style={styles.image}
          contentFit="contain"
          accessibilityLabel={t("profile.viewProfilePicture")}
        />
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, { top: Math.max(insets.top, 12) + 8 }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Feather name="x" size={sf(22)} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  closeBtn: {
    position: "absolute",
    end: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
});
