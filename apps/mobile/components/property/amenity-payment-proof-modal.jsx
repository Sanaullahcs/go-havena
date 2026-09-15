import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Image,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { sf, sw } from "../../utils/responsive";
import { pickImage, pickImageFile, takePhoto } from "../../utils/pickImage";
import { formatDisplayDate } from "../../utils/form-datetime";
import { useApiAction } from "../../hooks/use-api-action";
import { getApiErrorMessage } from "../../utils/auth-errors";
import { submitAmenityBillProof } from "../../services/amenity-api";

function todayDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
}

function toLocalNoon(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return todayDate();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function toIsoDate(value) {
  const date = toLocalNoon(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampToToday(value) {
  const date = toLocalNoon(value);
  const today = todayDate();
  return date.getTime() > today.getTime() ? today : date;
}

function isImageAsset(asset) {
  const mime = String(asset?.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (mime === "application/pdf") return false;
  const name = String(asset?.fileName || asset?.name || "").toLowerCase();
  return /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(name);
}

function fileLabel(asset) {
  return asset?.fileName || asset?.name || "";
}

const PICK_OPTIONS = { documentPick: true, allowPdf: true, uploadBaseName: "payment-proof" };
const WINDOW_HEIGHT = Dimensions.get("window").height;

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

export default function AmenityPaymentProofModal({
  visible,
  bill,
  amenityId,
  amenityName,
  onClose,
  onSubmitted,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { showSuccess } = useApiAction();
  const [fileAsset, setFileAsset] = useState(null);
  const [paymentDate, setPaymentDate] = useState(todayDate);
  const [iosDraft, setIosDraft] = useState(todayDate);
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  const dateIso = useMemo(() => toIsoDate(paymentDate), [paymentDate]);
  const todayIso = toIsoDate(todayDate());
  const dateValid = Boolean(dateIso) && dateIso <= todayIso;
  const canSubmit = Boolean(fileAsset?.uri) && dateValid && !submitting && !picking;
  const scrollMaxHeight = Math.round(WINDOW_HEIGHT * 0.9) - sw(168) - insets.bottom;

  const reset = useCallback(() => {
    const today = todayDate();
    setFileAsset(null);
    setPaymentDate(today);
    setIosDraft(today);
    setShowIosPicker(false);
    setShowSources(false);
    setPicking(false);
    setReference("");
    setNote("");
    setError(null);
    setSubmitting(false);
    submitLockRef.current = false;
  }, []);

  useEffect(() => {
    if (visible) {
      reset();
    }
  }, [visible, reset]);

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose?.();
  };

  const applyPickedFile = (asset) => {
    if (!asset?.uri) return;
    setFileAsset(asset);
    setShowSources(false);
    setError(null);
  };

  const pickFrom = async (source) => {
    if (picking || submitting) return;
    setPicking(true);
    setError(null);
    try {
      // Let the press settle so iOS can present Camera / Library / Files over this sheet.
      await new Promise((resolve) => setTimeout(resolve, 80));
      let asset = null;
      if (source === "camera") {
        asset = await takePhoto(undefined, PICK_OPTIONS);
      } else if (source === "library") {
        asset = await pickImage(undefined, PICK_OPTIONS);
      } else {
        asset = await pickImageFile(undefined, PICK_OPTIONS);
      }
      applyPickedFile(asset);
    } catch {
      // Native pickers already surface permission / format errors.
    } finally {
      setPicking(false);
    }
  };

  const openDatePicker = () => {
    if (submitting) return;
    const current = clampToToday(paymentDate || todayDate());
    if (Platform.OS === "android") {
      try {
        DateTimePickerAndroid.open({
          value: current,
          mode: "date",
          maximumDate: todayDate(),
          onChange: (event, selected) => {
            if (event?.type === "dismissed" || event?.type === "neutralButtonPressed") return;
            if (selected) setPaymentDate(clampToToday(selected));
          },
        });
      } catch {
        setIosDraft(current);
        setShowIosPicker(true);
      }
      return;
    }
    setIosDraft(current);
    setShowIosPicker(true);
  };

  const commitIosDate = () => {
    setPaymentDate(clampToToday(iosDraft));
    setShowIosPicker(false);
  };

  const handleSubmit = async () => {
    if (submitLockRef.current || submitting || picking) return;
    if (!fileAsset?.uri) {
      setError(t("propertyMgmt.paymentProofRequired"));
      return;
    }
    if (!dateIso) {
      setError(t("propertyMgmt.paymentDateRequired"));
      return;
    }
    if (dateIso > todayIso) {
      setError(t("propertyMgmt.paymentDateFuture"));
      return;
    }
    if (!bill?.resident_bill_id || !amenityId) {
      setError(t("propertyMgmt.couldNotSubmitProof"));
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setError(null);
    await waitForNextPaint();

    try {
      const result = await submitAmenityBillProof(amenityId, bill.resident_bill_id, {
        fileAsset,
        paymentDate: dateIso,
        paymentReference: reference.trim(),
        paymentNote: note.trim(),
      });
      onSubmitted?.(result?.data ?? null);
      showSuccess(
        t("propertyMgmt.paymentProof"),
        result?.message ?? t("propertyMgmt.paymentProofSubmitted"),
      );
    } catch (err) {
      setError(getApiErrorMessage(err) || t("propertyMgmt.couldNotSubmitProof"));
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const selectedName = fileLabel(fileAsset);
  const showPreview = Boolean(fileAsset?.uri) && isImageAsset(fileAsset);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, sw(12)) }]}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>
                  {bill?.status === "rejected"
                    ? t("propertyMgmt.uploadNewPaymentProof")
                    : t("propertyMgmt.uploadPaymentProof")}
                </Text>
                <Text style={styles.subtitle}>
                  {amenityName}
                  {bill?.billing_month_label ? ` · ${bill.billing_month_label}` : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={handleClose} hitSlop={10} disabled={submitting}>
                <Feather name="x" size={sf(18)} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={{ maxHeight: scrollMaxHeight }}
              contentContainerStyle={styles.body}
            >
              <Text style={styles.label}>{t("propertyMgmt.paymentProof")} *</Text>
              <TouchableOpacity
                style={styles.fileBtn}
                onPress={() => setShowSources((open) => !open)}
                activeOpacity={0.8}
                disabled={submitting}
              >
                <Feather name={fileAsset ? "check-circle" : "upload"} size={sf(16)} color="#1B4F8A" />
                <Text style={styles.fileBtnText} numberOfLines={2}>
                  {selectedName || t("propertyMgmt.choosePaymentProof")}
                </Text>
                {fileAsset ? (
                  <Text style={styles.changeText}>{t("propertyMgmt.changePaymentProof")}</Text>
                ) : (
                  <Feather name={showSources ? "chevron-up" : "chevron-down"} size={sf(16)} color="#1B4F8A" />
                )}
              </TouchableOpacity>
              <Text style={styles.hint}>{t("propertyMgmt.proofFormatsHint")}</Text>

              {showPreview ? (
                <Image source={{ uri: fileAsset.uri }} style={styles.preview} resizeMode="cover" />
              ) : fileAsset ? (
                <View style={styles.pdfPreview}>
                  <Feather name="file-text" size={sf(18)} color="#1B4F8A" />
                  <Text style={styles.pdfPreviewText} numberOfLines={2}>
                    {selectedName}
                  </Text>
                </View>
              ) : null}

              {showSources ? (
                <View style={styles.sourceList}>
                  <SourceButton
                    icon="camera"
                    label={t("propertyMgmt.proofFromCamera")}
                    disabled={picking || submitting}
                    onPress={() => pickFrom("camera")}
                  />
                  <SourceButton
                    icon="image"
                    label={t("propertyMgmt.proofFromLibrary")}
                    disabled={picking || submitting}
                    onPress={() => pickFrom("library")}
                  />
                  <SourceButton
                    icon="folder"
                    label={t("propertyMgmt.proofFromFiles")}
                    disabled={picking || submitting}
                    onPress={() => pickFrom("file")}
                  />
                  {picking ? (
                    <View style={styles.pickingRow}>
                      <ActivityIndicator size="small" color="#1B4F8A" />
                      <Text style={styles.hint}>{t("common.loading")}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Text style={styles.label}>{t("propertyMgmt.paymentDate")} *</Text>
              <TouchableOpacity
                style={styles.fileBtn}
                onPress={openDatePicker}
                activeOpacity={0.8}
                disabled={submitting}
              >
                <Feather name="calendar" size={sf(16)} color="#1B4F8A" />
                <Text style={styles.fileBtnText}>{formatDisplayDate(paymentDate)}</Text>
              </TouchableOpacity>

              <Text style={styles.label}>{t("propertyMgmt.paymentReference")}</Text>
              <TextInput
                style={styles.input}
                value={reference}
                onChangeText={setReference}
                placeholder={t("propertyMgmt.optional")}
                placeholderTextColor={Colors.textMuted}
                editable={!submitting}
              />

              <Text style={styles.label}>{t("propertyMgmt.paymentNote")}</Text>
              <TextInput
                style={[styles.input, styles.note]}
                value={note}
                onChangeText={setNote}
                placeholder={t("propertyMgmt.optional")}
                placeholderTextColor={Colors.textMuted}
                multiline
                editable={!submitting}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.cancel}
                onPress={handleClose}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submit,
                  submitting && styles.submitBusy,
                  !canSubmit && !submitting && styles.submitDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!canSubmit || submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <View style={styles.submitRow}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.submitText}>{t("propertyMgmt.submittingProof")}</Text>
                  </View>
                ) : (
                  <Text style={styles.submitText}>{t("propertyMgmt.submitProof")}</Text>
                )}
              </TouchableOpacity>
            </View>

            {showIosPicker ? (
              <View style={styles.dateOverlay} pointerEvents="box-none">
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowIosPicker(false)} />
                <View style={[styles.dateCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                  <View style={styles.dateHeader}>
                    <TouchableOpacity onPress={() => setShowIosPicker(false)} hitSlop={8}>
                      <Text style={styles.dateActionMuted}>{t("common.cancel")}</Text>
                    </TouchableOpacity>
                    <Text style={styles.dateTitle}>{t("propertyMgmt.selectDate")}</Text>
                    <TouchableOpacity onPress={commitIosDate} hitSlop={8}>
                      <Text style={styles.dateActionPrimary}>{t("common.done")}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.datePreview}>{formatDisplayDate(iosDraft)}</Text>
                  <DateTimePicker
                    value={iosDraft}
                    mode="date"
                    display="spinner"
                    themeVariant="light"
                    textColor="#111827"
                    accentColor="#1B4F8A"
                    maximumDate={todayDate()}
                    onChange={(_, next) => {
                      if (next) setIosDraft(clampToToday(next));
                    }}
                    style={styles.iosPicker}
                  />
                </View>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
    </Modal>
  );
}

function SourceButton({ icon, label, disabled, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.sourceBtn, disabled && styles.sourceBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <Feather name={icon} size={sf(16)} color="#1B4F8A" />
      <Text style={styles.sourceBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.4)",
  },
  sheet: {
    position: "relative",
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: sw(20),
    borderTopRightRadius: sw(20),
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: sw(18),
    paddingTop: sw(16),
    paddingBottom: sw(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  headerCopy: { flex: 1, paddingRight: sw(12) },
  title: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(17),
    color: Colors.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textMuted,
  },
  body: {
    paddingHorizontal: sw(18),
    paddingTop: sw(14),
    paddingBottom: sw(12),
  },
  label: {
    marginTop: sw(10),
    marginBottom: sw(6),
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(12),
    color: Colors.textSecondary,
  },
  fileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    borderWidth: 1,
    borderColor: "rgba(27,79,138,0.18)",
    backgroundColor: "#F8FAFC",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
  },
  fileBtnText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: Colors.textPrimary,
  },
  changeText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(12),
    color: "#1B4F8A",
  },
  hint: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: Colors.textMuted,
  },
  preview: {
    marginTop: sw(10),
    width: "100%",
    height: sw(140),
    borderRadius: sw(12),
    backgroundColor: "#E2E8F0",
  },
  pdfPreview: {
    marginTop: sw(10),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    borderRadius: sw(12),
    backgroundColor: "#EFF6FF",
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
  },
  pdfPreviewText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: Colors.textPrimary,
  },
  sourceList: {
    marginTop: sw(8),
    gap: sw(8),
  },
  sourceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: "#E0F2FE",
    paddingHorizontal: sw(12),
  },
  sourceBtnDisabled: { opacity: 0.55 },
  sourceBtnText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(14),
    color: "#1B4F8A",
  },
  pickingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingVertical: sw(4),
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textPrimary,
  },
  note: { minHeight: sw(80), textAlignVertical: "top" },
  error: {
    marginTop: sw(8),
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#DC2626",
  },
  footer: {
    flexDirection: "row",
    gap: sw(10),
    paddingHorizontal: sw(18),
    paddingTop: sw(10),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    backgroundColor: "#FFFFFF",
  },
  cancel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: sw(12),
    backgroundColor: "#F1F5F9",
    paddingVertical: sw(12),
  },
  cancelText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    color: Colors.textSecondary,
  },
  submit: {
    flex: 1.2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: sw(12),
    backgroundColor: "#1B4F8A",
    paddingVertical: sw(12),
  },
  submitBusy: { opacity: 1 },
  submitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
  },
  submitDisabled: { opacity: 0.45 },
  submitText: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(13),
    color: "#FFFFFF",
  },
  dateOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.35)",
    zIndex: 20,
  },
  dateCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
  },
  dateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dateTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: "#111827",
  },
  dateActionMuted: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "#6A7282",
  },
  dateActionPrimary: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: "#14B8A6",
  },
  datePreview: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: "#111827",
    textAlign: "center",
    marginTop: 12,
  },
  iosPicker: {
    width: "100%",
    height: 216,
    alignSelf: "center",
  },
});
