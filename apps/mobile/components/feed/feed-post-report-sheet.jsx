import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LocaleTextInput from "../ui/locale-text-input";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { getReportReasons, REPORT_REASON_KINDS } from "../../services/reports-api";
import { isPollPost } from "../../services/feed-api";
import { useKeyboardBottomOffset } from "../layout/keyboard-safe-screen";
import { sw, sf } from "../../utils/responsive";

const REPORT_DETAILS_MIN = 8;
const REPORT_DETAILS_MAX = 1000;

/** RN cannot present AppDialog over this sheet Modal — close the sheet first. */
export function waitForReportSheetUnmount() {
  return new Promise((resolve) => setTimeout(resolve, 300));
}

export async function completeReportAndNotify({
  request,
  close,
  setBusy,
  notifySuccess,
  notifyFailure,
}) {
  setBusy(true);
  try {
    const result = await request();
    close();
    setBusy(false);
    await waitForReportSheetUnmount();
    await notifySuccess?.(result);
    return result;
  } catch (error) {
    close();
    setBusy(false);
    await waitForReportSheetUnmount();
    await notifyFailure?.(error);
    return null;
  }
}

export default function FeedPostReportSheet({
  visible,
  post,
  submitting = false,
  onClose,
  onSubmit,
  title,
  subtitle,
  placeholder,
  reasonKind = REPORT_REASON_KINDS.post,
  resetKey,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { bottomOffset } = useKeyboardBottomOffset();
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [detailsTouched, setDetailsTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const isBusy = submitting || pending;
  const reasons = useMemo(() => getReportReasons(reasonKind), [reasonKind, t]);
  const detailsRequired = type === "other";

  const authorName = post?.user?.display_name ?? post?.user?.name ?? t("feed.report.thisNeighbor");
  const isPoll = isPollPost(post);
  const detailsPlaceholder = placeholder ?? t("feed.report.tellUsMoreRequired");

  const selectReason = (value) => {
    setType(value);
    setDetailsTouched(false);
    if (value !== "other") {
      setDescription("");
    }
  };

  useEffect(() => {
    if (!visible) {
      setPending(false);
      return;
    }
    setType("");
    setDescription("");
    setDetailsTouched(false);
    setPending(false);
  }, [visible, post?.id, resetKey, reasonKind]);

  const trimmedLen = description.trim().length;
  const detailsShowError =
    detailsRequired && detailsTouched && trimmedLen > 0 && trimmedLen < REPORT_DETAILS_MIN;
  const detailsShowHint = detailsRequired && detailsTouched && trimmedLen === 0;
  const detailsLooksGood = detailsRequired && trimmedLen >= REPORT_DETAILS_MIN;

  const handleClose = useCallback(() => {
    if (isBusy) return;
    onClose?.();
  }, [isBusy, onClose]);

  const canSubmit = useMemo(() => {
    if (!type) return false;
    if (detailsRequired) return trimmedLen >= REPORT_DETAILS_MIN;
    return true;
  }, [description, detailsRequired, trimmedLen, type]);

  const handleSubmit = async () => {
    if (detailsRequired && trimmedLen < REPORT_DETAILS_MIN) {
      setDetailsTouched(true);
    }
    if (!canSubmit || isBusy) return;
    setPending(true);
    try {
      await onSubmit?.({
        type,
        description: detailsRequired ? description.trim() : "",
        title: isPoll
          ? t("feed.report.reportedPollTitle", { name: authorName })
          : t("feed.report.reportedPostTitle", { name: authorName }),
        reportedUserId: post?.user_id ?? post?.user?.id ?? null,
      });
    } finally {
      setPending(false);
    }
  };

  if (!post) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={handleClose}
    >
      <View style={[styles.overlay, { paddingBottom: bottomOffset }]}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (isBusy) return;
            handleClose();
          }}
        />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: bottomOffset > 0 ? sw(12) : Math.max(insets.bottom, sw(16)),
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Feather name="flag" size={22} color="#DC2626" />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>
                {title ?? (isPoll ? t("feed.report.titlePoll") : t("feed.report.titlePost"))}
              </Text>
              <Text style={styles.subtitle}>
                {subtitle ?? (isPoll
                  ? t("feed.report.subtitlePoll", { name: authorName })
                  : t("feed.report.subtitlePost", { name: authorName }))}
              </Text>
            </View>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.formScroll}
            style={styles.form}
            nestedScrollEnabled
          >
            <Text style={styles.label}>{t("feed.report.reason")}</Text>
            <View style={styles.typeGrid}>
              {reasons.map((option, index) => {
                const active = type === option.value;
                const fullWidth = index === reasons.length - 1 && reasons.length % 2 === 1;
                return (
                  <View
                    key={option.value}
                    style={[styles.typeChipWrap, fullWidth && styles.typeChipWrapFull]}
                  >
                    <TouchableOpacity
                      style={[styles.typeChip, active && styles.typeChipActive]}
                      onPress={() => selectReason(option.value)}
                      disabled={isBusy}
                    >
                      <Text
                        style={[styles.typeChipText, active && styles.typeChipTextActive]}
                        numberOfLines={2}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {detailsRequired ? (
              <>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>{t("feed.report.details")}</Text>
                  <Text style={styles.requiredStar} accessibilityLabel="required">
                    {" *"}
                  </Text>
                </View>
                <LocaleTextInput
                  value={description}
                  onChangeText={(text) => {
                    setDescription(text);
                    setDetailsTouched(true);
                  }}
                  onBlur={() => setDetailsTouched(true)}
                  placeholder={detailsPlaceholder}
                  placeholderTextColor="#9CA3AF"
                  style={[
                    styles.input,
                    detailsShowError || detailsShowHint ? styles.inputError : null,
                    detailsLooksGood ? styles.inputValid : null,
                  ]}
                  multiline
                  maxLength={REPORT_DETAILS_MAX}
                  editable={!isBusy}
                  autoFocus
                  blurOnSubmit
                />
                {detailsShowError ? (
                  <Text style={styles.helperError}>
                    {t("feed.report.detailsTooShort", {
                      count: trimmedLen,
                      min: REPORT_DETAILS_MIN,
                      remaining: REPORT_DETAILS_MIN - trimmedLen,
                    })}
                  </Text>
                ) : detailsShowHint ? (
                  <Text style={styles.helperError}>{t("feed.report.detailsRequiredHint", { min: REPORT_DETAILS_MIN })}</Text>
                ) : detailsLooksGood ? (
                  <Text style={styles.helperOk}>
                    {t("feed.report.detailsValid", { count: trimmedLen, max: REPORT_DETAILS_MAX })}
                  </Text>
                ) : (
                  <Text style={styles.helper}>
                    {t("feed.report.detailsHint", {
                      min: REPORT_DETAILS_MIN,
                      count: trimmedLen,
                      max: REPORT_DETAILS_MAX,
                    })}
                  </Text>
                )}
              </>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleClose}
              disabled={isBusy}
            >
              <Text style={styles.cancelText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, (!canSubmit || isBusy) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit || isBusy}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="send" size={16} color="#FFFFFF" />
                  <Text style={styles.submitText}>{t("feed.report.submit")}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: sw(20),
    borderTopRightRadius: sw(20),
    paddingHorizontal: sw(16),
    paddingTop: sw(8),
    maxHeight: "88%",
    width: "100%",
    flexShrink: 1,
  },
  handle: {
    alignSelf: "center",
    width: sw(40),
    height: sw(4),
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    marginBottom: sw(12),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
    marginBottom: sw(16),
  },
  headerIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(14),
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    color: "#101828",
    fontWeight: "700",
    marginBottom: sw(4),
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#64748B",
  },
  form: {
    flexGrow: 0,
    flexShrink: 1,
  },
  formScroll: {
    paddingBottom: sw(8),
    flexGrow: 0,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: sw(4),
    marginBottom: sw(8),
  },
  label: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#475569",
    fontWeight: "600",
    marginBottom: 0,
    marginTop: 0,
  },
  requiredStar: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#DC2626",
    fontWeight: "700",
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -sw(4),
    marginBottom: sw(8),
  },
  typeChipWrap: {
    width: "50%",
    paddingHorizontal: sw(4),
    paddingVertical: sw(4),
  },
  typeChipWrapFull: {
    width: "100%",
  },
  typeChip: {
    minHeight: sw(48),
    paddingHorizontal: sw(10),
    paddingVertical: sw(10),
    borderRadius: sw(12),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  typeChipActive: {
    backgroundColor: "#D1FAF5",
    borderColor: Colors.brandPrimaryDeep,
  },
  typeChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#64748B",
    textAlign: "center",
  },
  typeChipTextActive: {
    color: Colors.brandPrimaryDeep,
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
  },
  input: {
    minHeight: sw(96),
    maxHeight: sw(140),
    borderRadius: sw(14),
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: "#101828",
    textAlignVertical: "top",
  },
  inputValue: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: "#101828",
  },
  inputPlaceholder: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: "#9CA3AF",
  },
  inputError: {
    borderColor: "#F87171",
    backgroundColor: "#FEF2F2",
  },
  inputValid: {
    borderColor: "#34D399",
    backgroundColor: "#FFFFFF",
  },
  helper: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
  },
  helperError: {
    marginTop: sw(6),
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#DC2626",
    fontWeight: "500",
  },
  helperOk: {
    marginTop: sw(6),
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#059669",
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    marginTop: sw(12),
    flexShrink: 0,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(14),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  cancelText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#64748B",
    fontWeight: "600",
  },
  submitBtn: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    minHeight: sw(50),
    paddingVertical: sw(14),
    borderRadius: sw(12),
    backgroundColor: Colors.brandPrimaryDeep,
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  submitText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
