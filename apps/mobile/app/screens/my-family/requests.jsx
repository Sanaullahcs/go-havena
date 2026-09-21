import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, ScrollView, Modal, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import ProfilePhotoAvatar from "../../../components/profile/profile-photo-avatar";
import { propertyStyles } from "../../../constants/property-styles";
import { Fonts } from "../../../constants/font";
import { sf, sw } from "../../../utils/responsive";
import {
  approveFamilyJoinRequest,
  approveFamilyAddMemberRequest,
  fetchPendingFamilyRequests,
  rejectFamilyJoinRequest,
  rejectFamilyAddMemberRequest,
} from "../../../services/family-api";
import { useApiAction } from "../../../hooks/use-api-action";
import { formatDisplayDateTime } from "../../../utils/form-datetime";

function requestKey(item) {
  return `${item?.type ?? "join"}-${item?.id}`;
}

function requestDisplayName(item, t) {
  if (!item) return t("family.requests.resident");
  if (item.type === "add_member") {
    return [item.first_name, item.last_name].filter(Boolean).join(" ") || t("family.familyMember");
  }
  return item.requester?.name ?? t("family.requests.resident");
}

function ActionButtons({ item, busyAction, disabled = false, onApprove, onReject, t }) {
  const isDisabled = disabled || Boolean(busyAction);
  const rejecting = busyAction === "reject";
  const approving = busyAction === "approve";

  return (
    <View style={styles.actions}>
      <Pressable
        style={[styles.rejectBtn, isDisabled && styles.btnDisabled]}
        disabled={isDisabled}
        onPress={() => onReject(item)}
      >
        {rejecting ? (
          <ActivityIndicator size="small" color="#DC2626" />
        ) : (
          <>
            <Feather name="x" size={sf(15)} color="#DC2626" />
            <Text style={styles.rejectText}>{t("family.requests.reject")}</Text>
          </>
        )}
      </Pressable>
      <Pressable
        style={[styles.approveBtn, isDisabled && styles.btnDisabled]}
        disabled={isDisabled}
        onPress={() => onApprove(item)}
      >
        {approving ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Feather name="check" size={sf(15)} color="#FFFFFF" />
            <Text style={styles.approveText}>{t("family.requests.approve")}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function PendingJoinRequestCard({ item, busyAction, disabled, onApprove, onReject, t }) {
  const requester = item.requester ?? {};
  const fromFamilyAdd = /family head invited/i.test(item.message ?? "");

  return (
    <View style={styles.card}>
      <View style={styles.typePill}>
        <Text style={styles.typePillText}>{fromFamilyAdd ? t("family.requests.addMember") : t("family.requests.joinRequest")}</Text>
      </View>
      <View style={styles.cardHeader}>
        <ProfilePhotoAvatar avatarUrl={requester.avatar_url} size={sw(48)} />
        <View style={styles.cardCopy}>
          <Text style={styles.name}>{requester.name ?? t("family.requests.resident")}</Text>
          {requester.unit_number ? (
            <Text style={styles.subtitle}>{t("family.requests.unit", { number: requester.unit_number })}</Text>
          ) : null}
          {item.family?.community_name ? (
            <Text style={styles.subtitle}>{item.family.community_name}</Text>
          ) : null}
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t("family.requests.pending")}</Text>
        </View>
      </View>

      <View style={styles.metaBlock}>
        <MetaLine icon="clock" label={t("family.requests.requested")} value={formatDisplayDateTime(item.created_at)} />
        {item.message ? <Text style={styles.message}>"{item.message}"</Text> : null}
        {fromFamilyAdd ? (
          <Text style={styles.helperText}>
            {t("family.requests.adminApprovedHelper")}
          </Text>
        ) : (
          <Text style={styles.helperText}>
            {t("family.requests.approveHelper")}
          </Text>
        )}
      </View>

      <ActionButtons
        item={item}
        busyAction={busyAction}
        disabled={disabled}
        onApprove={onApprove}
        onReject={onReject}
        t={t}
      />
    </View>
  );
}

function PendingAddMemberRequestCard({ item, busyAction, disabled, onApprove, onReject, t }) {
  const fullName = [item.first_name, item.last_name].filter(Boolean).join(" ") || t("family.familyMember");

  return (
    <View style={styles.card}>
      <View style={[styles.typePill, styles.typePillAdd]}>
        <Text style={[styles.typePillText, styles.typePillTextAdd]}>{t("family.requests.addMember")}</Text>
      </View>
      <View style={styles.cardHeader}>
        <View style={styles.initialsAvatar}>
          <Text style={styles.initialsText}>
            {(item.first_name?.[0] ?? "?").toUpperCase()}
            {(item.last_name?.[0] ?? "").toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.subtitle}>{t("family.requests.age", { age: item.age })}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t("family.requests.pending")}</Text>
        </View>
      </View>

      <View style={styles.metaBlock}>
        <MetaLine icon="mail" label={t("family.requests.emailLabel")} value={item.email} />
        <MetaLine icon="phone" label={t("family.requests.phoneLabel")} value={item.phone} />
        {item.unit_number ? <MetaLine icon="home" label={t("family.requests.unitLabel")} value={item.unit_number} /> : null}
        <MetaLine icon="clock" label={t("family.requests.requested")} value={formatDisplayDateTime(item.created_at)} />
        {item.requested_by?.name ? (
          <MetaLine icon="user" label={t("family.requests.submittedBy")} value={item.requested_by.name} />
        ) : null}
      </View>

      <ActionButtons
        item={item}
        busyAction={busyAction}
        disabled={disabled}
        onApprove={onApprove}
        onReject={onReject}
        t={t}
      />
    </View>
  );
}

function PendingRequestCard({ item, busyAction, disabled, onApprove, onReject, t }) {
  if (item.type === "add_member") {
    return (
      <PendingAddMemberRequestCard
        item={item}
        busyAction={busyAction}
        disabled={disabled}
        onApprove={onApprove}
        onReject={onReject}
        t={t}
      />
    );
  }

  return (
    <PendingJoinRequestCard
      item={item}
      busyAction={busyAction}
      disabled={disabled}
      onApprove={onApprove}
      onReject={onReject}
      t={t}
    />
  );
}

function MetaLine({ icon, label, value }) {
  return (
    <View style={styles.metaLine}>
      <Feather name={icon} size={sf(13)} color="#64748B" />
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export default function FamilyRequestsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { dialog, showFailure, showSuccess } = useApiAction();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const rejectSubmitting = actionBusy?.action === "reject" && Boolean(rejectTarget);

  const load = useCallback(async () => {
    try {
      const { items: pending } = await fetchPendingFamilyRequests();
      setItems(pending);
    } catch (err) {
      if (err?.status === 403) {
        router.replace("/screens/my-family");
        return;
      }
      await showFailure(t("family.requests.couldNotLoad"), err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleApprove = async (request) => {
    if (actionBusy) return;

    const isAddMember = request.type === "add_member";
    const fromFamilyAddConfirm = /family head invited/i.test(request.message ?? "");
    const name = requestDisplayName(request, t);
    const key = requestKey(request);

    const result = await dialog.showConfirm(
      t("family.requests.approveName", { name }),
      isAddMember
        ? t("family.requests.approveAddMessage")
        : fromFamilyAddConfirm
          ? t("family.requests.approveConfirmMessage")
          : t("family.requests.approveJoinMessage"),
      { confirmLabel: t("family.requests.approve") },
    );
    if (result !== "confirm") return;

    setActionBusy({ key, action: "approve" });
    try {
      if (isAddMember) {
        await approveFamilyAddMemberRequest(request.id);
        setActionBusy(null);
        await showSuccess(t("family.requests.requestApproved"), t("family.requests.joinedFamily", { name }));
      } else {
        const approved = await approveFamilyJoinRequest(request.id);
        setActionBusy(null);
        const awaitingAdmin = approved?.status === "awaiting_admin";
        await showSuccess(
          awaitingAdmin ? t("family.requests.sentToCommunityAdmin") : t("family.requests.requestApproved"),
          awaitingAdmin
            ? t("family.requests.approvedNeedsCommunity", { name })
            : t("family.requests.joinedFamily", { name }),
        );
      }
      load();
    } catch (err) {
      setActionBusy(null);
      await showFailure(t("family.requests.approvalFailed"), err);
    }
  };

  const closeRejectModal = () => {
    if (rejectSubmitting) return;
    setRejectTarget(null);
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!rejectTarget || actionBusy) return;

    const target = rejectTarget;
    const reason = rejectReason.trim() || undefined;
    const name = requestDisplayName(target, t);
    const key = requestKey(target);

    setActionBusy({ key, action: "reject" });
    try {
      if (target.type === "add_member") {
        await rejectFamilyAddMemberRequest(target.id, reason);
      } else {
        await rejectFamilyJoinRequest(target.id, reason);
      }
      setRejectTarget(null);
      setRejectReason("");
      setActionBusy(null);
      await showSuccess(t("family.requests.requestRejected"), t("family.requests.requestDeclined", { name }));
      load();
    } catch (err) {
      setActionBusy(null);
      setRejectTarget(null);
      await showFailure(t("family.requests.rejectionFailed"), err);
      setRejectTarget(target);
      setRejectReason(reason ?? "");
    }
  };

  const headerSubtitle =
    items.length === 0
      ? t("family.requests.noRequestsWaiting")
      : t("family.requests.requestsAwaiting", { count: items.length });

  if (loading) {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title={t("family.requests.title")} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0A2A43" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader title={t("family.requests.title")} subtitle={headerSubtitle} />

      <FlatList
        data={items}
        keyExtractor={(item) => `${item.type ?? "join"}-${item.id}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#0A2A43"
          />
        }
        ListEmptyComponent={
          <ScrollView contentContainerStyle={styles.emptyScroll}>
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Feather name="check-circle" size={sf(28)} color="#059669" />
              </View>
              <Text style={styles.emptyTitle}>{t("family.requests.noPendingRequests")}</Text>
              <Text style={styles.emptyText}>
                {t("family.requests.emptyHint")}
              </Text>
              <Pressable style={styles.emptyCta} onPress={() => router.push("/screens/my-family")}>
                <Feather name="users" size={sf(14)} color="#FFFFFF" />
                <Text style={styles.emptyCtaText}>{t("family.requests.backToMyFamily")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        }
        renderItem={({ item }) => {
          const key = requestKey(item);
          const itemBusy = actionBusy?.key === key ? actionBusy.action : null;
          const sheetOpenForItem = Boolean(rejectTarget) && requestKey(rejectTarget) === key;
          // Modal owns the reject spinner; card only spins for approve (or reject if no sheet).
          const cardBusyAction = sheetOpenForItem ? null : itemBusy;

          return (
            <PendingRequestCard
              item={item}
              busyAction={cardBusyAction}
              disabled={Boolean(actionBusy) || sheetOpenForItem}
              onApprove={handleApprove}
              onReject={(request) => {
                if (actionBusy) return;
                setRejectTarget(request);
                setRejectReason("");
              }}
              t={t}
            />
          );
        }}
      />

      <Modal
        visible={Boolean(rejectTarget)}
        transparent
        animationType="slide"
        onRequestClose={closeRejectModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeRejectModal}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalKeyboard}>
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>
                {rejectTarget?.type === "add_member" ? t("family.requests.rejectAddMember") : t("family.requests.rejectJoinRequest")}
              </Text>
              <Text style={styles.modalHint}>
                {t("family.requests.willBeDeclined", { name: requestDisplayName(rejectTarget, t) })}
              </Text>
              <LocaleTextInput
                value={rejectReason}
                onChangeText={setRejectReason}
                style={styles.rejectInput}
                placeholder={t("family.requests.optionalReason")}
                placeholderTextColor="#94A3B8"
                multiline
                textAlignVertical="top"
                maxLength={500}
                editable={!rejectSubmitting}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  disabled={rejectSubmitting}
                  onPress={closeRejectModal}
                >
                  <Text style={styles.modalCancelText}>{t("family.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalReject, rejectSubmitting && styles.btnDisabled]}
                  disabled={rejectSubmitting}
                  onPress={confirmReject}
                >
                  {rejectSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalRejectText}>{t("family.requests.confirmReject")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: {
    paddingHorizontal: sw(16),
    paddingTop: sw(8),
    paddingBottom: sw(32),
    gap: sw(14),
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(18),
    padding: sw(16),
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  typePill: {
    alignSelf: "flex-start",
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderRadius: sw(999),
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    marginBottom: sw(12),
  },
  typePillAdd: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  typePillText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    color: "#0A2A43",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  typePillTextAdd: {
    color: "#059669",
  },
  initialsAvatar: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(24),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#0A2A43",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    marginBottom: sw(14),
  },
  cardCopy: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#0F172A",
  },
  subtitle: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
  },
  badge: {
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: sw(999),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  badgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#B45309",
  },
  metaBlock: { marginBottom: sw(14), gap: sw(8) },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  metaLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#64748B",
  },
  metaValue: {
    flex: 1,
    textAlign: "right",
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#0F172A",
  },
  message: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#475569",
    fontStyle: "italic",
  },
  helperText: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: "#64748B",
    marginTop: sw(4),
  },
  actions: {
    flexDirection: "row",
    gap: sw(10),
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    paddingVertical: sw(13),
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  rejectText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#DC2626",
  },
  approveBtn: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    paddingVertical: sw(13),
    borderRadius: sw(12),
    backgroundColor: "#059669",
  },
  approveText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
  btnDisabled: { opacity: 0.6 },
  emptyScroll: { flexGrow: 1 },
  emptyWrap: {
    alignItems: "center",
    paddingTop: sw(48),
    paddingHorizontal: sw(20),
    gap: sw(10),
  },
  emptyIcon: {
    width: sw(64),
    height: sw(64),
    borderRadius: sw(18),
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: "#0F172A",
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: "#64748B",
    textAlign: "center",
    lineHeight: sf(21),
  },
  emptyCta: {
    marginTop: sw(12),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingHorizontal: sw(18),
    paddingVertical: sw(12),
    borderRadius: 999,
    backgroundColor: "#0A2A43",
  },
  emptyCtaText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalKeyboard: { width: "100%" },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: sw(20),
    borderTopRightRadius: sw(20),
    paddingHorizontal: sw(20),
    paddingTop: sw(20),
    paddingBottom: sw(32),
  },
  modalTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: "#0F172A",
    marginBottom: sw(8),
  },
  modalHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#64748B",
    marginBottom: sw(12),
  },
  rejectInput: {
    minHeight: sw(96),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: "#0F172A",
    backgroundColor: "#FAFBFC",
  },
  modalActions: {
    flexDirection: "row",
    gap: sw(10),
    marginTop: sw(18),
  },
  modalCancel: {
    flex: 1,
    alignItems: "center",
    paddingVertical: sw(13),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  modalCancelText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#475569",
  },
  modalReject: {
    flex: 1,
    alignItems: "center",
    paddingVertical: sw(13),
    borderRadius: sw(12),
    backgroundColor: "#DC2626",
  },
  modalRejectText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
});
