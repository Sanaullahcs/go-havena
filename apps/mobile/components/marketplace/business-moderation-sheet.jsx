import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { MarketplaceType } from "../../constants/marketplace-type";

function ImpactRow({ icon, tone, title, detail }) {
  const tones = {
    success: { bg: "#ECFDF5", color: "#059669" },
    warning: { bg: "#FFFBEB", color: "#D97706" },
    danger: { bg: "#FEF2F2", color: "#DC2626" },
    info: { bg: "#D1FAF5", color: "#1B4F8A" },
  };
  const palette = tones[tone] ?? tones.info;

  return (
    <View style={styles.impactRow}>
      <View style={[styles.impactIcon, { backgroundColor: palette.bg }]}>
        <Ionicons name={icon} size={18} color={palette.color} />
      </View>
      <View style={styles.impactCopy}>
        <Text style={styles.impactTitle}>{title}</Text>
        {detail ? <Text style={styles.impactDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export default function BusinessModerationSheet({
  visible,
  mode,
  business,
  dealStats,
  loading = false,
  onClose,
  onConfirm,
}) {
  const { t } = useTranslation();
  if (!business) return null;

  const isReject = mode === "reject";
  const isReapprove = mode === "approve" && business.status === "rejected";
  const isApprove = mode === "approve" && !isReapprove;
  const activeDeals = dealStats?.active ?? 0;
  const inactiveDeals = dealStats?.inactive ?? 0;
  const totalDeals = dealStats?.total ?? 0;

  const title = isReject
    ? t("moderation.rejectBusiness")
    : isReapprove
      ? t("moderation.reapproveBusiness")
      : t("moderation.approveBusiness");

  const subtitle = isReject
    ? t("moderation.rejectSubtitle")
    : isReapprove
      ? t("moderation.reapproveSubtitle")
      : t("moderation.approveSubtitle");

  const confirmLabel = isReject ? t("moderation.rejectBusiness") : isReapprove ? t("moderation.reapproveBtn") : t("moderation.approveBusiness");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={loading ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View
              style={[
                styles.headerIcon,
                isReject ? styles.headerIconReject : styles.headerIconApprove,
              ]}
            >
              <Ionicons
                name={isReject ? "ban-outline" : "checkmark-circle-outline"}
                size={26}
                color={isReject ? "#DC2626" : "#059669"}
              />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
          </View>

          <View style={styles.businessCard}>
            <View style={styles.businessIcon}>
              <Ionicons name="storefront-outline" size={22} color="#1B4F8A" />
            </View>
            <View style={styles.businessCopy}>
              <Text style={styles.businessName}>{business.name}</Text>
              <Text style={styles.businessMeta}>
                {[business.category, business.ownerName].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{business.statusLabel ?? business.status}</Text>
            </View>
          </View>

          <View style={styles.impactBox}>
            <Text style={styles.impactHeading}>{t("moderation.whatHappensNext")}</Text>

            {isReject ? (
              <>
                <ImpactRow
                  icon="eye-off-outline"
                  tone="danger"
                  title={t("moderation.hiddenFromMarketplace")}
                  detail={t("moderation.hiddenDetail")}
                />
                <ImpactRow
                  icon="pause-circle-outline"
                  tone="warning"
                  title={
                    activeDeals > 0
                      ? t("moderation.activeDealsDisabled", { count: activeDeals })
                      : t("moderation.noActiveDealsToDisable")
                  }
                  detail={t("moderation.dealsStaySaved")}
                />
                <ImpactRow
                  icon="add-circle-outline"
                  tone="info"
                  title={t("moderation.newDealsBlocked")}
                  detail={t("moderation.newDealsBlockedDetail")}
                />
              </>
            ) : isReapprove ? (
              <>
                <ImpactRow
                  icon="eye-outline"
                  tone="success"
                  title={t("moderation.visibleAgain")}
                  detail={t("moderation.visibleAgainDetail")}
                />
                <ImpactRow
                  icon="play-circle-outline"
                  tone="success"
                  title={
                    inactiveDeals > 0
                      ? t("moderation.disabledDealsGoLive", { count: inactiveDeals })
                      : totalDeals > 0
                        ? t("moderation.existingDealsRemain")
                        : t("moderation.noDealsToRestore")
                  }
                  detail={t("moderation.onlyNonExpiredReenabled")}
                />
                <ImpactRow
                  icon="pricetag-outline"
                  tone="info"
                  title={t("moderation.ownerCanCreateDeals")}
                  detail={t("moderation.dealPublishingUnlocked")}
                />
              </>
            ) : (
              <>
                <ImpactRow
                  icon="checkmark-done-outline"
                  tone="success"
                  title={t("moderation.approvedForMarketplace")}
                  detail={t("moderation.approvedDetail")}
                />
                <ImpactRow
                  icon="pricetag-outline"
                  tone="info"
                  title={t("moderation.ownerCanPublishDeals")}
                  detail={t("moderation.ownerCanPublishDetail")}
                />
              </>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              activeOpacity={0.85}
              disabled={loading}
              onPress={onClose}
            >
              <Text style={styles.cancelBtnText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, isReject && styles.confirmBtnReject]}
              activeOpacity={0.85}
              disabled={loading}
              onPress={onConfirm}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmBtnText}>{confirmLabel}</Text>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconApprove: {
    backgroundColor: "#ECFDF5",
  },
  headerIconReject: {
    backgroundColor: "#FEF2F2",
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "#111827",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#6B7280",
  },
  businessCard: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F9FAFB",
  },
  businessIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  businessCopy: {
    flex: 1,
  },
  businessName: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#111827",
    fontWeight: "700",
  },
  businessMeta: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    color: "#6B7280",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statusPillText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#374151",
    fontWeight: "600",
  },
  impactBox: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 12,
    backgroundColor: "#FFFFFF",
  },
  impactHeading: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    color: "#374151",
    fontWeight: "700",
    marginBottom: 2,
  },
  impactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  impactIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  impactCopy: {
    flex: 1,
  },
  impactTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#111827",
    fontWeight: "600",
  },
  impactDetail: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: "#6B7280",
  },
  actions: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  cancelBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: MarketplaceType.body,
    color: "#374151",
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 1.2,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#059669",
  },
  confirmBtnReject: {
    backgroundColor: "#DC2626",
  },
  confirmBtnText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
