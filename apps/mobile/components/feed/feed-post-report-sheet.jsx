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
import { REPORT_TYPES } from "../../services/reports-api";
import { useKeyboardBottomOffset } from "../layout/keyboard-safe-screen";
import { sw, sf } from "../../utils/responsive";

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
  detailsRequired = true,
  resetKey,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { bottomOffset } = useKeyboardBottomOffset();
  const [type, setType] = useState("spam");
  const [description, setDescription] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [pending, setPending] = useState(false);
  const isBusy = submitting || pending;

  const authorName = post?.user?.display_name ?? post?.user?.name ?? t("feed.report.thisNeighbor");
  const detailsPlaceholder = placeholder ?? t("feed.report.placeholder");

  useEffect(() => {
    if (!visible) {
      setEditingNotes(false);
      setPending(false);
      return;
    }
    setType("spam");
    setDescription("");
    setEditingNotes(false);
    setPending(false);
  }, [visible, post?.id, resetKey]);

  const handleClose = useCallback(() => {
    if (isBusy) return;
    setEditingNotes(false);
    onClose?.();
  }, [isBusy, onClose]);

  const canSubmit = useMemo(
    () => (detailsRequired ? description.trim().length >= 8 : Boolean(type)),
    [description, detailsRequired, type],
  );

  const handleSubmit = async () => {
    if (!canSubmit || isBusy) return;
    setEditingNotes(false);
    setPending(true);
    try {
      await onSubmit?.({
        type,
        description: description.trim(),
        title: t("feed.report.reportedPostTitle", { name: authorName }),
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
            if (editingNotes) {
              setEditingNotes(false);
              return;
            }
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
              <Text style={styles.title}>{title ?? t("feed.report.title")}</Text>
              <Text style={styles.subtitle}>
                {subtitle ?? t("feed.report.subtitle", { name: authorName })}
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
              {REPORT_TYPES.map((option) => {
                const active = type === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => setType(option.value)}
                    disabled={isBusy}
                  >
                    <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>{t("feed.report.details")}</Text>
            {editingNotes ? (
              <LocaleTextInput
                value={description}
                onChangeText={setDescription}
                placeholder={detailsPlaceholder}
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                multiline
                maxLength={1000}
                editable={!isBusy}
                autoFocus
                blurOnSubmit
              />
            ) : (
              <Pressable
                style={styles.input}
                onPress={() => {
                  if (!isBusy) setEditingNotes(true);
                }}
                disabled={isBusy}
              >
                <Text
                  style={description.trim() ? styles.inputValue : styles.inputPlaceholder}
                >
                  {description.trim() || detailsPlaceholder}
                </Text>
              </Pressable>
            )}
            <Text style={styles.helper}>
              {detailsRequired
                ? t("feed.report.helper", { count: description.trim().length })
                : t("feed.report.helperOptional", { count: description.trim().length })}
            </Text>
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
  label: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#475569",
    fontWeight: "600",
    marginBottom: sw(8),
    marginTop: sw(4),
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
    marginBottom: sw(14),
  },
  typeChip: {
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  typeChipActive: {
    backgroundColor: "#D1FAF5",
    borderColor: Colors.brandPrimaryDeep,
  },
  typeChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#64748B",
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
    borderWidth: 1,
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
  helper: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
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
