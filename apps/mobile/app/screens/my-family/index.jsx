import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Share,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import FamilyMemberCard, { FamilyHeroCard } from "../../../components/family/family-member-card";
import {
  FamilyBlockedState,
  FamilyEmptyState,
  FamilyPendingState,
  FamilyRejectedState,
  FamilySuspendedState,
} from "../../../components/family/family-empty-states";
import { propertyStyles } from "../../../constants/property-styles";
import { Fonts } from "../../../constants/font";
import { sf, sw } from "../../../utils/responsive";
import {
  blockFamilyMember,
  checkFamilyNumberAvailability,
  createFamily,
  fetchMyFamily,
  fetchSuggestedFamilyNumber,
  leaveFamily,
  removeFamilyMember,
  requestJoinFamily,
  cancelFamilyJoinRequest,
  suspendFamilyMember,
  unsuspendFamilyMember,
} from "../../../services/family-api";
import { useApiAction } from "../../../hooks/use-api-action";
import { formatDisplayDateTime } from "../../../utils/form-datetime";
import { confirmSignOut } from "../../../services/sign-out";
import { getCompleteProfileParams, Routes } from "../../../constants/onboarding-routes";
import { getUser } from "../../../services/auth-session";

function roleLabel(role) {
  if (role === "head") return "Family Head";
  return "Member";
}

