import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import AppModal from "../../../components/layout/app-modal";
import { ADMIN_FAB_CLEARANCE } from "../../../constants/admin-theme";
import { Fonts } from "../../../constants/font";
import { HomeTheme as T } from "../../../constants/home-theme";
import { useApiAction } from "../../../hooks/use-api-action";
import {
  canSwitchCommunities,
  currentCommunityId,
  isCommunityAdmin,
} from "../../../services/community-access";
import { getCachedUser } from "../../../services/auth-session";
import {
  fetchMyCommunities,
  fetchMyInvitations,
  rejectMyInvitation,
  switchActiveCommunity,
} from "../../../services/profile-api";
import { navigateAfterAuth } from "../../../constants/onboarding-routes";
import SwitchCommunitySheet from "../../../components/ui/switch-community-sheet";
import {
  promptAddUnitsBeforeSwitch,
  showSwitchCommunityFailure,
} from "../../../utils/switch-community-errors";
import { chevronForward } from "../../../utils/rtl";
import { sf, sw } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";

const FILTERS = [
  { key: "all", labelKey: "myCommunity.filterAll" },
  { key: "current", labelKey: "myCommunity.filterCurrent" },
  { key: "pending", labelKey: "myCommunity.filterPending" },
  { key: "approved", labelKey: "myCommunity.filterApproved" },
  { key: "rejected", labelKey: "myCommunity.filterRejected" },
];

function isCurrentMembership(row, activeCommunityId) {
  // Prefer the explicit active id so a just-switched community cannot stay
  // marked current via a stale `is_active` flag on another row.
  if (activeCommunityId != null && Number(activeCommunityId) > 0) {
    return Number(row?.community_id) === Number(activeCommunityId);
  }
  return Boolean(row?.is_active);
}

function membershipNeedsUnits(row) {
  return Boolean(row?.needs_units);
}

function membershipTone(status, row) {
  if (membershipNeedsUnits(row)) {
    return {
      bg: T.mint,
      text: T.deepTeal,
      labelKey: "myCommunity.statusAddUnit",
      icon: "home",
    };
  }
  const key = String(status || "").toLowerCase();
  if (key === "approved")
    return {
      bg: T.mint,
      text: T.deepTeal,
      labelKey: "myCommunity.statusApproved",
      icon: "check-circle",
    };
  if (key === "pending")
    return {
      bg: "#FFFBEB",
      text: "#B45309",
      labelKey: "myCommunity.statusPending",
      icon: "clock",
    };
  if (key === "rejected")
    return {
      bg: "#FEF2F2",
      text: "#B91C1C",
      labelKey: "myCommunity.statusRejected",
      icon: "x-circle",
    };
  if (key === "banned" || key === "suspended") {
    return {
      bg: "#F1F5F9",
      text: "#475569",
      labelKey: "myCommunity.statusSuspended",
      icon: "slash",
    };
  }
  return {
    bg: "#F1F5F9",
    text: "#475569",
    labelKey: "myCommunity.statusOther",
    icon: "help-circle",
  };
}

function communityLocation(community) {
  const address = String(community?.address ?? "").trim();
  const region = String(community?.region ?? "").trim();
  if (!address) return region || null;
  if (!region) return address;
  const addressLower = address.toLowerCase();
  const regionLower = region.toLowerCase();
  if (addressLower.includes(regionLower) || regionLower.includes(addressLower))
    return address;
  const regionParts = regionLower.split(/[^a-z0-9]+/).filter((part) => part.length > 2);
  if (regionParts.some((part) => addressLower.includes(part))) return address;
  return `${address} · ${region}`;
}

function communityInitial(name) {
  const text = String(name || "").trim();
  return text ? text.charAt(0).toUpperCase() : "C";
}

function formatExpiry(value, t) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return t("myCommunity.expiresOn", { date: date.toLocaleDateString() });
}

