import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { REPORT_TYPES } from "../../services/reports-api";
import { sw, sf } from "../../utils/responsive";

export default function FeedPostReportSheet({
  visible,
  post,
  submitting = false,
  onClose,
  onSubmit,
}) {
  const { t } = useTranslation();
  const [type, setType] = useState("spam");
  const [description, setDescription] = useState("");

  const authorName = post?.user?.display_name ?? post?.user?.name ?? t("feed.report.thisNeighbor");

  useEffect(() => {
    if (!visible) return;
    setType("spam");
    setDescription("");
  }, [visible, post?.id]);

  const canSubmit = useMemo(() => description.trim().length >= 8, [description]);

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    onSubmit?.({
      type,
      description: description.trim(),
      title: t("feed.report.reportedPostTitle", { name: authorName }),
      reportedUserId: post?.user_id ?? post?.user?.id ?? null,
    });
  };

  if (!post) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={submitting ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Feather name="flag" size={22} color="#DC2626" />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t("feed.report.title")}</Text>
              <Text style={styles.subtitle}>
                {t("feed.report.subtitle", { name: authorName })}
              </Text>
            </View>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.formScroll}
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
                    disabled={submitting}
                  >
                    <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>{t("feed.report.details")}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t("feed.report.placeholder")}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              multiline
              maxLength={1000}
              editable={!submitting}
            />
            <Text style={styles.helper}>
              {t("feed.report.helper", { count: description.trim().length })}
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.cancelText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
            >
              {submitting ? (
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
    paddingBottom: sw(24),
    paddingTop: sw(8),
    maxHeight: "88%",
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
  formScroll: {
    paddingBottom: sw(8),
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
