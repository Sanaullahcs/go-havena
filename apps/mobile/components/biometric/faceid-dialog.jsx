import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Modal, TouchableOpacity, StyleSheet, Text, Platform } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { navigateAfterAuth } from "../../constants/onboarding-routes";
import AuthSuccessOverlay from "../ui/auth-success-overlay";
import { Fonts } from "../../constants/font";
import { verifyBiometricLogin, BIOMETRIC_ERROR } from "./biometric-service";
import { useAppDialog } from "../../providers/app-dialog-provider";

export default function FaceIdDialog({ visible, onClose }) {
  const { t } = useTranslation();
  const dialog = useAppDialog();
  const [showSuccess, setShowSuccess] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const userRef = useRef(null);
  const finishingRef = useRef(false);
  const title = Platform.OS === "ios" ? t("auth.faceIdLogin") : t("auth.faceUnlock");
  const waitingLabel =
    Platform.OS === "ios" ? t("auth.waitingFaceId") : t("auth.waitingFaceUnlock");
  const prompt =
    Platform.OS === "ios" ? t("auth.signInFaceId") : t("auth.signInFaceUnlock");

  const finishSignIn = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const user = userRef.current;
    setShowSuccess(false);
    onClose?.();
    navigateAfterAuth(router, user);
  }, [onClose]);

  const runAuth = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    finishingRef.current = false;

    const result = await verifyBiometricLogin(prompt);

    setBusy(false);

    if (result.success) {
      userRef.current = result.user ?? null;
      setShowSuccess(true);
      return;
    }

    if (result.code === BIOMETRIC_ERROR.CANCELLED) {
      onClose?.();
      return;
    }

    if (
      result.code === BIOMETRIC_ERROR.NO_SESSION ||
      result.code === BIOMETRIC_ERROR.NOT_AVAILABLE ||
      result.code === BIOMETRIC_ERROR.NOT_ENROLLED
    ) {
      onClose?.();
      await dialog.showDialog({
        type: "info",
        title: t("auth.biometricUnavailableTitle"),
        message: result.message,
        actions: [{ label: t("common.ok"), variant: "primary" }],
      });
      return;
    }

    setFailed(true);
  }, [dialog, onClose, prompt, t]);

  useEffect(() => {
    if (!visible) {
      setShowSuccess(false);
      setFailed(false);
      setBusy(false);
      finishingRef.current = false;
      return undefined;
    }

    runAuth();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const showSheet = visible && !showSuccess && failed;

  return (
    <>
      <AuthSuccessOverlay
        visible={showSuccess}
        title={t("auth.authenticated")}
        subtitle={t("auth.openingHavena")}
        onComplete={finishSignIn}
      />
      <Modal visible={showSheet} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Feather name="x" size={22} color="#4A5565" />
            </TouchableOpacity>
            <View style={styles.iconRing}>
              <Ionicons name="scan" size={44} color="#10B981" />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>
              {busy ? waitingLabel : t("auth.tryAgainOrPhone")}
            </Text>
            {!busy ? (
              <TouchableOpacity onPress={runAuth} style={styles.retryWrap}>
                <Text style={styles.retry}>{t("common.tryAgain")}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onClose} style={styles.cancelWrap}>
              <Text style={styles.cancel}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  closeBtn: { alignSelf: "flex-end" },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontFamily: Fonts.bold, fontSize: 20, color: "#000", fontWeight: "700" },
  sub: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: "#6A7282",
    textAlign: "center",
  },
  retryWrap: { marginTop: 16 },
  retry: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: "#0A2A43",
    fontWeight: "600",
  },
  cancelWrap: { marginTop: 20 },
  cancel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "#4A5565",
  },
});