function CommunityCard({ row, activeCommunityId, t }) {
  const tone = membershipTone(row.status, row);
  const isActive = isCurrentMembership(row, activeCommunityId);
  const name = row.community?.name || t("community.myCommunity");
  const location = communityLocation(row.community);

  return (
    <View style={[styles.card, isActive && styles.cardActive]}>
      {isActive ? <View style={styles.cardAccentRail} /> : null}
      <View style={styles.cardInner}>
        <View style={styles.cardRow}>
          <View style={[styles.avatar, isActive && styles.avatarActive]}>
            <Text
              style={[styles.avatarText, isActive && styles.avatarTextActive]}
            >
              {communityInitial(name)}
            </Text>
          </View>

          <View style={styles.cardCopy}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {name}
              </Text>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: tone.bg },
                  isActive && styles.statusPillActive,
                ]}
              >
                <Feather name={tone.icon} size={sf(11)} color={tone.text} />
                <Text style={[styles.statusPillText, { color: tone.text }]}>
                  {t(tone.labelKey)}
                </Text>
              </View>
            </View>

            {location ? (
              <View style={styles.metaRow}>
                <View style={styles.metaIconWrap}>
                  <Feather
                    name="map-pin"
                    size={sf(12)}
                    color={isActive ? T.deepTeal : T.gray}
                  />
                </View>
                <Text
                  style={[styles.cardMeta, isActive && styles.cardMetaActive]}
                  numberOfLines={1}
                >
                  {location}
                </Text>
              </View>
            ) : null}

            {isActive ? (
              <View style={styles.currentRow}>
                <View style={styles.currentDot} />
                <Text style={styles.currentText}>
                  {t("myCommunity.currentCommunity")}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function InvitationCard({ invite, onPress, onAccept, onReject, t }) {
  const name = invite.community?.name || t("community.myCommunity");
  const location = communityLocation(invite.community);
  const expiry = formatExpiry(invite.expires_at, t);
  const units = (invite.units || [])
    .map((unit) => unit.unit_number)
    .filter(Boolean);
  const invitedBy = invite.invited_by?.name;

  return (
    <View style={styles.inviteCard}>
      <View style={styles.inviteAccent} />
      <View style={styles.inviteCardBody}>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={name}
        >
          <View style={styles.cardRow}>
            <View style={styles.inviteAvatar}>
              <Feather name="mail" size={sf(18)} color="#1B4F8A" />
            </View>

            <View style={styles.cardCopy}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {name}
                </Text>
                <View style={styles.invitePendingPill}>
                  <Text style={styles.invitePendingPillText}>
                    {t("myCommunity.statusPending")}
                  </Text>
                </View>
              </View>

              {location ? (
                <View style={styles.metaRow}>
                  <View style={styles.metaIconWrap}>
                    <Feather name="map-pin" size={sf(12)} color="#6B7280" />
                  </View>
                  <Text style={styles.cardMeta} numberOfLines={2}>
                    {location}
                  </Text>
                </View>
              ) : null}

              <View style={styles.inviteMetaChips}>
                {invitedBy ? (
                  <View style={styles.inviteMetaChip}>
                    <Feather name="user" size={sf(11)} color="#1B4F8A" />
                    <Text style={styles.inviteMetaChipText} numberOfLines={1}>
                      {t("myCommunity.invitedBy", { name: invitedBy })}
                    </Text>
                  </View>
                ) : null}
                {units.length > 0 ? (
                  <View style={styles.inviteMetaChip}>
                    <Feather name="home" size={sf(11)} color="#1B4F8A" />
                    <Text style={styles.inviteMetaChipText} numberOfLines={1}>
                      {units.join(", ")}
                    </Text>
                  </View>
                ) : null}
              </View>

              {expiry ? (
                <View style={styles.expiryChip}>
                  <Feather name="clock" size={sf(11)} color="#B45309" />
                  <Text style={styles.expiryText}>{expiry}</Text>
                </View>
              ) : null}

              <View style={styles.inviteTapHint}>
                <Text style={styles.inviteTapHintText}>
                  {t("myCommunity.tapForDetails")}
                </Text>
                <Feather
                  name={chevronForward()}
                  size={sf(18)}
                  color="#94A3B8"
                />
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function InviteDetailSheet({ invite, onClose, onAccept, onReject, t }) {
  const insets = useSafeAreaInsets();
  if (!invite) return null;

  const name = invite.community?.name || t("community.myCommunity");
  const location = communityLocation(invite.community);
  const expiry = formatExpiry(invite.expires_at, t);
  const units = (invite.units || [])
    .map((unit) => unit.unit_number)
    .filter(Boolean);

  return (
    <AppModal visible={Boolean(invite)} onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={t("common.close")}
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, sw(18)) },
          ]}
        >
          <Pressable onPress={onClose} hitSlop={12} style={styles.handleHit}>
            <View style={styles.handle} />
          </Pressable>

          <View style={styles.sheetHeader}>
            <View style={styles.inviteAvatar}>
              <Feather name="mail" size={sf(18)} color={T.navy} />
            </View>
            <View style={styles.sheetHeaderCopy}>
              <Text style={styles.sheetTitle}>{name}</Text>
              {location ? (
                <Text style={styles.sheetSub}>{location}</Text>
              ) : null}
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Feather name="x" size={sf(18)} color={T.navy} />
            </Pressable>
          </View>

          {invite.community?.description ? (
            <Text style={styles.sheetBody}>{invite.community.description}</Text>
          ) : null}

          <View style={styles.detailList}>
            {invite.invited_by?.name ? (
              <View style={styles.detailRow}>
                <Feather name="user" size={sf(14)} color={T.gray} />
                <Text style={styles.detailText}>
                  {t("myCommunity.invitedBy", { name: invite.invited_by.name })}
                </Text>
              </View>
            ) : null}
            {units.length > 0 ? (
              <View style={styles.detailRow}>
                <Feather name="home" size={sf(14)} color={T.gray} />
                <Text style={styles.detailText}>
                  {t("myCommunity.assignedUnits", { units: units.join(", ") })}
                </Text>
              </View>
            ) : null}
            {expiry ? (
              <View style={styles.detailRow}>
                <Feather name="clock" size={sf(14)} color={T.gray} />
                <Text style={styles.detailText}>{expiry}</Text>
              </View>
            ) : null}
          </View>

          {invite.code ? (
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>
                {t("myCommunity.inviteCode")}
              </Text>
              <Text style={styles.codeValue}>{invite.code}</Text>
            </View>
          ) : null}

          <View style={styles.sheetActions}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.rejectBtn}
              onPress={onReject}
            >
              <Feather name="x" size={sf(15)} color="#B91C1C" />
              <Text style={styles.rejectBtnText}>
                {t("myCommunity.reject")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.acceptBtn}
              onPress={onAccept}
            >
              <Feather name="check" size={sf(15)} color="#FFFFFF" />
              <Text style={styles.acceptBtnText}>
                {t("myCommunity.accept")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </AppModal>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name={icon} size={sf(22)} color={T.teal} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export default function MyCommunityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const loadedOnce = useRef(false);
  const { dialog, showFailure, showSuccess, runAction } = useApiAction();
  const [tab, setTab] = useState("communities");
  const [filter, setFilter] = useState("all");
  const [communities, setCommunities] = useState([]);
  const [activeCommunityId, setActiveCommunityId] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      const quiet = silent || loadedOnce.current;
      if (!quiet) setLoading(true);
      try {
        const [communityPayload, inviteRows] = await Promise.all([
          fetchMyCommunities(),
          fetchMyInvitations(),
        ]);
        setCommunities(communityPayload.communities || []);
        setActiveCommunityId(
          communityPayload.activeCommunityId ?? currentCommunityId(null),
        );
        setInvitations(inviteRows || []);
        loadedOnce.current = true;
      } catch (err) {
        await showFailure(t("myCommunity.title"), err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showFailure, t],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visibleCommunities = useMemo(() => {
    let rows = communities;
    if (filter === "current") {
      rows = communities.filter((row) =>
        isCurrentMembership(row, activeCommunityId),
      );
    } else if (filter === "pending") {
      rows = communities.filter(
        (row) =>
          String(row.status || "").toLowerCase() === "pending" &&
          !membershipNeedsUnits(row),
      );
    } else if (filter !== "all") {
      rows = communities.filter(
        (row) => String(row.status || "").toLowerCase() === filter,
      );
    }

    return [...rows].sort((a, b) => {
      const aCurrent = isCurrentMembership(a, activeCommunityId) ? 0 : 1;
      const bCurrent = isCurrentMembership(b, activeCommunityId) ? 0 : 1;
      return aCurrent - bCurrent;
    });
  }, [communities, filter, activeCommunityId]);

  const switchable = useMemo(
    () =>
      communities.filter((row) => {
        if (membershipNeedsUnits(row)) return !isCurrentMembership(row, activeCommunityId);
        if (row.status !== "approved") return false;
        if (isCurrentMembership(row, activeCommunityId)) return false;
        const community = row.community;
        if (!community) return true;
        if (
          community.review_status === "pending" ||
          community.review_status === "rejected"
        )
          return false;
        if (community.status && community.status !== "active") return false;
        return true;
      }),
    [communities, activeCommunityId],
  );

  const emptyCopy = useMemo(() => {
    if (filter === "current") return t("myCommunity.emptyCurrent");
    if (filter === "pending") return t("myCommunity.emptyPending");
    if (filter === "approved") return t("myCommunity.emptyApproved");
    if (filter === "rejected") return t("myCommunity.emptyRejected");
    return t("myCommunity.emptyAll");
  }, [filter, t]);

  const joinAnother = () => {
    router.push({
      pathname: "/screens/region",
      params: { role: "resident", joinAnother: "1", returnTo: "my-community" },
    });
  };

  const canShowSwitch =
    !isCommunityAdmin(getCachedUser()) &&
    (canSwitchCommunities(getCachedUser()) || switchable.length > 0);

  const scrollBottomPad = Math.max(insets.bottom, sw(24)) + ADMIN_FAB_CLEARANCE;
  const footerPad = Math.max(insets.bottom, sw(12));

  const openSwitch = async () => {
    if (!canShowSwitch || switchable.length === 0) {
      await dialog.showError(
        t("myCommunity.switchCommunity"),
        t("myCommunity.noApprovedToSwitch"),
      );
      return;
    }
    setSwitchOpen(true);
  };

  const confirmSwitch = async (row) => {
    const name = row.community?.name || t("community.myCommunity");
    setSwitchOpen(false);
    if (membershipNeedsUnits(row)) {
      await promptAddUnitsBeforeSwitch(dialog, router, {
        communityId: row.community_id,
        communityName: name,
        returnTo: "my-community",
      });
      return;
    }
    const choice = await dialog.showConfirm(
      t("nav.switchCommunityTitle"),
      t("nav.switchCommunityBody", { name }),
      {
        confirmLabel: t("nav.switchCommunityConfirm"),
        cancelLabel: t("common.cancel"),
      },
    );
    if (choice !== "confirm") {
      setSwitchOpen(true);
      return;
    }

    setSwitching(true);
    const previousActiveId = activeCommunityId;
    const previousCommunities = communities;
    setActiveCommunityId(row.community_id);
    setCommunities((prev) =>
      prev.map((item) => ({
        ...item,
        is_active: Number(item.community_id) === Number(row.community_id),
      })),
    );
    try {
      const next = await switchActiveCommunity(row.community_id);
      await load({ silent: true });
      navigateAfterAuth(router, next, { mode: "login" });
    } catch (err) {
      setActiveCommunityId(previousActiveId);
      setCommunities(previousCommunities);
      await showSwitchCommunityFailure(
        dialog,
        router,
        t("nav.couldNotSwitchCommunity"),
        err,
        {
          communityId: row.community_id,
          communityName: row.community?.name,
          returnTo: "my-community",
        },
      );
    } finally {
      setSwitching(false);
    }
  };

  const rejectInvite = async (invite) => {
    const name = invite.community?.name || t("community.myCommunity");
    const choice = await dialog.showConfirm(
      t("myCommunity.rejectTitle"),
      t("myCommunity.rejectBody", { name }),
      {
        confirmLabel: t("myCommunity.reject"),
        cancelLabel: t("common.cancel"),
      },
    );
    if (choice !== "confirm") return;

    setSelectedInvite(null);
    await runAction({
      action: () => rejectMyInvitation(invite.id),
      successTitle: t("myCommunity.rejectedTitle"),
      onSuccess: async () => {
        await load({ silent: true });
        await showSuccess(
          t("myCommunity.rejectedTitle"),
          t("myCommunity.rejectedBody", { name }),
        );
      },
    });
  };

  const acceptInvite = (invite) => {
    setSelectedInvite(null);
    router.push({
      pathname: "/screens/invite-code",
      params: {
        role: "resident",
        inviteCode: invite.code ? String(invite.code) : undefined,
        communityId:
          invite.community?.id != null
            ? String(invite.community.id)
            : undefined,
        communityName: invite.community?.name
          ? String(invite.community.name)
          : undefined,
        returnTo: "my-community",
      },
    });
  };

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load({ silent: true });
      }}
      tintColor={T.teal}
      colors={[T.teal]}
    />
  );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("myCommunity.title")}
        onBack={() => router.back()}
      />

      <View style={styles.tabs}>
        {[
          {
            id: "communities",
            label: t("myCommunity.communitiesTab"),
            icon: "home",
          },
          {
            id: "invitations",
            label: t("myCommunity.invitationsTab"),
            icon: "mail",
            badge: invitations.length,
          },
        ].map((item) => {
          const active = tab === item.id;
          return (
            <Pressable
              key={item.id}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(item.id)}
            >
              <Feather
                name={item.icon}
                size={sf(14)}
                color={active ? T.navy : T.gray}
              />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {item.label}
              </Text>
              {item.badge > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {item.badge > 99 ? "99+" : item.badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.navy} />
        </View>
      ) : tab === "communities" ? (
        <View style={styles.body}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((item) => {
              const active = filter === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.85}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(item.key)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}
                  >
                    {t(item.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.listContent}
            refreshControl={refreshControl}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.listHeading}>
              {t("myCommunity.yourMemberships")}
            </Text>

            {visibleCommunities.length === 0 ? (
              <EmptyState
                icon="home"
                title={emptyCopy}
                body={t("myCommunity.joinCtaBody")}
              />
            ) : (
              visibleCommunities.map((row) => (
                <CommunityCard
                  key={row.id || row.community_id}
                  row={row}
                  activeCommunityId={activeCommunityId}
                  t={t}
                />
              ))
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: footerPad }]}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={joinAnother}
              accessibilityRole="button"
              accessibilityLabel={t("myCommunity.joinAnother")}
              style={styles.joinBtn}
            >
              <View style={styles.joinIcon}>
                <Feather name="plus" size={sf(14)} color="#FFFFFF" />
              </View>
              <Text style={styles.joinBtnText} numberOfLines={1}>
                {t("myCommunity.joinAnother")}
              </Text>
            </TouchableOpacity>

            {canShowSwitch ? (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={switchable.length === 0}
                onPress={openSwitch}
                accessibilityRole="button"
                accessibilityLabel={t("myCommunity.switchCommunity")}
                style={[
                  styles.switchBtn,
                  switchable.length === 0 && styles.btnDisabled,
                ]}
              >
                <Feather name="repeat" size={sf(16)} color="#1B4F8A" />
                <Text style={styles.switchBtnText}>
                  {t("myCommunity.switchCommunity")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: scrollBottomPad },
          ]}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          {invitations.length === 0 ? (
            <EmptyState
              icon="mail"
              title={t("myCommunity.emptyInvitations")}
              body={t("myCommunity.emptyInvitationsBody")}
            />
          ) : (
            <>
              <View style={styles.inviteSummary}>
                <View style={styles.inviteSummaryIcon}>
                  <Feather name="inbox" size={sf(16)} color="#1B4F8A" />
                </View>
                <View style={styles.inviteSummaryCopy}>
                  <Text style={styles.inviteSummaryTitle}>
                    {t("myCommunity.invitationsWaiting", {
                      count: invitations.length,
                    })}
                  </Text>
                  <Text style={styles.inviteSummaryBody}>
                    {t("myCommunity.tapForDetails")}
                  </Text>
                </View>
              </View>

              {invitations.map((invite) => (
                <InvitationCard
                  key={invite.id}
                  invite={invite}
                  t={t}
                  onPress={() => setSelectedInvite(invite)}
                  onAccept={() => acceptInvite(invite)}
                  onReject={() => rejectInvite(invite)}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      <InviteDetailSheet
        invite={selectedInvite}
        t={t}
        onClose={() => setSelectedInvite(null)}
        onAccept={() => acceptInvite(selectedInvite)}
        onReject={() => rejectInvite(selectedInvite)}
      />

      <SwitchCommunitySheet
        visible={switchOpen}
        communities={switchable}
        switching={switching}
        onClose={() => setSwitchOpen(false)}
        onSelect={confirmSwitch}
      />
    </SafeAreaView>
  );
}

const AVATAR = sw(46);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: T.canvas,
  },
  flex: {
    flex: 1,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: sw(16),
    marginTop: sw(12),
    marginBottom: sw(2),
    padding: sw(4),
    borderRadius: sw(14),
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(6),
    paddingVertical: sw(10),
    borderRadius: sw(10),
  },
  tabActive: {
    backgroundColor: T.mint,
  },
  tabText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: T.gray,
  },
  tabTextActive: {
    color: T.navy,
    fontFamily: Fonts.bold,
  },
  tabBadge: {
    minWidth: sw(18),
    height: sw(18),
    borderRadius: sw(9),
    paddingHorizontal: sw(5),
    backgroundColor: T.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: T.white,
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: sw(50),
    marginTop: sw(10),
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: sw(16),
    paddingRight: sw(28),
    paddingVertical: sw(2),
  },
  filterChip: {
    height: sw(34),
    paddingHorizontal: sw(14),
    marginEnd: sw(8),
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: "#1B4F8A",
    borderColor: "#1B4F8A",
  },
  filterChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#6B7280",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
  },
  listContent: {
    paddingHorizontal: sw(16),
    paddingTop: sw(10),
    paddingBottom: sw(16),
    flexGrow: 1,
  },
  listHeading: {
    marginBottom: sw(10),
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    letterSpacing: 0.2,
    color: "#1B4F8A",
  },
  footer: {
    flexShrink: 0,
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: sw(16),
    paddingTop: sw(12),
  },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: sw(52),
    paddingHorizontal: sw(16),
    gap: sw(8),
    backgroundColor: "#1B4F8A",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#163F6E",
    marginBottom: sw(10),
  },
  joinIcon: {
    width: sw(20),
    height: sw(20),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  joinBtnText: {
    flexShrink: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#FFFFFF",
    textAlign: "center",
    includeFontPadding: false,
  },
  switchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: sw(52),
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1.5,
    borderColor: "#1B4F8A",
  },
  switchBtnText: {
    marginLeft: sw(8),
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#1B4F8A",
  },
  sectionHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: T.gray,
    marginBottom: sw(10),
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: sw(10),
    overflow: "hidden",
    flexDirection: "row",
  },
  cardActive: {
    borderWidth: 1.5,
    borderColor: "#1B4F8A",
    backgroundColor: "#F4FBFD",
    ...rnShadow({
      color: "#1B4F8A",
      opacity: 0.1,
      radius: 10,
      offset: { width: 0, height: 2 },
      elevation: 3,
    }),
  },

  cardInner: {
    flex: 1,
    paddingVertical: sw(14),
    paddingHorizontal: sw(12),
    minWidth: 0,
  },
  cardPressed: {
    backgroundColor: "#F8FBFF",
  },
  inviteCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1.5,
    borderColor: "#1B4F8A",
    marginBottom: sw(12),
    overflow: "hidden",
    ...rnShadow({
      color: "#1B4F8A",
      opacity: 0.08,
      radius: 10,
      offset: { width: 0, height: 2 },
      elevation: 2,
    }),
  },

  inviteCardBody: {
    flex: 1,
    padding: sw(14),
    minWidth: 0,
  },
  invitePendingPill: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    flexShrink: 0,
  },
  invitePendingPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#B45309",
  },
  inviteMetaChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: sw(8),
    gap: sw(6),
  },
  inviteMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "100%",
    backgroundColor: "#F4FBFD",
    borderWidth: 1,
    borderColor: "#D8E8F2",
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
  },
  inviteMetaChipText: {
    marginLeft: sw(5),
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#1B4F8A",
    maxWidth: sw(180),
  },
  inviteTapHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: sw(10),
  },
  inviteTapHintText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#94A3B8",
    marginRight: sw(4),
  },
  inviteSummary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: sw(12),
    marginBottom: sw(14),
  },
  inviteSummaryIcon: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: sw(10),
    flexShrink: 0,
  },
  inviteSummaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  inviteSummaryTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#1B4F8A",
  },
  inviteSummaryBody: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#6B7280",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: sw(13),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginEnd: sw(12),
    flexShrink: 0,
  },
  avatarActive: {
    backgroundColor: T.navy,
  },
  avatarText: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    color: T.deepTeal,
  },
  avatarTextActive: {
    color: T.white,
  },
  inviteAvatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: sw(13),
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "#A7E4DE",
    alignItems: "center",
    justifyContent: "center",
    marginEnd: sw(12),
    flexShrink: 0,
  },
  cardCopy: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(8),
  },
  cardTitle: {
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    color: T.navy,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    flexShrink: 0,
  },
  statusPillActive: {
    borderWidth: 1,
    borderColor: "#A7E4DE",
  },
  statusPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: sw(8),
  },
  metaIconWrap: {
    width: sw(18),
    height: sf(18),
    alignItems: "center",
    justifyContent: "center",
    marginRight: sw(6),
    flexShrink: 0,
  },
  cardMeta: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: "#6B7280",
    includeFontPadding: false,
  },
  cardMetaActive: {
    color: "#475569",
  },
  currentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: sw(10),
    alignSelf: "flex-start",
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "#99E2D8",
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
  },
  currentDot: {
    width: sw(7),
    height: sw(7),
    borderRadius: 999,
    backgroundColor: "#14B8A6",
    marginEnd: sw(6),
  },
  currentText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(14),
    color: "#0D9488",
  },
  inviteDetail: {
    marginTop: sw(5),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.gray,
  },
  expiryChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: sw(8),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
  },
  expiryText: {
    marginLeft: sw(5),
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: "#B45309",
  },
  inviteActions: {
    flexDirection: "row",
    marginTop: sw(14),
    paddingTop: sw(12),
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  empty: {
    alignItems: "center",
    paddingVertical: sw(56),
    paddingHorizontal: sw(24),
  },
  emptyIcon: {
    width: sw(52),
    height: sw(52),
    borderRadius: sw(16),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(14),
  },
  emptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    lineHeight: sf(22),
    color: T.navy,
    textAlign: "center",
  },
  emptyBody: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: T.gray,
    textAlign: "center",
  },
  btnDisabled: {
    opacity: 0.45,
  },
  rejectBtn: {
    flex: 1,
    height: sw(48),
    marginRight: sw(8),
    borderRadius: sw(12),
    borderWidth: 1.5,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnText: {
    marginLeft: sw(6),
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#B91C1C",
  },
  acceptBtn: {
    flex: 1,
    height: sw(48),
    borderRadius: sw(12),
    borderWidth: 1.5,
    borderColor: "#163F6E",
    backgroundColor: "#1B4F8A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtnText: {
    marginLeft: sw(6),
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#FFFFFF",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: T.white,
    borderTopStartRadius: sw(24),
    borderTopEndRadius: sw(24),
    paddingHorizontal: sw(20),
    paddingTop: sw(10),
  },
  handleHit: {
    alignItems: "center",
    paddingVertical: sw(6),
    marginBottom: sw(4),
  },
  handle: {
    width: sw(40),
    height: sw(4),
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: sw(12),
  },
  sheetHeaderCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: sw(2),
    paddingEnd: sw(10),
  },
  sheetTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    lineHeight: sf(22),
    color: T.navy,
  },
  sheetSub: {
    marginTop: sw(3),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: T.gray,
  },
  closeBtn: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.canvas,
    flexShrink: 0,
    marginTop: sw(4),
  },
  sheetBody: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#334155",
    marginBottom: sw(12),
  },
  detailList: {
    gap: sw(10),
    marginBottom: sw(12),
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(8),
  },
  detailText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: T.gray,
  },
  codeBox: {
    backgroundColor: T.canvas,
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: T.border,
    padding: sw(14),
    marginBottom: sw(14),
  },
  codeLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: T.gray,
  },
  codeValue: {
    marginTop: sw(4),
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    letterSpacing: 1.2,
    color: T.navy,
  },
  sheetActions: {
    flexDirection: "row",
    gap: sw(10),
  },
});
