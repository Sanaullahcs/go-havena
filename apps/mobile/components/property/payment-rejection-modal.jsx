import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";
import {
  PAYMENT_REJECTION_CODES,
  PAYMENT_REJECTION_LABEL_KEYS,
  validatePaymentRejection,
} from "../../constants/payment-rejection";

export default function PaymentRejectionModal({
  visible,
  title,
  subtitle,
  submitting = false,
  onClose,
  onSubmit,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [rejectionCode, setRejectionCode] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);
  const busy = submitting || pending;

  useEffect(() => {
    if (!visible) {
      setRejectionCode("");
      setRejectionReason("");
      setErrors({});
      setPending(false);
    }
  }, [visible]);

  async function handleSubmit() {
    if (busy) return;
    const nextErrors = validatePaymentRejection(rejectionCode, rejectionReason);
    if (nextErrors) {
      setErrors(nextErrors);
      return;
    }
    setPending(true);
    try {
      await onSubmit({
        rejection_code: rejectionCode,
        rejection_reason: rejectionCode === "other" ? rejectionReason.trim() : undefined,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboard}
        >
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, sw(16)) }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>{title || t("services.paymentRejectTitle")}</Text>
                {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
              </View>
              <Pressable onPress={onClose} hitSlop={12} disabled={busy}>
                <Feather name="x" size={sf(22)} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
              <Text style={styles.label}>{t("services.paymentRejectReasonLabel")} *</Text>
              {PAYMENT_REJECTION_CODES.map((code) => {
                const selected = rejectionCode === code;
                return (
                  <Pressable
                    key={code}
                    disabled={busy}
                    onPress={() => {
                      setRejectionCode(code);
                      setErrors((prev) => ({ ...prev, rejection_code: undefined }));
                    }}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {t(PAYMENT_REJECTION_LABEL_KEYS[code])}
                    </Text>
                  </Pressable>
                );
              })}
              {errors.rejection_code ? (
                <Text style={styles.errorText}>{t("services.paymentRejectSelect")}</Text>
              ) : null}

              {rejectionCode === "other" ? (
                <View style={styles.otherBox}>
                  <Text style={styles.label}>{t("services.paymentRejectOtherLabel")} *</Text>
                  <TextInput
                    value={rejectionReason}
                    onChangeText={(text) => {
                      setRejectionReason(text);
                      setErrors((prev) => ({ ...prev, rejection_reason: undefined }));
                    }}
                    placeholder={t("services.paymentRejectOtherPlaceholder")}
                    placeholderTextColor="#94A3B8"
                    multiline
                    editable={!busy}
                    style={[styles.textarea, errors.rejection_reason && styles.textareaError]}
                  />
                  {errors.rejection_reason ? (
                    <Text style={styles.errorText}>{t("services.paymentRejectOtherRequired")}</Text>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable disabled={busy} onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => void handleSubmit()} style={styles.rejectBtn}>
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.rejectText}>{t("services.paymentRejectSubmit")}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  keyboard: { width: "100%" },
  sheet: {
    maxHeight: "92%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: sw(20),
    borderTopRightRadius: sw(20),
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: sw(20),
    paddingTop: sw(18),
    paddingBottom: sw(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  headerCopy: { flex: 1, paddingRight: sw(12) },
  title: { fontFamily: Fonts.semiBold, fontSize: sf(18), color: "#0F172A" },
  subtitle: { marginTop: sw(4), fontFamily: Fonts.regular, fontSize: sf(12), color: "#64748B" },
  body: { paddingHorizontal: sw(20), paddingVertical: sw(16) },
  label: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#475569",
    marginBottom: sw(10),
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(12),
    paddingHorizontal: sw(12),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: sw(8),
  },
  optionSelected: {
    borderColor: PropertyHubTheme.teal,
    backgroundColor: "#F0FDFA",
  },
  radio: {
    width: sw(20),
    height: sw(20),
    borderRadius: sw(10),
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: PropertyHubTheme.teal },
  radioDot: {
    width: sw(10),
    height: sw(10),
    borderRadius: sw(5),
    backgroundColor: PropertyHubTheme.teal,
  },
  optionText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(14), color: "#334155" },
  optionTextSelected: { fontFamily: Fonts.medium, color: "#0F172A" },
  otherBox: { marginTop: sw(8) },
  textarea: {
    minHeight: sw(88),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    padding: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: "#0F172A",
    textAlignVertical: "top",
  },
  textareaError: { borderColor: "#F87171" },
  errorText: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#DC2626",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: sw(10),
    paddingHorizontal: sw(20),
    paddingTop: sw(12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  cancelBtn: {
    paddingHorizontal: sw(16),
    paddingVertical: sw(12),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cancelText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#475569" },
  rejectBtn: {
    minWidth: sw(140),
    minHeight: sw(44),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(16),
    paddingVertical: sw(12),
    borderRadius: sw(12),
    backgroundColor: "#DC2626",
  },
  rejectText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#FFFFFF" },
});
