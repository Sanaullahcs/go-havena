import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { propertyStyles } from "../../../constants/property-styles";
import { Fonts } from "../../../constants/font";
import { sf, sw } from "../../../utils/responsive";
import {
  approveGuestInvitation,
  fetchPendingGuestApprovals,
  rejectGuestInvitation,
} from "../../../services/guests-api";
import { useApiAction } from "../../../hooks/use-api-action";
import { formatDisplayTime, formatAccessDay, formatDisplayDateTime } from "../../../utils/form-datetime";
import { GUEST_PERMISSION_OPTIONS, normalizeGuestPermissions } from "../../../constants/guest-permissions";

function formatDurationLabel(start, end) {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return null;
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.round(totalMinutes / 60);
  if (hours < 48) return `${hours} hr${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function formatSubmittedAt(iso) {
  return formatDisplayDateTime(iso);
}

function initials(name) {
  const parts = String(name ?? "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function invitationTypeLabel(type) {
  return type === "admin" ? "Community admin invite" : "Resident invite";
}

function DetailRow({ icon, label, value, mono = false, last = false }) {
  const display = value && value !== "—" ? value : "Not provided";
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <View style={styles.detailLabelWrap}>
        <Feather name={icon} size={sf(13)} color="#64748B" />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text
        style={[
          styles.detailValue,
          mono && display !== "Not provided" && styles.detailMono,
          display === "Not provided" && styles.detailMuted,
        ]}
        selectable={mono && display !== "Not provided"}
      >
        {display}
      </Text>
    </View>
  );
}

function AccessWindowCard({ startsAt, endsAt }) {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  const valid =
    start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
  const duration = valid ? formatDurationLabel(start, end) : null;

  if (!valid) {
    return (
      <View style={styles.accessCard}>
        <Text style={styles.accessCardTitle}>Access window</Text>
        <Text style={styles.accessMissing}>Access window not set</Text>
      </View>
    );
  }

  return (
    <View style={styles.accessCard}>
      <View
        style={styles.accessCardHeader}
      >
        <View style={styles.accessCardHeaderIcon}>
          <Feather name="calendar" size={sf(14)} color="#0A2A43" />
        </View>
        <View style={styles.accessCardHeaderCopy}>
          <Text style={styles.accessCardTitle}>Access window</Text>
          <Text style={styles.accessCardSub}>Guest can sign in during this period</Text>
        </View>
        {duration ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationBadgeText}>{duration}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.accessTimeline}>
        <View style={styles.accessPoint}>
          <View style={[styles.accessDot, styles.accessDotStart]} />
          <Text style={styles.accessPointLabel}>Starts</Text>
          <Text style={styles.accessPointDate}>{formatAccessDay(start)}</Text>
          <View style={styles.accessTimeRow}>
            <Feather name="clock" size={sf(11)} color="#64748B" />
            <Text style={styles.accessPointTime}>{formatDisplayTime(start)}</Text>
          </View>
        </View>

        <View style={styles.accessBridge}>
          <View style={styles.accessBridgeLine} />
          <View style={styles.accessBridgeIcon}>
            <Feather name="arrow-right" size={sf(12)} color="#0A2A43" />
          </View>
          <View style={styles.accessBridgeLine} />
        </View>

        <View style={styles.accessPoint}>
          <View style={[styles.accessDot, styles.accessDotEnd]} />
          <Text style={styles.accessPointLabel}>Ends</Text>
          <Text style={styles.accessPointDate}>{formatAccessDay(end)}</Text>
          <View style={styles.accessTimeRow}>
            <Feather name="clock" size={sf(11)} color="#64748B" />
            <Text style={styles.accessPointTime}>{formatDisplayTime(end)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function formatPermissionSummary(permissions) {
  const normalized = normalizeGuestPermissions(permissions);
  const enabled = GUEST_PERMISSION_OPTIONS.filter((option) => normalized[option.key]);
  if (enabled.length === GUEST_PERMISSION_OPTIONS.length) return "All features enabled";
  if (enabled.length === 0) return "No features enabled";
  return enabled.map((option) => option.label).join(", ");
}

function PendingGuestCard({ item, busy, onApprove, onReject }) {
  const communityName = item.community_name || item.community?.name || null;
  const verifiedLabel = item.guest_user_id ? "Phone & invite code verified" : "Awaiting verification";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(item.guest_name)}</Text>
        </View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.name}>{item.guest_name}</Text>
          <Text style={styles.cardSubtitle}>{verifiedLabel}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>Pending</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Guest details</Text>
        <DetailRow icon="phone" label="Phone" value={item.guest_phone} />
        <DetailRow icon="mail" label="Email" value={item.guest_email} />
        <DetailRow icon="home" label="Community" value={communityName} />
        <DetailRow
          icon="tag"
          label="Invite type"
          value={invitationTypeLabel(item.invitation_type)}
        />
        <DetailRow icon="shield" label="Access" value={formatPermissionSummary(item.permissions)} last />
      </View>

      <AccessWindowCard startsAt={item.starts_at} endsAt={item.ends_at} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invitation info</Text>
        <DetailRow icon="hash" label="Invite code" value={item.invite_code} mono />
        <DetailRow icon="clock" label="Requested on" value={formatSubmittedAt(item.created_at)} />
        <DetailRow
          icon="check-circle"
          label="Status"
          value="Pending your approval"
          last
        />
      </View>

      <View style={styles.noteCard}>
        <Feather name="info" size={sf(14)} color="#14B8A6" />
        <Text style={styles.noteText}>
          This guest completed verification. Approve to grant community access, or reject to decline
          their request.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.rejectBtn, busy && styles.btnDisabled]}
          disabled={busy}
          onPress={() => onReject(item)}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <>
              <Feather name="x" size={sf(15)} color="#DC2626" />
              <Text style={styles.rejectText}>Reject</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[styles.approveBtn, busy && styles.btnDisabled]}
          disabled={busy}
          onPress={() => onApprove(item)}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather name="check" size={sf(15)} color="#FFFFFF" />
              <Text style={styles.approveText}>Approve access</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function GuestApprovalsScreen() {
  const router = useRouter();
  const { dialog, showFailure, showSuccess } = useApiAction();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    try {
      const pending = await fetchPendingGuestApprovals();
      setItems(pending);
    } catch (err) {
      await showFailure("Could not load guest approvals", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleApprove = async (guest) => {
    const result = await dialog.showConfirm(
      `Approve ${guest.guest_name}?`,
      "They will get guest access to the community immediately.",
      { confirmLabel: "Approve" },
    );
    if (result !== "confirm") return;

    setActionId(guest.id);
    try {
      await approveGuestInvitation(guest.id);
      await showSuccess("Guest approved", `${guest.guest_name} can now access the community.`);
      load();
    } catch (err) {
      await showFailure("Approval failed", err);
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (guest) => {
    setRejectTarget(guest);
    setRejectReason("");
  };

  const closeReject = () => {
    if (actionId) return;
    setRejectTarget(null);
    setRejectReason("");
  };

  const confirmReject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      await dialog.showError(
        "Reason required",
        "Tell the guest why their access request was rejected.",
      );
      return;
    }
    if (!rejectTarget) return;

    setActionId(rejectTarget.id);
    try {
      await rejectGuestInvitation(rejectTarget.id, reason);
      await showSuccess("Guest rejected", `${rejectTarget.guest_name}'s access request was declined.`);
      setRejectTarget(null);
      setRejectReason("");
      load();
    } catch (err) {
      await showFailure("Rejection failed", err);
    } finally {
      setActionId(null);
    }
  };

  const headerSubtitle =
    items.length === 0
      ? "No guests waiting"
      : `${items.length} guest${items.length === 1 ? "" : "s"} awaiting approval`;

  if (loading) {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title="Guest approvals" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0A2A43" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader title="Guest approvals" subtitle={headerSubtitle} />

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
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
              <Text style={styles.emptyTitle}>No pending approvals</Text>
              <Text style={styles.emptyText}>
                When a guest you invited verifies their phone and invite code, they will appear here
                for your decision.
              </Text>
              <Pressable style={styles.emptyCta} onPress={() => router.push("/screens/invite-guest")}>
                <Feather name="user-plus" size={sf(14)} color="#FFFFFF" />
                <Text style={styles.emptyCtaText}>Invite a guest</Text>
              </Pressable>
            </View>
          </ScrollView>
        }
        renderItem={({ item }) => (
          <PendingGuestCard
            item={item}
            busy={actionId === item.id}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}
      />

      <Modal visible={Boolean(rejectTarget)} transparent animationType="slide" onRequestClose={closeReject}>
        <Pressable style={styles.modalOverlay} onPress={closeReject}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboard}
          >
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Reject guest access</Text>
              <Text style={styles.rejectHint}>
                {rejectTarget?.guest_name || "This guest"} will see your reason in the app.
              </Text>
              <Text style={styles.rejectLabel}>Reason for rejection *</Text>
              <TextInput
                value={rejectReason}
                onChangeText={setRejectReason}
                style={styles.rejectInput}
                placeholder="Explain why access is being declined"
                placeholderTextColor="#94A3B8"
                multiline
                textAlignVertical="top"
                maxLength={500}
                editable={!actionId}
              />
              <Text style={styles.rejectCount}>{rejectReason.trim().length}/500</Text>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, actionId && styles.btnDisabled]}
                  disabled={Boolean(actionId)}
                  onPress={closeReject}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalRejectBtn, actionId && styles.btnDisabled]}
                  disabled={Boolean(actionId)}
                  onPress={confirmReject}
                >
                  {actionId ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalRejectText}>Confirm reject</Text>
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
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    marginBottom: sw(16),
  },
  avatar: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(14),
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#0A2A43",
  },
  cardHeaderCopy: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#0F172A",
  },
  cardSubtitle: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
  },
  statusBadge: {
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: sw(999),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  statusBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#B45309",
  },
  section: {
    marginBottom: sw(14),
    paddingBottom: sw(14),
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  sectionTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: sw(10),
  },
  detailRow: {
    marginBottom: sw(10),
    gap: sw(4),
  },
  detailRowLast: {
    marginBottom: 0,
  },
  detailLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
  },
  detailLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  detailValue: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: "#0F172A",
    lineHeight: sf(20),
    paddingLeft: sw(19),
  },
  detailMono: {
    fontFamily: Fonts.bold,
    letterSpacing: 1,
    color: "#0A2A43",
  },
  detailMuted: {
    color: "#94A3B8",
    fontStyle: "italic",
  },
  accessCard: {
    marginBottom: sw(14),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.15)",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  accessCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    borderBottomWidth: 1,
    borderBottomColor: "#E0E7FF",
  },
  accessCardHeaderIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  accessCardHeaderCopy: { flex: 1 },
  accessCardTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#1E3A8A",
  },
  accessCardSub: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#64748B",
  },
  durationBadge: {
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
    borderRadius: sw(999),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  durationBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    color: "#0A2A43",
  },
  accessMissing: {
    padding: sw(14),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#64748B",
  },
  accessTimeline: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: sw(12),
    paddingVertical: sw(14),
    gap: sw(8),
  },
  accessPoint: {
    flex: 1,
    alignItems: "center",
  },
  accessDot: {
    width: sw(10),
    height: sw(10),
    borderRadius: sw(5),
    marginBottom: sw(8),
  },
  accessDotStart: { backgroundColor: "#22C55E" },
  accessDotEnd: { backgroundColor: "#F97316" },
  accessPointLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: sw(4),
  },
  accessPointDate: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#0F172A",
    textAlign: "center",
    marginBottom: sw(4),
  },
  accessTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
  },
  accessPointTime: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#475569",
  },
  accessBridge: {
    flexDirection: "row",
    alignItems: "center",
    width: sw(40),
    paddingTop: sw(30),
  },
  accessBridgeLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#CBD5E1",
  },
  accessBridgeIcon: {
    width: sw(24),
    height: sw(24),
    borderRadius: sw(12),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: sw(2),
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    padding: sw(12),
    borderRadius: sw(12),
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    marginBottom: sw(14),
  },
  noteText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: "#1E40AF",
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
  rejectHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#64748B",
    marginBottom: sw(12),
  },
  rejectLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#475569",
    marginBottom: sw(6),
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
  rejectCount: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
    textAlign: "right",
  },
  modalActions: {
    flexDirection: "row",
    gap: sw(10),
    marginTop: sw(18),
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(13),
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  modalCancelText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#475569",
  },
  modalRejectBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
