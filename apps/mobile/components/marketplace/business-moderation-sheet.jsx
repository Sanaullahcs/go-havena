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
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { MarketplaceType } from "../../constants/marketplace-type";

function ImpactRow({ icon, tone, title, detail }) {
  const tones = {
    success: { bg: "#ECFDF5", color: "#059669" },
    warning: { bg: "#FFFBEB", color: "#D97706" },
    danger: { bg: "#FEF2F2", color: "#DC2626" },
    info: { bg: "#D1FAF5", color: "#0A2A43" },
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
  if (!business) return null;

  const isReject = mode === "reject";
  const isReapprove = mode === "approve" && business.status === "rejected";
  const isApprove = mode === "approve" && !isReapprove;
  const activeDeals = dealStats?.active ?? 0;
  const inactiveDeals = dealStats?.inactive ?? 0;
  const totalDeals = dealStats?.total ?? 0;

  const title = isReject
    ? "Reject business"
    : isReapprove
      ? "Re-approve business"
      : "Approve business";

  const subtitle = isReject
    ? "This hides the business from residents. Deals are disabled, not deleted."
    : isReapprove
      ? "Restore marketplace access and re-enable eligible deals."
      : "Make this business visible in the community marketplace.";

  const confirmLabel = isReject ? "Reject business" : isReapprove ? "Re-approve" : "Approve business";

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
              <Ionicons name="storefront-outline" size={22} color="#0A2A43" />
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
            <Text style={styles.impactHeading}>What happens next</Text>

            {isReject ? (
              <>
                <ImpactRow
                  icon="eye-off-outline"
                  tone="danger"
                  title="Hidden from marketplace"
                  detail="Residents will no longer see this business in browse lists."
                />
                <ImpactRow
                  icon="pause-circle-outline"
                  tone="warning"
                  title={
                    activeDeals > 0
                      ? `${activeDeals} active deal${activeDeals === 1 ? "" : "s"} will be disabled`
                      : "No active deals to disable"
                  }
                  detail="Deals stay saved and can be restored if you re-approve later."
                />
                <ImpactRow
                  icon="add-circle-outline"
                  tone="info"
                  title="New deals blocked"
                  detail="The owner cannot publish new deals while rejected."
                />
              </>
            ) : isReapprove ? (
              <>
                <ImpactRow
                  icon="eye-outline"
                  tone="success"
                  title="Visible in marketplace again"
                  detail="Residents can discover this business and its profile."
                />
                <ImpactRow
                  icon="play-circle-outline"
                  tone="success"
                  title={
                    inactiveDeals > 0
                      ? `${inactiveDeals} disabled deal${inactiveDeals === 1 ? "" : "s"} will go live`
                      : totalDeals > 0
                        ? "Existing deals remain as-is"
                        : "No deals to restore yet"
                  }
                  detail="Only non-expired deals that were disabled are re-enabled."
                />
                <ImpactRow
                  icon="pricetag-outline"
                  tone="info"
                  title="Owner can create deals again"
                  detail="Deal publishing is unlocked for this business."
                />
              </>
            ) : (
              <>
                <ImpactRow
                  icon="checkmark-done-outline"
                  tone="success"
                  title="Approved for marketplace"
                  detail="This business will appear in local business listings."
                />
                <ImpactRow
                  icon="pricetag-outline"
                  tone="info"
                  title="Owner can publish deals"
                  detail="The business owner may create offers once approved."
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
              <Text style={styles.cancelBtnText}>Cancel</Text>
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
