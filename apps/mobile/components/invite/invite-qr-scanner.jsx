import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { useAppDialog } from "../../providers/app-dialog-provider";

function extractInviteCode(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    const fromQuery =
      url.searchParams.get("invite_code") ||
      url.searchParams.get("code") ||
      url.searchParams.get("invite");
    if (fromQuery) return fromQuery.trim();
  } catch {
    // not a URL — fall through
  }

  return value;
}

export default function InviteQrScanner({ visible, onClose, onScanned }) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const { showError } = useAppDialog();

  useEffect(() => {
    if (!visible) return;

    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const handleBarcode = useCallback(
    ({ data }) => {
      if (locked || !data) return;

      const code = extractInviteCode(data);
      if (code.length < 6) return;

      setLocked(true);
      onScanned(code);
      onClose();
      setTimeout(() => setLocked(false), 500);
    },
    [locked, onClose, onScanned],
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarcode}
          />
        ) : (
          <SafeAreaView style={styles.permissionWrap}>
            <Text style={styles.permissionText}>
              {t("guests.cameraRequired")}
            </Text>
            <TouchableOpacity
              onPress={async () => {
                const result = await requestPermission();
                if (!result.granted) {
                  await showError(
                    t("guests.cameraPermission"),
                    t("guests.enableCamera"),
                  );
                }
              }}
              style={styles.allowButton}
            >
              <Text style={styles.allowButtonText}>{t("guests.allowCamera")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </SafeAreaView>
        )}

        {permission?.granted ? (
          <SafeAreaView style={styles.overlay}>
            <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.hint}>{t("guests.pointCamera")}</Text>
          </SafeAreaView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 0,
    start: 0,
    end: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  closeIcon: {
    alignSelf: "flex-start",
    padding: 8,
  },
  hint: {
    marginTop: 24,
    textAlign: "center",
    color: "#FFFFFF",
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  permissionWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#FFFFFF",
  },
  permissionText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: "#364153",
    marginBottom: 16,
    textAlign: "center",
  },
  allowButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 8,
  },
  allowButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: "#1B4F8A",
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closeButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "#667085",
  },
});
