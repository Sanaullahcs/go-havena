import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable, Share, Modal, TouchableOpacity } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
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
  ensureMyFamily,
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
import { getApiErrorMessage } from "../../../utils/auth-errors";
import { formatDisplayDateTime } from "../../../utils/form-datetime";
import { confirmSignOut } from "../../../services/sign-out";
import { getCompleteProfileParams, Routes } from "../../../constants/onboarding-routes";
import { getUser } from "../../../services/auth-session";
import { chevronForward } from "../../../utils/rtl";

function roleLabel(role, t) {
  if (role === "head") return t("family.familyHead");
  return t("family.member");
}

export default function MyFamilyScreen() {
  const router = useRouter();
  const { t } = useTranslation();
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
  const [createSubmitError, setCreateSubmitError] = useState(null);
  const creatingFamilyRef = useRef(false);
  const createCheckSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyFamily();
      setPayload(data);
    } catch (err) {
      await showFailure(t("family.couldNotLoadFamily"), err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure, t]);

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
    await showSuccess(t("family.copied"), t("family.familyNumberCopied"));
  };

  const handleShare = async () => {
    if (!family?.family_number) return;
    try {
      await Share.share({
        message: t("family.shareMessage", { number: family.family_number }),
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
          setCreateNumberError(t("family.couldNotGenerateNumber"));
        }
      } finally {
        if (!cancelled) setCreateNumberLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [createOpen, t]);

  useEffect(() => {
    if (!createOpen || creatingFamily) return undefined;

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
          setCreateNumberError(result.message || t("family.numberAlreadyExists"));
        } else {
          setCreateNumberError(null);
        }
      } catch {
        if (seq === createCheckSeq.current) {
          setCreateNumberError(t("family.couldNotVerifyNumber"));
        }
      } finally {
        if (seq === createCheckSeq.current) {
          setCreateNumberChecking(false);
        }
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [createNumber, createOpen, creatingFamily, t]);

  const regenerateCreateNumber = async () => {
    setCreateNumberLoading(true);
    try {
      const suggested = await fetchSuggestedFamilyNumber();
      if (suggested.family_number) {
        setCreateNumber(suggested.family_number);
        setCreateNumberError(null);
      }
    } catch {
      setCreateNumberError(t("family.couldNotGenerateNewNumber"));
    } finally {
      setCreateNumberLoading(false);
    }
  };

  const resetCreateModal = () => {
    creatingFamilyRef.current = false;
    setCreatingFamily(false);
    setCreateOpen(false);
    setCreateNumber("");
    setCreateNumberError(null);
    setCreateSubmitError(null);
    setCreateNumberChecking(false);
    setCreateNumberLoading(false);
    createCheckSeq.current += 1;
  };

  const confirmCreate = async () => {
    const number = createNumber.trim();
    if (!number) {
      setCreateSubmitError(t("family.enterOrGenerateNumber"));
      return;
    }
    if (createNumberError || createNumberChecking || createNumberLoading) {
      return;
    }
    if (creatingFamilyRef.current) return;

    creatingFamilyRef.current = true;
    createCheckSeq.current += 1;
    setCreateNumberChecking(false);
    setCreatingFamily(true);
    setCreateSubmitError(null);

    try {
      const family = await createFamily(null, number);
      if (!family?.family_number) {
        throw new Error(t("family.couldNotCreateFamily"));
      }

      if (!creatingFamilyRef.current) {
        load();
        return;
      }

      creatingFamilyRef.current = false;
      setCreatingFamily(false);
      setCreateOpen(false);
      setCreateNumber("");
      setCreateNumberError(null);
      setCreateSubmitError(null);
      load();
      setTimeout(() => {
        showSuccess(t("family.familyCreated"), t("family.shareNumberHint"));
      }, 350);
    } catch (err) {
      if (!creatingFamilyRef.current) return;
      creatingFamilyRef.current = false;
      setCreatingFamily(false);
      setCreateSubmitError(getApiErrorMessage(err) || t("family.couldNotCreateFamily"));
    }
  };

  const confirmJoin = async () => {
    const number = joinNumber.trim();
    if (!number) {
      await dialog.showError(t("family.familyNumberRequired"), t("family.enterNumberFromHead"));
      return;
    }

    try {
      await requestJoinFamily(number);
      setJoinOpen(false);
      setJoinNumber("");
      await showSuccess(t("family.requestSent"), t("family.headMustApprove"));
      load();
    } catch (err) {
      await showFailure(t("family.couldNotSendRequest"), err);
    }
  };

  const handleLeave = async () => {
    const result = await dialog.showConfirm(
      t("family.leaveFamily"),
      t("family.leaveFamilyMessage"),
      { confirmLabel: t("family.leaveAction"), destructive: true },
    );
    if (result !== "confirm") return;

    try {
      await leaveFamily();
      await showSuccess(t("family.leftFamily"), t("family.leftFamilyMessage"));
      load();
    } catch (err) {
      await showFailure(t("family.couldNotLeaveFamily"), err);
    }
  };

  const handleCancelJoinRequest = async () => {
    const requestId = payload?.pending_request?.id;
    if (!requestId) return;

    const result = await dialog.showConfirm(
      t("family.cancelJoinRequest"),
      t("family.cancelJoinRequestMessage"),
      { confirmLabel: t("family.cancelRequestAction"), destructive: true },
    );
    if (result !== "confirm") return;

    setActionUserId("cancel-join");
    try {
      await cancelFamilyJoinRequest(requestId);
      await showSuccess(t("family.requestCancelled"), t("family.requestCancelledMessage"));
      load();
    } catch (err) {
      await showFailure(t("family.couldNotCancelRequest"), err);
    } finally {
      setActionUserId(null);
    }
  };

  const runMemberAction = async ({ member, title, message, confirmLabel, action, successTitle, successMessage }) => {
    const result = await dialog.showConfirm(title, message, {
      confirmLabel,
      destructive: confirmLabel !== t("family.restoreAction"),
    });
    if (result !== "confirm") return;

    setActionUserId(member.user_id);
    try {
      await action();
      await showSuccess(successTitle, successMessage);
      load();
    } catch (err) {
      await showFailure(t("family.actionFailed"), err);
    } finally {
      setActionUserId(null);
    }
  };

  const headerRight =
    state === "member" && payload?.membership?.role !== "head" ? (
      <Pressable onPress={handleLeave} hitSlop={8}>
        <Text style={styles.leaveLink}>{t("family.leaveAction")}</Text>
      </Pressable>
    ) : state === "member" && payload?.membership?.role === "head" ? (
      <Pressable
        onPress={() => router.push("/screens/my-family/requests")}
        hitSlop={8}
        style={styles.requestsBtn}
      >
        <Feather name="inbox" size={sf(18)} color="#1B4F8A" />
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
        <InternalScreenHeader title={t("family.myFamily")} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1B4F8A" />
        </View>
      </SafeAreaView>
    );
  }

  if (state === "suspended") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title={t("family.myFamily")} />
        <FamilySuspendedState familyName={family?.name || family?.family_number} t={t} />
      </SafeAreaView>
    );
  }

  if (state === "blocked") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title={t("family.myFamily")} />
        <FamilyBlockedState
          familyNumber={payload?.family?.family_number}
          communityName={payload?.family?.community_name}
          t={t}
        />
      </SafeAreaView>
    );
  }

  if (state === "pending") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title={t("family.myFamily")} />
        <ScrollView
          contentContainerStyle={styles.stateScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor="#1B4F8A"
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
            t={t}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (state === "awaiting_admin") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title={t("family.myFamily")} />
        <ScrollView
          contentContainerStyle={styles.stateScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor="#1B4F8A"
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
            t={t}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (state === "rejected") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title={t("family.myFamily")} />
        <ScrollView contentContainerStyle={styles.stateScroll} showsVerticalScrollIndicator={false}>
          <FamilyRejectedState
            request={payload?.rejected_request}
            onSignOut={() => confirmSignOut(dialog)}
            onCreateFamily={async () => {
              if (creatingFamily) return;
              setCreatingFamily(true);
              try {
                const suggested = await fetchSuggestedFamilyNumber();
                const family = await ensureMyFamily(suggested.family_number || undefined);
                if (!family?.family_number) {
                  const user = await getUser();
                  router.replace({
                    pathname: Routes.COMPLETE_PROFILE,
                    params: {
                      ...(user ? getCompleteProfileParams(user, user?.role || "resident") : {}),
                      familyMode: "create",
                    },
                  });
                  return;
                }
                await showSuccess(
                  t("family.familyCreated"),
                  t("family.shareNumberHint"),
                );
                await load();
              } catch (err) {
                await showFailure(t("family.couldNotCreateFamily"), err);
              } finally {
                setCreatingFamily(false);
              }
            }}
            creating={creatingFamily}
            t={t}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (state === "none") {
    return (
      <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
        <InternalScreenHeader title={t("family.myFamily")} />
        <FamilyEmptyState
          canCreate={payload?.can_create}
          canJoin={payload?.can_join}
          onCreate={handleCreate}
          onJoin={() => setJoinOpen(true)}
          t={t}
        />
        <CreateFamilyModal
          visible={createOpen}
          value={createNumber}
          onChange={(text) => {
            setCreateNumber(text);
            setCreateSubmitError(null);
          }}
          onClose={resetCreateModal}
          onSubmit={confirmCreate}
          onRegenerate={regenerateCreateNumber}
          error={createSubmitError || createNumberError}
          loading={createNumberLoading}
          checking={createNumberChecking}
          submitting={creatingFamily}
          t={t}
        />
        <JoinModal
          visible={joinOpen}
          value={joinNumber}
          onChange={setJoinNumber}
          onClose={() => setJoinOpen(false)}
          onSubmit={confirmJoin}
          t={t}
        />
      </SafeAreaView>
    );
  }

  const members = family?.members ?? [];
  const isHead = payload?.membership?.role === "head";

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("family.myFamily")}
        subtitle={family?.name || family?.community_name || t("family.yourHousehold")}
        right={headerRight}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#1B4F8A" />
        }
        showsVerticalScrollIndicator={false}
      >
        <FamilyHeroCard
          familyNumber={family?.family_number}
          onCopy={handleCopy}
          onShare={handleShare}
          t={t}
        />

        <View style={styles.statsRow}>
          <StatCard icon="award" label={t("family.yourRole")} value={roleLabel(payload?.membership?.role, t)} />
          <StatCard icon="users" label={t("family.membersLabel")} value={String(family?.member_count ?? members.length)} />
        </View>

        <View style={styles.metaCard}>
          <MetaRow icon="user" label={t("family.familyHeadLabel")} value={family?.head?.name ?? "—"} />
          {family?.created_at ? (
            <MetaRow icon="calendar" label={t("family.created")} value={formatDisplayDateTime(family.created_at)} last={!isHead} />
          ) : null}
          {isHead ? (
            <Pressable style={styles.requestsRow} onPress={() => router.push("/screens/my-family/requests")}>
              <Feather name="inbox" size={sf(14)} color="#64748B" />
              <Text style={styles.metaLabel}>{t("family.familyRequests")}</Text>
              <View style={styles.requestsRowRight}>
                {(family?.pending_requests_count ?? 0) > 0 ? (
                  <View style={styles.requestsCountBadge}>
                    <Text style={styles.requestsCountText}>{family.pending_requests_count}</Text>
                  </View>
                ) : null}
                <Feather name={chevronForward()} size={sf(16)} color="#94A3B8" />
              </View>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("family.membersSection")}</Text>
          <View style={styles.sectionActions}>
            {isHead ? (
              <Pressable
                style={styles.addMemberBtn}
                onPress={() => router.push("/screens/my-family/add-member")}
              >
                <Feather name="user-plus" size={sf(14)} color="#FFFFFF" />
                <Text style={styles.addMemberText}>{t("family.addMember")}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.treeLink} onPress={() => router.push("/screens/my-family/tree")}>
              <Feather name="git-branch" size={sf(14)} color="#1B4F8A" />
              <Text style={styles.treeLinkText}>{t("family.familyTree")}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.memberList}>
          {members.length === 0 ? (
            <Text style={styles.noMembers}>{t("family.noMembersYet")}</Text>
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
                    title: t("family.suspendMember", { name: m.user?.name }),
                    message: t("family.suspendMemberMessage"),
                    confirmLabel: t("family.suspendAction"),
                    action: () => suspendFamilyMember(m.user_id),
                    successTitle: t("family.memberSuspended"),
                    successMessage: t("family.memberSuspendedMessage", { name: m.user?.name }),
                  })
                }
                onUnsuspend={(m) =>
                  runMemberAction({
                    member: m,
                    title: t("family.restoreMember", { name: m.user?.name }),
                    message: t("family.restoreMemberMessage"),
                    confirmLabel: t("family.restoreAction"),
                    action: () => unsuspendFamilyMember(m.user_id),
                    successTitle: t("family.accessRestored"),
                    successMessage: t("family.accessRestoredMessage", { name: m.user?.name }),
                  })
                }
                onRemove={(m) =>
                  runMemberAction({
                    member: m,
                    title: t("family.removeMember", { name: m.user?.name }),
                    message: t("family.removeMemberMessage"),
                    confirmLabel: t("family.removeAction"),
                    action: () => removeFamilyMember(m.user_id),
                    successTitle: t("family.memberRemoved"),
                    successMessage: t("family.memberRemovedMessage", { name: m.user?.name }),
                  })
                }
                onBlock={(m) =>
                  runMemberAction({
                    member: m,
                    title: t("family.blockMember", { name: m.user?.name }),
                    message: t("family.blockMemberMessage"),
                    confirmLabel: t("family.blockAction"),
                    action: () => blockFamilyMember(m.user_id),
                    successTitle: t("family.memberBlocked"),
                    successMessage: t("family.memberBlockedMessage", { name: m.user?.name }),
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
      <Feather name={icon} size={sf(16)} color="#1B4F8A" />
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
  t,
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalKeyboard}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t("family.createMyFamily")}</Text>
            <Text style={styles.modalHint}>
              {t("family.createFamilyHint")}
            </Text>
            <View style={styles.modalLabelRow}>
              <Text style={styles.modalFieldLabel}>{t("family.familyNumberLabel")}</Text>
              <TouchableOpacity onPress={onRegenerate} disabled={loading || submitting} hitSlop={8}>
                <Text style={styles.modalLinkText}>{t("family.refreshCode")}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalInputWrap}>
              <View style={styles.modalInputBox}>
                <LocaleTextInput
                  forceLtr
                  value={value}
                  onChangeText={(text) => onChange(text.toUpperCase())}
                  placeholder="FAM-XXXXXX"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  underlineColorAndroid="transparent"
                  style={styles.modalInput}
                  maxLength={30}
                  editable={!submitting}
                />
              </View>
              {loading || checking ? (
                <View style={styles.modalInputSpinner} pointerEvents="none">
                  <ActivityIndicator size="small" color="#1B4F8A" />
                </View>
              ) : null}
            </View>
            {error ? <Text style={styles.modalError}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
                <Text style={styles.modalCancelText}>{t("family.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, (submitting || loading || checking || error) && styles.modalSubmitDisabled]}
                onPress={onSubmit}
                disabled={submitting || loading || checking || Boolean(error) || !value.trim()}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>{t("family.createFamilyAction")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function JoinModal({ visible, value, onChange, onClose, onSubmit, t }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalKeyboard}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t("family.joinExistingFamily")}</Text>
            <Text style={styles.modalHint}>{t("family.joinFamilyHint")}</Text>
            <View style={styles.modalInputBox}>
              <LocaleTextInput
                forceLtr
                value={value}
                onChangeText={onChange}
                placeholder="FAM-XXXXXX"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                autoCorrect={false}
                underlineColorAndroid="transparent"
                style={styles.modalInput}
                maxLength={30}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
                <Text style={styles.modalCancelText}>{t("family.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={onSubmit}>
                <Text style={styles.modalSubmitText}>{t("family.sendRequest")}</Text>
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
    backgroundColor: "#1B4F8A",
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
    color: "#1B4F8A",
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
    end: -4,
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
  modalInputWrap: {
    position: "relative",
  },
  modalInputBox: {
    height: sw(48),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    paddingTop: 0,
    paddingBottom: 0,
    overflow: "hidden",
    backgroundColor: "#FAFBFC",
    justifyContent: "center",
  },
  modalInput: {
    width: "100%",
    height: "100%",
    margin: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    paddingTop: 0,
    paddingBottom: 0,
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    letterSpacing: 1,
    color: "#0F172A",
    includeFontPadding: false,
    textAlignVertical: "center",
    backgroundColor: "transparent",
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
    backgroundColor: "#1B4F8A",
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
    color: "#1B4F8A",
  },
  modalInputSpinner: {
    position: "absolute",
    end: sw(12),
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  modalError: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#DC2626",
  },
});
