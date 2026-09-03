import React, { useCallback, useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, ActivityIndicator, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../../../components/layout/screen-header";
import { Fonts } from "../../../constants/font";
import { Colors } from "../../../constants/tokens";
import { sf, sw } from "../../../utils/responsive";
import { approveMember, fetchAdminMembers, inviteMember, rejectMember } from "../../../services/admin-api";
import { hasFieldErrors, validateInviteMemberForm } from "../../../utils/form-validation";
import { useTouchedFieldErrors } from "../../../hooks/use-touched-field-errors";
import { useApiAction } from "../../../hooks/use-api-action";
import { FormPhoneInput } from "../../../components/ui/phone-input";
import { DEFAULT_PHONE_COUNTRY } from "../../../constants/phone-countries";
import { toE164 } from "../../../utils/phone";

const FILTERS = [
  { key: "pending", labelKey: "admin.pending" },
  { key: "approved", labelKey: "admin.approved" },
  { key: "rejected", labelKey: "admin.rejected" },
  { key: "all", labelKey: "admin.all" },
];

const STATUS_META = {
  pending: { label: "admin.pending", bg: "#FFFBEB", text: "#D97706" },
  approved: { label: "admin.approved", bg: "#ECFDF5", text: "#059669" },
  rejected: { label: "admin.rejected", bg: "#FEF2F2", text: "#DC2626" },
  banned: { label: "admin.suspended", bg: "#F1F5F9", text: "#64748B" },
  onboarding: { label: "admin.onboarding", bg: "#D1FAF5", text: "#14B8A6" },
};

function memberStatusMeta(status) {
  if (!status) return STATUS_META.onboarding;
  return STATUS_META[status] ?? { label: status, bg: "#F3F4F6", text: "#64748B" };
}

function emptyMessageForFilter(filter, t) {
  if (filter === "pending") return t("admin.noPendingRequests");
  if (filter === "approved") return t("admin.noApprovedResidents");
  if (filter === "rejected") return t("admin.noRejectedResidents");
  return t("admin.noMembersFound");
}

function MemberRow({ item, approving, rejecting, onApprove, onReject, t }) {
  const name = item.display_name || item.name || t("admin.resident");
  const contact = item.phone || item.email || "—";
  const pending = item.status === "pending";
  const busy = approving === item.id || rejecting === item.id;
  const status = memberStatusMeta(item.status);

  return (
    <View style={styles.memberCard}>
      <View style={styles.memberTopRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.memberBody}>
          <Text style={styles.memberName}>{name}</Text>
          <Text style={styles.memberMeta} numberOfLines={1}>{contact}</Text>
          {item.unit_number ? <Text style={styles.memberMeta}>{t("admin.unitLabel", { unit: item.unit_number })}</Text> : null}
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusPillText, { color: status.text }]}>{t(status.label)}</Text>
          </View>
        </View>
        {pending ? (
          <View style={styles.iconActions}>
            <TouchableOpacity
              style={[styles.iconBtn, styles.iconBtnReject, busy && styles.actionBtnDisabled]}
              disabled={busy}
              onPress={() => onReject(item)}
              accessibilityLabel={t("admin.rejectResident")}
            >
              {rejecting === item.id ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <Ionicons name="close" size={sf(18)} color="#DC2626" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, styles.iconBtnApprove, busy && styles.actionBtnDisabled]}
              disabled={busy}
              onPress={() => onApprove(item.id)}
              accessibilityLabel={t("admin.approveResident")}
            >
              {approving === item.id ? (
                <ActivityIndicator size="small" color="#059669" />
              ) : (
                <Ionicons name="checkmark" size={sf(20)} color="#059669" />
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function AdminMembersScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", unit: "" });
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const { runAction, showFailure } = useApiAction();

  useEffect(() => {
    if (params.invite === "1") setInviteOpen(true);
  }, [params.invite]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminMembers({
        status: filter,
        search,
        per_page: 50,
      });
      setMembers(res.data);
    } catch (err) {
      await showFailure(t("admin.couldNotLoadMembers"), err);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleApprove = async (userId) => {
    setApproving(userId);
    try {
      await runAction({
        action: () => approveMember(userId),
        successTitle: t("admin.approved"),
        successMessage: t("admin.residentCanAccess"),
        errorTitle: t("admin.approvalFailed"),
        onSuccess: () => load(),
      });
    } finally {
      setApproving(null);
    }
  };

  const openReject = (member) => {
    setRejectTarget(member);
    setRejectReason("");
  };

  const closeReject = () => {
    setRejectTarget(null);
    setRejectReason("");
  };

  const handleReject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      await showFailure(t("admin.reasonRequired"), { message: t("admin.tellResidentWhy") });
      return;
    }
    if (!rejectTarget) return;

    setRejecting(rejectTarget.id);
    try {
      await runAction({
        action: () => rejectMember(rejectTarget.id, reason),
        successTitle: t("admin.rejected"),
        successMessage: t("admin.residentWillSeeReason"),
        errorTitle: t("admin.rejectionFailed"),
        onSuccess: () => {
          closeReject();
          load();
        },
      });
    } finally {
      setRejecting(null);
    }
  };

  const inviteLiveErrors = useMemo(
    () =>
      validateInviteMemberForm({
        name: inviteForm.name,
        email: inviteForm.email,
        unit: inviteForm.unit,
        phoneDigits,
        phoneCountry,
      }),
    [inviteForm, phoneDigits, phoneCountry],
  );

  const canInvite = useMemo(() => !hasFieldErrors(inviteLiveErrors), [inviteLiveErrors]);

  const handleInvite = async () => {
    if (!validateOnSubmit(inviteLiveErrors)) return;
    setInviting(true);
    try {
      const res = await runAction({
        action: () => inviteMember({
          name: inviteForm.name.trim(),
          email: inviteForm.email.trim(),
          phone: toE164(phoneDigits, phoneCountry),
          unit_number: inviteForm.unit.trim() || undefined,
        }),
        successTitle: t("admin.inviteSent"),
        successMessage: t("admin.inviteCreated"),
        errorTitle: t("admin.inviteFailed"),
        silentSuccess: true,
      });
      setInviteResult(res.data ?? res);
      setInviteForm({ name: "", email: "", unit: "" });
      setPhoneDigits("");
      setPhoneCountry(DEFAULT_PHONE_COUNTRY);
      resetTouched();
      load();
    } catch {
      // runAction already showed the error dialog
    } finally {
      setInviting(false);
    }
  };

  const closeInvite = () => {
    setInviteOpen(false);
    setInviteResult(null);
    setPhoneDigits("");
    setPhoneCountry(DEFAULT_PHONE_COUNTRY);
    resetTouched();
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        title={t("admin.residents")}
        iconOnly
        right={
          <TouchableOpacity style={styles.inviteHeaderBtn} onPress={() => setInviteOpen(true)}>
            <Ionicons name="person-add" size={sf(20)} color={Colors.brandPrimaryDeep} />
          </TouchableOpacity>
        }
      />

      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={sf(17)} color="#99A1AF" />
          <LocaleTextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("admin.searchPlaceholderMembers")}
            placeholderTextColor="#99A1AF"
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={load}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
          keyboardShouldPersistTaps="handled"
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                activeOpacity={0.7}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text
                  style={[styles.filterChipText, active && styles.filterChipTextActive]}
                  numberOfLines={1}
                  includeFontPadding={false}
                >
                  {t(f.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brandPrimaryDeep} />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => String(item.id)}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{emptyMessageForFilter(filter, t)}</Text>
          }
          renderItem={({ item }) => (
            <MemberRow
              item={item}
              approving={approving}
              rejecting={rejecting}
              onApprove={handleApprove}
              onReject={openReject}
              t={t}
            />
          )}
        />
      )}

      <Modal visible={inviteOpen} transparent animationType="slide" onRequestClose={closeInvite}>
        <Pressable style={styles.modalOverlay} onPress={closeInvite}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboard}
          >
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>
                {inviteResult ? t("admin.inviteSent") : t("admin.inviteResident")}
              </Text>

              {inviteResult ? (
                <View>
                  <Text style={styles.resultLine}>
                    {t("admin.shareInviteCode")}
                  </Text>
                  <Text style={styles.inviteCode}>{inviteResult.invite_code}</Text>
                  {inviteResult.temp_password ? (
                    <Text style={styles.resultMeta}>
                      {t("admin.temporaryPassword", { password: inviteResult.temp_password })}
                    </Text>
                  ) : null}
                  {inviteResult.community_name ? (
                    <Text style={styles.resultMeta}>{t("admin.communityLabel", { name: inviteResult.community_name })}</Text>
                  ) : null}
                  <TouchableOpacity style={styles.primaryBtn} onPress={closeInvite}>
                    <Text style={styles.primaryBtnText}>{t("admin.done")}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.label}>{t("admin.fullName")}</Text>
                  <LocaleTextInput
                    value={inviteForm.name}
                    onChangeText={(v) => {
                      setInviteForm((f) => ({ ...f, name: v }));
                      clearError("name");
                    }}
                    onBlur={() => touch("name")}
                    style={[styles.input, showError("name", inviteLiveErrors) && styles.inputError]}
                    placeholder={t("admin.residentName")}
                  />
                  {showError("name", inviteLiveErrors) ? <Text style={styles.errorText}>{showError("name", inviteLiveErrors)}</Text> : null}
                  <Text style={styles.label}>{t("admin.emailLabel")}</Text>
                  <LocaleTextInput
                    value={inviteForm.email}
                    onChangeText={(v) => {
                      setInviteForm((f) => ({ ...f, email: v }));
                      clearError("email");
                    }}
                    onBlur={() => touch("email")}
                    style={[styles.input, showError("email", inviteLiveErrors) && styles.inputError]}
                    placeholder={t("admin.emailPlaceholder")}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  {showError("email", inviteLiveErrors) ? <Text style={styles.errorText}>{showError("email", inviteLiveErrors)}</Text> : null}
                  <Text style={styles.label}>{t("admin.phoneLabel")}</Text>
                  <FormPhoneInput
                    digits={phoneDigits}
                    country={phoneCountry}
                    onChangeDigits={(value) => {
                      setPhoneDigits(value);
                      touch("phone");
                      clearError("phone");
                    }}
                    onCountryChange={(country) => {
                      setPhoneCountry(country);
                      clearError("phone");
                    }}
                    showError={Boolean(showError("phone", inviteLiveErrors))}
                  />
                  {showError("phone", inviteLiveErrors) ? <Text style={styles.errorText}>{showError("phone", inviteLiveErrors)}</Text> : null}
                  <Text style={styles.label}>{t("admin.unitOptional")}</Text>
                  <LocaleTextInput
                    value={inviteForm.unit}
                    onChangeText={(v) => {
                      setInviteForm((f) => ({ ...f, unit: v }));
                      clearError("unit");
                    }}
                    onBlur={() => touch("unit")}
                    style={[styles.input, showError("unit", inviteLiveErrors) && styles.inputError]}
                    placeholder={t("admin.unitPlaceholder")}
                  />
                  {showError("unit", inviteLiveErrors) ? <Text style={styles.errorText}>{showError("unit", inviteLiveErrors)}</Text> : null}
                  <TouchableOpacity
                    style={[styles.primaryBtn, (!canInvite || inviting) && { opacity: 0.45 }]}
                    disabled={!canInvite || inviting}
                    onPress={handleInvite}
                  >
                    {inviting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>{t("admin.sendInvite")}</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(rejectTarget)} transparent animationType="slide" onRequestClose={closeReject}>
        <Pressable style={styles.modalOverlay} onPress={closeReject}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboard}
          >
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>{t("admin.rejectResident")}</Text>
              <Text style={styles.rejectHint}>
                {t("admin.rejectHintMessage", { name: rejectTarget?.display_name || rejectTarget?.name || t("admin.thisResident") })}
              </Text>
              <Text style={styles.label}>{t("admin.reasonLabel")}</Text>
              <LocaleTextInput
                value={rejectReason}
                onChangeText={setRejectReason}
                style={[styles.input, styles.rejectInput]}
                placeholder={t("admin.explainRejection")}
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, styles.modalActionBtn]}
                  disabled={Boolean(rejecting)}
                  onPress={closeReject}
                >
                  <Text style={styles.cancelBtnText}>{t("admin.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rejectBtn, styles.modalActionBtn, rejecting && styles.actionBtnDisabled]}
                  disabled={Boolean(rejecting)}
                  onPress={handleReject}
                >
                  {rejecting ? (
                    <ActivityIndicator size="small" color="#B91C1C" />
                  ) : (
                    <Text style={styles.rejectBtnText}>{t("admin.confirmReject")}</Text>
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
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: Colors.textPrimary,
  },
  inviteHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  toolbar: {
    zIndex: 4,
    elevation: 4,
    backgroundColor: "#FFFFFF",
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF2F7",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: 24,
    marginBottom: 2,
    paddingHorizontal: 13,
    paddingVertical: 9,
    minHeight: sw(42),
    borderRadius: 11,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  filterScroll: {
    flexGrow: 0,
    marginTop: 10,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 24,
    paddingEnd: 32,
    minHeight: 28,
  },
  filterChip: {
    height: 28,
    minWidth: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: "#D1FAF5",
    borderColor: "#93C5FD",
  },
  filterChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    lineHeight: sf(11),
    color: "#64748B",
  },
  filterChipTextActive: {
    color: Colors.brandPrimaryDeep,
  },
  list: {
    flex: 1,
    zIndex: 0,
    elevation: 0,
  },
  listContent: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  memberCard: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    backgroundColor: "#FFFFFF",
  },
  memberTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberBody: {
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: Colors.brandPrimaryDeep,
  },
  memberName: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: Colors.textPrimary,
  },
  memberMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusPill: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    fontWeight: "600",
  },
  iconActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginStart: 4,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnReject: {
    backgroundColor: "#FFF5F5",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  iconBtnApprove: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  rejectBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#B91C1C",
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  cancelBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: Colors.textSecondary,
  },
  modalActionBtn: {
    marginTop: 0,
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
  rejectHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textMuted,
    marginBottom: 4,
  },
  rejectInput: {
    minHeight: 96,
    paddingTop: 12,
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: {
    textAlign: "center",
    marginTop: 40,
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalKeyboard: { width: "100%" },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 32,
  },
  modalTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: Colors.textPrimary,
  },
  inputError: {
    borderColor: "#DC2626",
  },
  errorText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#DC2626",
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: Colors.brandPrimaryDeep,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#FFFFFF",
  },
  resultLine: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: Colors.textSecondary,
  },
  inviteCode: {
    marginTop: 12,
    fontFamily: Fonts.bold,
    fontSize: sf(28),
    letterSpacing: 2,
    color: Colors.brandPrimaryDeep,
    textAlign: "center",
  },
  resultMeta: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textMuted,
    textAlign: "center",
  },
});