export default function MyFamilyScreen() {
  const router = useRouter();
  const { dialog, showFailure, showSuccess } = useApiAction();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionUserId, setActionUserId] = useState(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinNumber, setJoinNumber] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createNumber, setCreateNumber] = useState("");
  const [createNumberError, setCreateNumberError] = useState(null);
  const [createNumberChecking, setCreateNumberChecking] = useState(false);
  const [createNumberLoading, setCreateNumberLoading] = useState(false);
  const [creatingFamily, setCreatingFamily] = useState(false);
  const createCheckSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyFamily();
      setPayload(data);
    } catch (err) {
      await showFailure("Could not load family", err);
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

  const family = payload?.family;
  const state = payload?.state ?? "none";

  const handleCopy = async () => {
    if (!family?.family_number) return;
    await Clipboard.setStringAsync(family.family_number);
    await showSuccess("Copied", "Family number copied to clipboard.");
  };

  const handleShare = async () => {
    if (!family?.family_number) return;
    try {
      await Share.share({
        message: `Join my Havena family with number ${family.family_number}.`,
      });
    } catch {
      // user dismissed
    }
  };

  const handleCreate = () => {
    setCreateOpen(true);
  };

  useEffect(() => {
    if (!createOpen) return undefined;

    let cancelled = false;
    (async () => {
      setCreateNumberLoading(true);
      try {
        const suggested = await fetchSuggestedFamilyNumber();
        if (!cancelled && suggested.family_number) {
          setCreateNumber(suggested.family_number);
          setCreateNumberError(null);
        }
      } catch {
        if (!cancelled) {
          setCreateNumberError("Could not generate a family number. Try again.");
        }
      } finally {
        if (!cancelled) setCreateNumberLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  useEffect(() => {
    if (!createOpen) return undefined;

    const trimmed = createNumber.trim();
    if (!trimmed) {
      setCreateNumberError(null);
      return undefined;
    }

    const seq = ++createCheckSeq.current;
    const timer = setTimeout(async () => {
      setCreateNumberChecking(true);
      try {
        const result = await checkFamilyNumberAvailability(trimmed);
        if (seq !== createCheckSeq.current) return;

        if (result.normalized && result.normalized !== trimmed.toUpperCase()) {
          setCreateNumber(result.normalized);
        }

        if (!result.available) {
          setCreateNumberError(result.message || "This Family Number already exists.");
        } else {
          setCreateNumberError(null);
        }
      } catch {
        if (seq === createCheckSeq.current) {
          setCreateNumberError("Could not verify this family number.");
        }
      } finally {
        if (seq === createCheckSeq.current) {
          setCreateNumberChecking(false);
        }
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [createNumber, createOpen]);

  const regenerateCreateNumber = async () => {
    setCreateNumberLoading(true);
    try {
      const suggested = await fetchSuggestedFamilyNumber();
      if (suggested.family_number) {
        setCreateNumber(suggested.family_number);
        setCreateNumberError(null);
      }
    } catch {
      setCreateNumberError("Could not generate a new family number.");
    } finally {
      setCreateNumberLoading(false);
    }
  };

  const confirmCreate = async () => {
    const number = createNumber.trim();
    if (!number) {
      await dialog.showError("Family number required", "Enter or generate a family number.");
      return;
    }
    if (createNumberError || createNumberChecking || createNumberLoading) {
      return;
    }

    setCreatingFamily(true);
    try {
      await createFamily(null, number);
      setCreateOpen(false);
      setCreateNumber("");
      setCreateNumberError(null);
      await showSuccess(
        "Family created",
        "Share your family number so others can request to join.",
      );
      load();
    } catch (err) {
      await showFailure("Could not create family", err);
    } finally {
      setCreatingFamily(false);
    }
  };

  const confirmJoin = async () => {
    const number = joinNumber.trim();
    if (!number) {
      await dialog.showError("Family number required", "Enter the family number from your family head.");
      return;
    }

    try {
      await requestJoinFamily(number);
      setJoinOpen(false);
      setJoinNumber("");
      await showSuccess("Request sent", "The family head must approve your request.");
      load();
    } catch (err) {
      await showFailure("Could not send request", err);
    }
  };

  const handleLeave = async () => {
    const result = await dialog.showConfirm(
      "Leave family?",
      "You will lose access to family features until you join again.",
      { confirmLabel: "Leave", destructive: true },
    );
    if (result !== "confirm") return;

    try {
      await leaveFamily();
      await showSuccess("Left family", "You are no longer part of this family.");
      load();
    } catch (err) {
      await showFailure("Could not leave family", err);
    }
  };

  const handleCancelJoinRequest = async () => {
    const requestId = payload?.pending_request?.id;
    if (!requestId) return;

    const result = await dialog.showConfirm(
      "Cancel join request?",
      "You can request to join again later with a family number.",
      { confirmLabel: "Cancel request", destructive: true },
    );
    if (result !== "confirm") return;

    setActionUserId("cancel-join");
    try {
      await cancelFamilyJoinRequest(requestId);
      await showSuccess("Request cancelled", "Your family join request was cancelled.");
      load();
    } catch (err) {
      await showFailure("Could not cancel request", err);
    } finally {
      setActionUserId(null);
    }
  };

  const runMemberAction = async ({ member, title, message, confirmLabel, action, successTitle, successMessage }) => {
    const result = await dialog.showConfirm(title, message, {
      confirmLabel,
      destructive: confirmLabel !== "Restore",
    });
    if (result !== "confirm") return;

    setActionUserId(member.user_id);
    try {
      await action();
      await showSuccess(successTitle, successMessage);
      load();
    } catch (err) {
      await showFailure("Action failed", err);
    } finally {
      setActionUserId(null);
    }
  };

  const headerRight =
    state === "member" && payload?.membership?.role !== "head" ? (
      <Pressable onPress={handleLeave} hitSlop={8}>
        <Text style={styles.leaveLink}>Leave</Text>
      </Pressable>
    ) : state === "member" && payload?.membership?.role === "head" ? (
      <Pressable
        onPress={() => router.push("/screens/my-family/requests")}
        hitSlop={8}
        style={styles.requestsBtn}
      >
        <Feather name="inbox" size={sf(18)} color="#0A2A43" />
        {(family?.pending_requests_count ?? 0) > 0 ? (
          <View style={styles.requestsBadge}>
            <Text style={styles.requestsBadgeText}>{family.pending_requests_count}</Text>
          </View>
        ) : null}
      </Pressable>
    ) : null;

  if (loading) {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title="My Family" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0A2A43" />
        </View>
      </SafeAreaView>
    );
  }

  if (state === "suspended") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title="My Family" />
        <FamilySuspendedState familyName={family?.name || family?.family_number} />
      </SafeAreaView>
    );
  }

  if (state === "blocked") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title="My Family" />
        <FamilyBlockedState
          familyNumber={payload?.family?.family_number}
          communityName={payload?.family?.community_name}
        />
      </SafeAreaView>
    );
  }

  if (state === "pending") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title="My Family" />
        <ScrollView
          contentContainerStyle={styles.stateScroll}
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
          showsVerticalScrollIndicator={false}
        >
          <FamilyPendingState
            request={payload?.pending_request}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            onCancel={handleCancelJoinRequest}
            cancelling={actionUserId === "cancel-join"}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (state === "awaiting_admin") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title="My Family" />
        <ScrollView
          contentContainerStyle={styles.stateScroll}
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
          showsVerticalScrollIndicator={false}
        >
          <FamilyPendingState
            request={payload?.pending_request}
            awaitingAdmin
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (state === "rejected") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title="My Family" />
        <ScrollView contentContainerStyle={styles.stateScroll} showsVerticalScrollIndicator={false}>
          <FamilyRejectedState
            request={payload?.rejected_request}
            onSignOut={() => confirmSignOut(dialog)}
            onCreateFamily={async () => {
              const user = await getUser();
              router.replace({
                pathname: Routes.COMPLETE_PROFILE,
                params: {
                  ...(user ? getCompleteProfileParams(user, user?.role || "resident") : {}),
                  familyMode: "create",
                },
              });
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (state === "none") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title="My Family" />
        <FamilyEmptyState
          canCreate={payload?.can_create}
          canJoin={payload?.can_join}
          onCreate={handleCreate}
          onJoin={() => setJoinOpen(true)}
        />
        <CreateFamilyModal
          visible={createOpen}
          value={createNumber}
          onChange={setCreateNumber}
          onClose={() => {
            setCreateOpen(false);
            setCreateNumber("");
            setCreateNumberError(null);
          }}
          onSubmit={confirmCreate}
          onRegenerate={regenerateCreateNumber}
          error={createNumberError}
          loading={createNumberLoading}
          checking={createNumberChecking}
          submitting={creatingFamily}
        />
        <JoinModal
          visible={joinOpen}
          value={joinNumber}
          onChange={setJoinNumber}
          onClose={() => setJoinOpen(false)}
          onSubmit={confirmJoin}
        />
      </SafeAreaView>
    );
  }

  const members = family?.members ?? [];
  const isHead = payload?.membership?.role === "head";

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title="My Family"
        subtitle={family?.name || family?.community_name || "Your household"}
        right={headerRight}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#0A2A43" />
        }
        showsVerticalScrollIndicator={false}
      >
        <FamilyHeroCard
          familyNumber={family?.family_number}
          onCopy={handleCopy}
          onShare={handleShare}
        />

        <View style={styles.statsRow}>
          <StatCard icon="award" label="Your role" value={roleLabel(payload?.membership?.role)} />
          <StatCard icon="users" label="Members" value={String(family?.member_count ?? members.length)} />
        </View>

        <View style={styles.metaCard}>
          <MetaRow icon="user" label="Family head" value={family?.head?.name ?? "—"} />
          {family?.created_at ? (
            <MetaRow icon="calendar" label="Created" value={formatDisplayDateTime(family.created_at)} last={!isHead} />
          ) : null}
          {isHead ? (
            <Pressable style={styles.requestsRow} onPress={() => router.push("/screens/my-family/requests")}>
              <Feather name="inbox" size={sf(14)} color="#64748B" />
              <Text style={styles.metaLabel}>Family requests</Text>
              <View style={styles.requestsRowRight}>
                {(family?.pending_requests_count ?? 0) > 0 ? (
                  <View style={styles.requestsCountBadge}>
                    <Text style={styles.requestsCountText}>{family.pending_requests_count}</Text>
                  </View>
                ) : null}
                <Feather name="chevron-right" size={sf(16)} color="#94A3B8" />
              </View>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Members</Text>
          <View style={styles.sectionActions}>
            {isHead ? (
              <Pressable
                style={styles.addMemberBtn}
                onPress={() => router.push("/screens/my-family/add-member")}
              >
                <Feather name="user-plus" size={sf(14)} color="#FFFFFF" />
                <Text style={styles.addMemberText}>Add member</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.treeLink} onPress={() => router.push("/screens/my-family/tree")}>
              <Feather name="git-branch" size={sf(14)} color="#0A2A43" />
              <Text style={styles.treeLinkText}>Family tree</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.memberList}>
          {members.length === 0 ? (
            <Text style={styles.noMembers}>No members yet.</Text>
          ) : (
            members.map((member) => (
              <FamilyMemberCard
                key={member.id ?? member.user_id}
                member={member}
                isHeadViewer={isHead}
                busy={actionUserId === member.user_id}
                onViewProfile={(m) =>
                  router.push({
                    pathname: "/screens/my-family/member",
                    params: { userId: String(m.user_id) },
                  })
                }
                onSuspend={(m) =>
                  runMemberAction({
                    member: m,
                    title: `Suspend ${m.user?.name}?`,
                    message: "They will lose access to family features until you restore them.",
                    confirmLabel: "Suspend",
                    action: () => suspendFamilyMember(m.user_id),
                    successTitle: "Member suspended",
                    successMessage: `${m.user?.name} can no longer access family features.`,
                  })
                }
                onUnsuspend={(m) =>
                  runMemberAction({
                    member: m,
                    title: `Restore ${m.user?.name}?`,
                    message: "They will regain access to family features.",
                    confirmLabel: "Restore",
                    action: () => unsuspendFamilyMember(m.user_id),
                    successTitle: "Access restored",
                    successMessage: `${m.user?.name} can access family features again.`,
                  })
                }
                onRemove={(m) =>
                  runMemberAction({
                    member: m,
                    title: `Remove ${m.user?.name}?`,
                    message: "They will be removed from your family immediately.",
                    confirmLabel: "Remove",
                    action: () => removeFamilyMember(m.user_id),
                    successTitle: "Member removed",
                    successMessage: `${m.user?.name} was removed from your family.`,
                  })
                }
                onBlock={(m) =>
                  runMemberAction({
                    member: m,
                    title: `Block ${m.user?.name}?`,
                    message: "They will be removed and cannot request to join again.",
                    confirmLabel: "Block",
                    action: () => blockFamilyMember(m.user_id),
                    successTitle: "Member blocked",
                    successMessage: `${m.user?.name} was blocked from your family.`,
                  })
                }
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <View style={styles.statCard}>
      <Feather name={icon} size={sf(16)} color="#0A2A43" />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function MetaRow({ icon, label, value, last = false }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Feather name={icon} size={sf(14)} color="#64748B" />
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function CreateFamilyModal({
  visible,
  value,
  onChange,
  onClose,
  onSubmit,
  onRegenerate,
  error,
  loading,
  checking,
  submitting,
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalKeyboard}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Create My Family</Text>
            <Text style={styles.modalHint}>
              A unique family number is generated for you. Edit it if you like, then create your household.
            </Text>
            <View style={styles.modalLabelRow}>
              <Text style={styles.modalFieldLabel}>Family Number</Text>
              <TouchableOpacity onPress={onRegenerate} disabled={loading || submitting} hitSlop={8}>
                <Text style={styles.modalLinkText}>Refresh code</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalInputWrap}>
              <TextInput
                value={value}
                onChangeText={(text) => onChange(text.toUpperCase())}
                placeholder="FAM-XXXXXX"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                style={styles.modalInput}
                maxLength={30}
                editable={!submitting}
              />
              {loading || checking ? (
                <ActivityIndicator size="small" color="#0A2A43" style={styles.modalInputSpinner} />
              ) : null}
            </View>
            {error ? <Text style={styles.modalError}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={onClose} disabled={submitting}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, (submitting || loading || checking || error) && styles.modalSubmitDisabled]}
                onPress={onSubmit}
                disabled={submitting || loading || checking || Boolean(error) || !value.trim()}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>Create family</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function JoinModal({ visible, value, onChange, onClose, onSubmit }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalKeyboard}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Join Existing Family</Text>
            <Text style={styles.modalHint}>Enter the family number from your family head. Approval is required.</Text>
            <TextInput
              value={value}
              onChangeText={onChange}
              placeholder="FAM-XXXXXX"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              style={styles.modalInput}
              maxLength={30}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={onSubmit}>
                <Text style={styles.modalSubmitText}>Send request</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  stateScroll: {
    flexGrow: 1,
    paddingBottom: sw(24),
  },
  content: {
    paddingHorizontal: sw(16),
    paddingTop: sw(8),
    paddingBottom: sw(32),
  },
  statsRow: {
    flexDirection: "row",
    gap: sw(10),
    marginBottom: sw(14),
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    padding: sw(14),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: sw(4),
  },
  statLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#0F172A",
  },
  metaCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    paddingHorizontal: sw(14),
    marginBottom: sw(18),
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingVertical: sw(12),
  },
  metaRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  metaLabel: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#64748B",
  },
  metaValue: {
    flex: 1.2,
    textAlign: "right",
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#0F172A",
  },
  requestsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingVertical: sw(12),
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  requestsRowRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: sw(8),
  },
  requestsCountBadge: {
    minWidth: sw(20),
    height: sw(20),
    borderRadius: sw(10),
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(6),
  },
  requestsCountText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: "#FFFFFF",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(10),
    gap: sw(8),
  },
  sectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    flexShrink: 1,
  },
  addMemberBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
    borderRadius: sw(999),
    backgroundColor: "#0A2A43",
  },
  addMemberText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#FFFFFF",
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#0F172A",
  },
  treeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
    borderRadius: sw(999),
    backgroundColor: "#D1FAF5",
  },
  treeLinkText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#0A2A43",
  },
  memberList: { gap: sw(8) },
  noMembers: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: "#64748B",
    textAlign: "center",
    paddingVertical: sw(20),
  },
  leaveLink: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#DC2626",
  },
  requestsBtn: {
    position: "relative",
    padding: sw(4),
  },
  requestsBadge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: sw(16),
    height: sw(16),
    borderRadius: sw(8),
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(4),
  },
  requestsBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(9),
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
  modalInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    letterSpacing: 1,
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
  modalSubmit: {
    flex: 1,
    alignItems: "center",
    paddingVertical: sw(13),
    borderRadius: sw(12),
    backgroundColor: "#0A2A43",
  },
  modalSubmitText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
  modalSubmitDisabled: {
    opacity: 0.6,
  },
  modalLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(8),
  },
  modalFieldLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#0F172A",
  },
  modalLinkText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#0A2A43",
  },
  modalInputWrap: {
    position: "relative",
  },
  modalInputSpinner: {
    position: "absolute",
    right: sw(14),
    top: sw(14),
  },
  modalError: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#DC2626",
  },
});
