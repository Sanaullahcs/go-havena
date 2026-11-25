import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  AppState,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "../../../i18n";
import { getLocaleForLang } from "../../../hooks/use-app-locale";
import { Fonts } from "../../../constants/font";
import { Colors, SolidFills } from "../../../constants/tokens";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import { fetchMe, fetchMembershipReviewStatus } from "../../../services/auth-api";
import { confirmSignOut } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { fetchGuestAccessStatus } from "../../../services/guests-api";
import {
  GUEST_ACCESS_EXPIRED_MESSAGE,
  GUEST_ACCESS_NOT_STARTED_MESSAGE,
  isGuestAccessWindowActive,
  msUntil,
  revokeGuestSessionAndRedirect,
} from "../../../utils/guest-access-schedule";
import {
  canAccessDashboard,
  getPendingApprovalDetails,
  getPrimaryMembership,
  getRejectedApprovalDetails,
  hasPendingCommunityRequest,
  isCommunityAdminRole,
  isGuestUser,
  awaitsCommunityAdminApproval,
  needsSystemApprovalWait,
  awaitsCommunityReviewOnly,
  mergeRejectionIntoUser,
  mergeReviewSnapshotIntoUser,
  isRejectedStatusError,
  resolveOnboardingReviewState,
} from "../../../services/community-access";
import {
  navigateAfterAuth,
  Routes,
  needsCompleteProfile,
  getCompleteProfileParams,
} from "../../../constants/onboarding-routes";
import { getUser, getToken, setSession } from "../../../services/auth-session";
import { rnShadow } from "../../../utils/shadow";


async function persistSessionUser(user) {
  const token = await getToken();
  if (token && user) {
    await setSession({ token, user });
  }
}

function formatGuestAccessWindow(startsAt, endsAt) {
  const locale = getLocaleForLang(i18n.language);
  const start = startsAt
    ? new Date(startsAt).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const end = endsAt
    ? new Date(endsAt).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })
    : "—";
  return `${start} → ${end}`;
}

function guestHostLabel(invitation) {
  if (!invitation) return null;
  if (invitation.resident) {
    const name = invitation.resident.display_name || invitation.resident.name;
    return invitation.resident.unit_number
      ? `${name} · ${i18n.t("guests.unitLabel", { unit: invitation.resident.unit_number })}`
      : name;
  }
  if (invitation.invited_by) {
    return invitation.invited_by.display_name || invitation.invited_by.name;
  }
  if (invitation.host_name) {
    return invitation.host_unit
      ? `${invitation.host_name} · ${i18n.t("guests.unitLabel", { unit: invitation.host_unit })}`
      : invitation.host_name;
  }
  return null;
}

function readParam(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function guestRejectedSnapshotKeyFromParams(params) {
  if (readParam(params.rejected) !== "1" || readParam(params.guest) !== "1") {
    return null;
  }

  return [
    readParam(params.rejection_reason),
    readParam(params.community_name),
    readParam(params.guest_name),
    readParam(params.invite_code),
    readParam(params.starts_at),
    readParam(params.ends_at),
    readParam(params.host_name),
    readParam(params.host_unit),
    readParam(params.email),
    readParam(params.invitation_type),
  ].join("\u0001");
}

function guestRejectedSnapshotFromParams(params) {
  if (readParam(params.rejected) !== "1" || readParam(params.guest) !== "1") {
    return null;
  }

  const communityName = readParam(params.community_name).trim();
  const rejectionReason = readParam(params.rejection_reason).trim();
  const hostName = readParam(params.host_name).trim();
  const hostUnit = readParam(params.host_unit).trim();

  return {
    status: "rejected",
    community_name: communityName || null,
    guest_name: readParam(params.guest_name).trim() || null,
    guest_email: readParam(params.email).trim() || null,
    invite_code: readParam(params.invite_code).trim() || null,
    starts_at: readParam(params.starts_at).trim() || null,
    ends_at: readParam(params.ends_at).trim() || null,
    invitation_type: readParam(params.invitation_type).trim() || null,
    rejection_reason: rejectionReason || null,
    host_name: hostName || null,
    host_unit: hostUnit || null,
    invited_by: hostName ? { name: hostName, display_name: hostName } : null,
    resident: hostName
      ? { name: hostName, display_name: hostName, unit_number: hostUnit || null }
      : null,
  };
}

function applyGuestRejectedSnapshot(setters, snapshot) {
  setters.setIsGuestMode(true);
  setters.setReviewState("rejected");
  setters.setGuestStatusNote(null);
  setters.setRejectionReason(snapshot.rejection_reason ?? null);
  setters.setGuestInvitation(snapshot);
  setters.setCommunity(
    snapshot.community_name
      ? { name: snapshot.community_name, title: snapshot.community_name }
      : null,
  );
}

function buildGuestTimeline(reviewState, t) {
  if (reviewState === "rejected") {
    return [
      { id: "email", label: t("guests.emailVerified"), status: "done" },
      { id: "invite", label: t("guests.inviteCodeVerified"), status: "done" },
      { id: "approval", label: t("guests.hostApproval"), status: "failed" },
      { id: "access", label: t("guests.communityAccess"), status: "upcoming" },
    ];
  }

  return [
    { id: "email", label: t("guests.emailVerified"), status: "done" },
    { id: "invite", label: t("guests.inviteCodeVerified"), status: "done" },
    { id: "approval", label: t("guests.hostApproval"), status: "current" },
    { id: "access", label: t("guests.communityAccess"), status: "upcoming" },
  ];
}

function buildTimeline({
  reviewState,
  approvalKind,
  isAdminApplicant,
  adminApprovedAwaitingCommunity,
  rejectedBy,
  t,
}) {
  if (reviewState === "approved" && approvalKind === "membership_approval") {
    return [
      { id: "region", label: t("guests.regionCommunitySelected"), status: "done" },
      { id: "profile", label: t("guests.profileSubmitted"), status: "done" },
      { id: "approval", label: t("guests.communityAdminApproval"), status: "done" },
      { id: "access", label: t("guests.fullCommunityAccess"), status: "done" },
    ];
  }

  if (reviewState === "rejected") {
    if (approvalKind === "membership_approval") {
      return [
        { id: "profile", label: t("guests.profileSubmitted"), status: "done" },
        {
          id: "review",
          label:
            rejectedBy === "system_admin"
              ? t("guests.systemAdminReview")
              : t("guests.communityAdminReview"),
          status: "failed",
        },
        { id: "access", label: t("guests.communityAccess"), status: "upcoming" },
      ];
    }

    return [
      { id: "submitted", label: t("guests.requestSubmitted"), status: "done" },
      { id: "review", label: t("guests.systemAdminReview"), status: "failed" },
      { id: "active", label: t("guests.communityActivated"), status: "upcoming" },
    ];
  }

  if (approvalKind === "membership_approval") {
    return [
      { id: "region", label: t("guests.regionCommunitySelected"), status: "done" },
      { id: "profile", label: t("guests.profileSubmitted"), status: "done" },
      { id: "approval", label: t("guests.communityAdminApproval"), status: "current" },
      { id: "access", label: t("guests.fullCommunityAccess"), status: "upcoming" },
    ];
  }

  if (isAdminApplicant) {
    if (adminApprovedAwaitingCommunity) {
      return [
        { id: "submitted", label: t("guests.applicationSubmitted"), status: "done" },
        { id: "account", label: t("guests.adminAccountApproved"), status: "done" },
        { id: "community", label: t("guests.communityRequestReview"), status: "current" },
        { id: "dashboard", label: t("guests.dashboardAccess"), status: "upcoming" },
      ];
    }

    return [
      { id: "submitted", label: t("guests.applicationSubmitted"), status: "done" },
      { id: "account", label: t("guests.adminAccountReview"), status: "current" },
      { id: "community", label: t("guests.communityRequestReview"), status: "current" },
      { id: "dashboard", label: t("guests.dashboardAccess"), status: "upcoming" },
    ];
  }

  return [
    { id: "submitted", label: t("guests.requestSubmitted"), status: "done" },
    { id: "review", label: t("guests.systemAdminReview"), status: "current" },
    { id: "active", label: t("guests.communityActivated"), status: "upcoming" },
    { id: "join", label: t("guests.residentsCanJoin"), status: "upcoming" },
  ];
}

function ReviewTimeline({ steps, reviewState }) {
  const { t } = useTranslation();
  const allDone = reviewState === "approved";

  return (
    <View
      style={[
        styles.timelineCard,
        reviewState === "approved" && styles.timelineCardApproved,
        reviewState === "rejected" && styles.timelineCardRejected,
      ]}
    >
      <Text style={styles.sectionTitle}>
        {reviewState === "approved" ? t("guests.allStepsComplete") : t("guests.reviewProgress")}
      </Text>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const iconName =
          step.status === "done"
            ? "checkmark"
            : step.status === "failed"
              ? "close"
              : step.status === "current"
                ? "time-outline"
                : "ellipse-outline";
        const dotStyle =
          step.status === "done"
            ? allDone
              ? styles.timelineDotApproved
              : styles.timelineDotDone
            : step.status === "failed"
              ? styles.timelineDotFailed
              : step.status === "current"
                ? styles.timelineDotCurrent
                : styles.timelineDotUpcoming;
        const labelStyle =
          step.status === "done"
            ? allDone
              ? styles.timelineLabelApproved
              : styles.timelineLabelDone
            : step.status === "failed"
              ? styles.timelineLabelFailed
              : step.status === "current"
                ? styles.timelineLabelCurrent
                : styles.timelineLabelUpcoming;

        return (
          <View key={step.id} style={styles.timelineRow}>
            <View style={styles.timelineRail}>
              <View style={[styles.timelineDot, dotStyle]}>
                <Ionicons
                  name={iconName}
                  size={step.status === "upcoming" ? 10 : 14}
                  color={
                    step.status === "upcoming"
                      ? "#98A2B3"
                      : step.status === "current"
                        ? "#14B8A6"
                        : "#FFFFFF"
                  }
                />
              </View>
              {!isLast ? (
                <View
                  style={[
                    styles.timelineLine,
                    step.status === "done" &&
                      (allDone ? styles.timelineLineApproved : styles.timelineLineDone),
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.timelineContent}>
              <Text style={[styles.timelineLabel, labelStyle]}>{step.label}</Text>
              {step.status === "current" ? (
                <Text style={styles.timelineHint}>{t("guests.inProgressHint")}</Text>
              ) : null}
              {step.status === "failed" ? (
                <Text style={styles.timelineFailedHint}>{t("guests.requiresAttention")}</Text>
              ) : null}
              {step.status === "done" && allDone ? (
                <Text style={styles.timelineApprovedHint}>{t("guests.complete")}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function PendingCommunityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const routeParams = useLocalSearchParams();
  const { role = "resident", guest: guestParam, unitPackage: unitPackageParam } = routeParams;
  const isUnitPackagePending = readParam(unitPackageParam) === "1";
  const guestRejectedSnapshotKey = useMemo(
    () => guestRejectedSnapshotKeyFromParams(routeParams),
    [
      routeParams.rejected,
      routeParams.guest,
      routeParams.rejection_reason,
      routeParams.community_name,
      routeParams.guest_name,
      routeParams.invite_code,
      routeParams.starts_at,
      routeParams.ends_at,
      routeParams.host_name,
      routeParams.host_unit,
      routeParams.email,
      routeParams.invitation_type,
    ],
  );
  const guestRejectedSnapshot = useMemo(
    () => (guestRejectedSnapshotKey ? guestRejectedSnapshotFromParams(routeParams) : null),
    [guestRejectedSnapshotKey, routeParams],
  );
  const isStaticGuestRejectedView = guestRejectedSnapshotKey !== null;
  const staticGuestRejectedReady = useRef(isStaticGuestRejectedView);
  const [loading, setLoading] = useState(() => !guestRejectedSnapshotKey);
  const [refreshing, setRefreshing] = useState(false);
  const [community, setCommunity] = useState(() =>
    guestRejectedSnapshot?.community_name
      ? { name: guestRejectedSnapshot.community_name, title: guestRejectedSnapshot.community_name }
      : null,
  );
  const [approvalKind, setApprovalKind] = useState(null);
  const [rejectionReason, setRejectionReason] = useState(
    () => guestRejectedSnapshot?.rejection_reason ?? null,
  );
  const [rejectedBy, setRejectedBy] = useState(null);
  const [reviewState, setReviewState] = useState(() =>
    guestRejectedSnapshotKey ? "rejected" : "pending",
  );
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdminApplicant, setIsAdminApplicant] = useState(false);
  const [adminApprovedAwaitingCommunity, setAdminApprovedAwaitingCommunity] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(() => guestParam === "1" || Boolean(guestRejectedSnapshotKey));
  const [guestInvitation, setGuestInvitation] = useState(() => guestRejectedSnapshot);
  const [guestStatusNote, setGuestStatusNote] = useState(null);

  const syncGuestInvitation = useCallback(
    async (user) => {
      const invitation = await fetchGuestAccessStatus();
      setGuestInvitation(invitation);
      setIsGuestMode(true);
      setCurrentUser(user);
      setCommunity(
        invitation.community_name
          ? { name: invitation.community_name, title: invitation.community_name }
          : null,
      );
      setRejectionReason(invitation.rejection_reason ?? null);

      if (invitation.status === "active") {
        let freshUser = user;
        try {
          freshUser = await fetchMe();
          await persistSessionUser(freshUser);
        } catch {
          // use cached user if refresh fails
        }

        if (freshUser?.guest_access?.can_access_dashboard) {
          navigateAfterAuth(router, freshUser);
          return true;
        }

        setReviewState("pending");
        setGuestStatusNote(GUEST_ACCESS_NOT_STARTED_MESSAGE);
        return true;
      }

      if (invitation.status === "pending_approval") {
        let freshUser = user;
        try {
          freshUser = await fetchMe();
          await persistSessionUser(freshUser);
        } catch {
          // use cached user if refresh fails
        }

        if (!isGuestAccessWindowActive(freshUser?.guest_access ?? invitation)) {
          setReviewState("pending");
          setGuestStatusNote(GUEST_ACCESS_NOT_STARTED_MESSAGE);
          return true;
        }

        setReviewState("pending");
        setGuestStatusNote(null);
        return true;
      }

      if (invitation.status === "rejected") {
        setReviewState("rejected");
        setGuestStatusNote(null);
        return true;
      }

      if (invitation.status === "revoked") {
        await revokeGuestSessionAndRedirect(router, { notice: "GUEST_ACCESS_REVOKED" });
        return true;
      }

      if (invitation.status === "expired") {
        setReviewState("rejected");
        setGuestStatusNote(GUEST_ACCESS_EXPIRED_MESSAGE);
        return true;
      }

      setReviewState("pending");
      setGuestStatusNote(t("guests.completeInviteVerification"));
      return true;
    },
    [router],
  );

  const syncFromUser = useCallback(
    (user, reviewSnapshot = null) => {
      if (!user) return false;

      if (needsCompleteProfile(user)) {
        router.replace({
          pathname: Routes.COMPLETE_PROFILE,
          params: getCompleteProfileParams(user, role),
        });
        return true;
      }

      setCurrentUser(user);
      setIsAdminApplicant(isCommunityAdminRole(user));
      setAdminApprovedAwaitingCommunity(awaitsCommunityReviewOnly(user));

      // Self-signup initial unit package: stay on Pending Approval until admin approves.
      if (user.pending_unit_package) {
        setReviewState("pending");
        setApprovalKind("unit_package");
        setRejectionReason(null);
        setRejectedBy(null);
        const membership = getPrimaryMembership(user);
        if (membership?.community) setCommunity(membership.community);
        return true;
      }

      const review = resolveOnboardingReviewState(user, reviewSnapshot);
      if (review && ["pending", "rejected", "approved"].includes(review.reviewState)) {
        const isResidentMembershipFlow =
          !isCommunityAdminRole(user) || review.kind === "community_request";

        if (isResidentMembershipFlow || review.reviewState !== "pending") {
          setReviewState(review.reviewState);
          setApprovalKind(review.kind ?? "membership_approval");
          if (review.community) setCommunity(review.community);
          setRejectionReason(review.rejection_reason ?? null);
          setRejectedBy(review.rejected_by ?? null);

          if (review.reviewState === "approved" && canAccessDashboard(user)) {
            navigateAfterAuth(router, user);
            return true;
          }

          if (review.reviewState !== "approved") {
            return true;
          }
        }
      }

      const rejectedDetails = getRejectedApprovalDetails(user);
      if (rejectedDetails) {
        setReviewState("rejected");
        setApprovalKind(rejectedDetails.kind);
        setCommunity(rejectedDetails.community);
        setRejectionReason(rejectedDetails.rejection_reason ?? null);
        setRejectedBy(rejectedDetails.rejected_by ?? null);
        return true;
      }

      const pendingDetails = getPendingApprovalDetails(user);
      if (pendingDetails) {
        setReviewState("pending");
        setRejectionReason(null);
        setRejectedBy(null);
        setApprovalKind(pendingDetails.kind);
        setCommunity(pendingDetails.community);
        return true;
      }

      if (canAccessDashboard(user)) {
        navigateAfterAuth(router, user);
        return true;
      }
      if (needsSystemApprovalWait(user)) {
        if (awaitsCommunityAdminApproval(user)) {
          navigateAfterAuth(router, user, {
            role: isCommunityAdminRole(user) ? "admin" : role,
          });
          return true;
        }

        const membership = getPrimaryMembership(user);
        const linkedCommunity = membership?.community;
        if (linkedCommunity && membership?.status !== "rejected") {
          setReviewState("pending");
          setApprovalKind(
            hasPendingCommunityRequest(user) ? "community_request" : "membership_approval",
          );
          setCommunity(linkedCommunity);
          return true;
        }

        navigateAfterAuth(router, user, { role });
        return true;
      }
      return false;
    },
    [router, role],
  );

  const refresh = useCallback(
    async (silent = false) => {
      const token = await getToken();
      const useStaticRejectedSnapshot = isStaticGuestRejectedView && !token;

      if (useStaticRejectedSnapshot) {
        if (!staticGuestRejectedReady.current) {
          applyGuestRejectedSnapshot(
            {
              setIsGuestMode,
              setReviewState,
              setGuestStatusNote,
              setRejectionReason,
              setGuestInvitation,
              setCommunity,
            },
            guestRejectedSnapshot,
          );
          staticGuestRejectedReady.current = true;
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {

        let user = null;
        try {
          user = await fetchMe();
        } catch (err) {
          user = await getUser();
          if (user && isRejectedStatusError(err)) {
            user = mergeRejectionIntoUser(user, err);
            await persistSessionUser(user);
          }
        }

        if (guestParam === "1" || (user && isGuestUser(user))) {
          const guestUser = user ?? (await getUser());
          if (guestUser && (await syncGuestInvitation(guestUser))) {
            return;
          }
          if (guestParam === "1") {
            return;
          }
        }

        let reviewSnapshot = null;

        try {
          reviewSnapshot = await fetchMembershipReviewStatus();
        } catch (reviewErr) {
          const cached = await getUser();
          if (cached && isRejectedStatusError(reviewErr)) {
            const merged = mergeRejectionIntoUser(cached, reviewErr);
            await persistSessionUser(merged);
            syncFromUser(merged);
            return;
          }
        }

        if (user && reviewSnapshot) {
          user = mergeReviewSnapshotIntoUser(user, reviewSnapshot);
          await persistSessionUser(user);
        }

        if (user && syncFromUser(user, reviewSnapshot)) {
          return;
        }

        if (user) {
          navigateAfterAuth(router, user, { role });
        }
      } catch {
        const cached = await getUser();
        if (cached && syncFromUser(cached)) {
          return;
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [role, router, syncFromUser, guestParam, syncGuestInvitation, guestRejectedSnapshot, isStaticGuestRejectedView],
  );

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    refreshRef.current();
  }, [guestRejectedSnapshotKey, guestParam, role]);

  useFocusEffect(
    useCallback(() => {
      if (isGuestMode || isStaticGuestRejectedView || reviewState === "rejected") {
        return undefined;
      }
      refresh(true);
      return undefined;
    }, [isGuestMode, isStaticGuestRejectedView, reviewState, refresh]),
  );

  useEffect(() => {
    if (isGuestMode || reviewState !== "pending") return undefined;

    const intervalId = setInterval(() => {
      refresh(true);
    }, 15000);

    return () => clearInterval(intervalId);
  }, [isGuestMode, reviewState, refresh]);

  useEffect(() => {
    if (isGuestMode) return undefined;

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh(true);
      }
    });

    return () => sub.remove();
  }, [isGuestMode, refresh]);

  useEffect(() => {
    if (!isGuestMode || reviewState === "rejected" || isStaticGuestRejectedView) return undefined;

    let pollTimer;
    let expiryTimer;
    let cancelled = false;

    const scheduleRefresh = (delayMs) => {
      if (delayMs == null || delayMs <= 0) return;
      pollTimer = setTimeout(() => {
        if (!cancelled) refresh(true);
      }, Math.min(delayMs, 60000));
    };

    (async () => {
      const user = currentUser ?? (await getUser());
      const guestAccess = user?.guest_access;
      const startsIn = msUntil(guestAccess?.starts_at ?? guestInvitation?.starts_at);
      const endsIn = msUntil(guestAccess?.ends_at ?? guestInvitation?.ends_at);

      if (endsIn != null && endsIn <= 0) {
        if (!cancelled) {
          await revokeGuestSessionAndRedirect(router);
        }
        return;
      }

      if (endsIn != null && endsIn > 0) {
        expiryTimer = setTimeout(async () => {
          if (!cancelled) {
            await revokeGuestSessionAndRedirect(router);
          }
        }, endsIn);
      }

      if (startsIn != null && startsIn > 0) {
        scheduleRefresh(startsIn);
      }
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, [currentUser, guestInvitation, isGuestMode, isStaticGuestRejectedView, reviewState, refresh, router]);

  const handleSignOut = () => confirmSignOut(dialog);

  const handleBackToGuestSignIn = () => {
    router.replace("/screens/guest-login");
  };

  const showGuestRejectedSignIn = Boolean(isStaticGuestRejectedView && !currentUser);

  const handleEnterCommunity = useCallback(() => {
    if (currentUser) {
      navigateAfterAuth(router, currentUser);
    } else {
      refresh(true);
    }
  }, [currentUser, refresh, router]);

  const screenTitle = isGuestMode
    ? reviewState === "rejected"
      ? guestStatusNote?.includes("expired")
        ? t("guests.guestAccessExpired")
        : guestStatusNote?.includes("revoked")
          ? t("guests.guestAccessRevoked")
          : t("guests.guestAccessDeclined")
      : guestStatusNote === GUEST_ACCESS_NOT_STARTED_MESSAGE
        ? t("guests.guestAccessNotStarted")
      : t("guests.guestAccessUnderReview")
    : reviewState === "approved"
      ? t("guests.membershipApproved")
      : reviewState === "rejected"
        ? approvalKind === "membership_approval"
          ? t("guests.applicationDeclined")
          : t("guests.communityRequestDeclined")
        : approvalKind === "membership_approval"
          ? t("guests.membershipUnderReview")
          : isAdminApplicant
            ? t("guests.applicationUnderReview")
            : t("guests.communityUnderReview");

  const screenSubtitle = isGuestMode
    ? reviewState === "rejected"
      ? guestStatusNote ||
        (rejectionReason?.trim()
          ? t("guests.guestDeclinedWithReason")
          : t("guests.guestDeclinedNoReason"))
      : guestStatusNote === GUEST_ACCESS_NOT_STARTED_MESSAGE
        ? GUEST_ACCESS_NOT_STARTED_MESSAGE
      : guestInvitation?.invitation_type === "admin"
        ? t("guests.guestPendingAdminApproval")
        : t("guests.guestPendingResidentApproval")
    : reviewState === "approved"
      ? t("guests.membershipApprovedSubtitle")
      : reviewState === "rejected"
        ? approvalKind === "membership_approval"
          ? rejectedBy === "system_admin"
            ? t("guests.rejectedBySystemAdmin")
            : t("guests.rejectedByCommunityAdmin")
          : t("guests.communityRequestNotApproved")
        : approvalKind === "membership_approval"
          ? t("guests.membershipUnderReviewSubtitle")
          : isAdminApplicant
            ? adminApprovedAwaitingCommunity
              ? t("guests.adminApprovedAwaitingCommunity")
              : t("guests.adminApplicationUnderReview")
            : t("guests.communityRequestUnderReview");

  const statusBadge =
    reviewState === "approved"
      ? { label: t("guests.approved"), tone: "success" }
      : reviewState === "rejected"
        ? { label: t("guests.declined"), tone: "danger" }
        : { label: t("guests.underReview"), tone: "pending" };

  const timelineSteps = useMemo(
    () =>
      isGuestMode
        ? buildGuestTimeline(reviewState, t)
        : buildTimeline({
            reviewState,
            approvalKind,
            isAdminApplicant,
            adminApprovedAwaitingCommunity,
            rejectedBy,
            t,
          }),
    [
      isGuestMode,
      reviewState,
      approvalKind,
      isAdminApplicant,
      adminApprovedAwaitingCommunity,
      rejectedBy,
    ],
  );

  const helpItems = isGuestMode
    ? reviewState === "rejected"
      ? [
          {
            icon: "mail-outline",
            title: t("guests.contactYourHost"),
            body: t("guests.contactYourHostBody"),
          },
          {
            icon: "log-in-outline",
            title: t("guests.needNewInvite"),
            body: t("guests.needNewInviteBody"),
          },
        ]
      : [
          {
            icon: "notifications-outline",
            title: t("guests.wellNotifyYou"),
            body: t("guests.guestNotifyBody"),
          },
          {
            icon: "refresh-outline",
            title: t("guests.checkStatusAnytime"),
            body: t("guests.checkStatusAnytimeBody"),
          },
          {
            icon: "eye-outline",
            title: t("guests.readOnlyGuestAccess"),
            body: t("guests.readOnlyGuestAccessBody"),
          },
        ]
    : reviewState === "approved"
      ? [
          {
            icon: "home-outline",
            title: t("guests.welcomeToCommunity"),
            body: t("guests.welcomeToCommunityBody"),
          },
          {
            icon: "person-outline",
            title: t("guests.completeProfileAnytime"),
            body: t("guests.completeProfileAnytimeBody"),
          },
        ]
      : reviewState === "rejected"
        ? [
            {
              icon: "create-outline",
              title: t("guests.updateYourDetails"),
              body: t("guests.updateYourDetailsBody"),
            },
            {
              icon: "mail-outline",
              title: t("guests.needHelp"),
              body: t("guests.needHelpBody"),
            },
          ]
        : [
            {
              icon: "notifications-outline",
              title: t("guests.wellNotifyYou"),
              body: t("guests.notifyBody"),
            },
            {
              icon: "refresh-outline",
              title: t("guests.pullToRefresh"),
              body: t("guests.pullToRefreshBody"),
            },
            {
              icon: "time-outline",
              title: t("guests.typicalReviewTime"),
              body: t("guests.typicalReviewTimeBody"),
            },
          ];

  const heroBg =
    reviewState === "approved"
      ? "#ECFDF5"
      : reviewState === "rejected"
        ? "#FEF2F2"
        : SolidFills.authWash;

  const heroIconStyle =
    reviewState === "approved"
      ? styles.heroIconApproved
      : reviewState === "rejected"
        ? styles.heroIconRejected
        : styles.heroIconPending;

  const heroIconName =
    reviewState === "approved"
      ? "checkmark-circle"
      : reviewState === "rejected"
        ? "close-circle"
        : isGuestMode
          ? "person-outline"
          : isAdminApplicant
            ? "shield-checkmark"
            : "hourglass";

  const heroIconColor =
    reviewState === "approved"
      ? "#059669"
      : reviewState === "rejected"
        ? "#DC2626"
        : Colors.brandPrimaryDeep;

  const statusBadgeStyle =
    statusBadge.tone === "success"
      ? styles.statusBadgeSuccess
      : statusBadge.tone === "danger"
        ? styles.statusBadgeDanger
        : styles.statusBadgePending;

  const statusDotStyle =
    statusBadge.tone === "success"
      ? styles.statusDotSuccess
      : statusBadge.tone === "danger"
        ? styles.statusDotDanger
        : styles.statusDotPending;

  const statusBadgeTextStyle =
    statusBadge.tone === "success"
      ? styles.statusBadgeTextSuccess
      : statusBadge.tone === "danger"
        ? styles.statusBadgeTextDanger
        : styles.statusBadgeTextPending;

  const rejectedByLabel =
    rejectedBy === "system_admin" ? t("guests.systemAdministrator") : t("guests.communityAdmin");

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brandPrimaryDeep} />
          <Text style={styles.loadingText}>
            {isGuestMode ? t("guests.checkingGuestStatus") : t("guests.checkingApplicationStatus")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        bounces={!isStaticGuestRejectedView}
        overScrollMode={isStaticGuestRejectedView ? "never" : "auto"}
        refreshControl={
          isStaticGuestRejectedView ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => refresh(true)}
              tintColor={Colors.brandPrimaryDeep}
            />
          )
        }
      >
        <View
          style={[styles.hero, { backgroundColor: heroBg }]}
        >
          <View style={[styles.heroIconWrap, heroIconStyle]}>
            <Ionicons name={heroIconName} size={34} color={heroIconColor} />
          </View>

          <View style={[styles.statusBadge, statusBadgeStyle]}>
            <View style={[styles.statusDot, statusDotStyle]} />
            <Text style={[styles.statusBadgeText, statusBadgeTextStyle]}>
              {statusBadge.label}
            </Text>
          </View>

          <Text style={styles.title}>{screenTitle}</Text>
          <Text style={styles.subtitle}>{screenSubtitle}</Text>
        </View>

        {community ? (
          <View
            style={[
              styles.communityCard,
              reviewState === "approved" && styles.communityCardApproved,
              reviewState === "rejected" && styles.communityCardRejected,
            ]}
          >
            <View style={styles.communityCardHeader}>
              <View
                style={[
                  styles.communityIconWrap,
                  reviewState === "approved" && styles.communityIconWrapApproved,
                  reviewState === "rejected" && styles.communityIconWrapRejected,
                ]}
              >
                <Ionicons
                  name={isGuestMode ? "ticket-outline" : "business-outline"}
                  size={20}
                  color={
                    reviewState === "approved"
                      ? "#059669"
                      : reviewState === "rejected"
                        ? "#DC2626"
                        : Colors.brandPrimaryDeep
                  }
                />
              </View>
              <View style={styles.communityCardHeaderText}>
                <Text style={styles.cardLabel}>
                  {isGuestMode ? t("guests.guestInvitation") : approvalKind === "membership_approval"
                    ? t("guests.selectedCommunity")
                    : t("guests.requestedCommunity")}
                </Text>
                <Text style={styles.cardTitle}>
                  {community.name || community.title}
                </Text>
              </View>
            </View>

            {isGuestMode && guestInvitation ? (
              <>
                {guestHostLabel(guestInvitation) ? (
                  <View style={styles.metaRow}>
                    <Ionicons name="person-outline" size={16} color="#667085" />
                    <Text style={styles.metaText}>{t("guests.invitedBy", { name: guestHostLabel(guestInvitation) })}</Text>
                  </View>
                ) : null}
                <View style={styles.metaRow}>
                  <Ionicons name="calendar-outline" size={16} color="#667085" />
                  <Text style={styles.metaText}>
                    {t("guests.accessWindowLabel", { window: formatGuestAccessWindow(guestInvitation.starts_at, guestInvitation.ends_at) })}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Ionicons name="key-outline" size={16} color="#667085" />
                  <Text style={styles.metaText}>{t("guests.inviteCodeMeta", { code: guestInvitation.invite_code })}</Text>
                </View>
              </>
            ) : null}

            {!isGuestMode && community.address ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={16} color="#667085" />
                <Text style={styles.metaText}>{community.address}</Text>
              </View>
            ) : null}

            {!isGuestMode && community.region ? (
              <View style={styles.metaRow}>
                <Ionicons name="map-outline" size={16} color="#667085" />
                <Text style={styles.metaText}>{community.region}</Text>
              </View>
            ) : null}

            {reviewState === "pending" ? (
              <View style={styles.reviewPill}>
                <Ionicons name="time-outline" size={14} color="#14B8A6" />
                <Text style={styles.reviewPillText}>
                  {isGuestMode
                    ? t("guests.waitingForHostApproval")
                    : isUnitPackagePending
                      ? t("myUnits.pendingInitial")
                      : t("guests.reviewInProgress")}
                </Text>
              </View>
            ) : null}

            {reviewState === "approved" ? (
              <View style={styles.approvedPill}>
                <Ionicons name="checkmark-circle" size={14} color="#059669" />
                <Text style={styles.approvedPillText}>{t("guests.membershipApproved")}</Text>
              </View>
            ) : null}

            {reviewState === "rejected" ? (
              <View style={styles.declinedPill}>
                <Ionicons name="close-circle" size={14} color="#DC2626" />
                <Text style={styles.declinedPillText}>
                  {isGuestMode ? t("guests.guestAccessDeclined") : t("guests.membershipDeclined")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {isGuestMode && reviewState === "rejected" ? (
          <View style={styles.statusDetailCard}>
            <View style={styles.statusDetailHeader}>
              <Ionicons name="alert-circle" size={20} color="#DC2626" />
              <Text style={styles.statusDetailTitle}>
                {guestStatusNote ? t("guests.accessUnavailable") : t("guests.declineDetails")}
              </Text>
            </View>
            {guestStatusNote ? (
              <Text style={styles.reasonText}>{guestStatusNote}</Text>
            ) : (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>{t("guests.reasonForDecline")}</Text>
                <Text style={styles.reasonText}>
                  {rejectionReason?.trim()
                    ? rejectionReason
                    : t("guests.noReasonGuestDefault")}
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {!isGuestMode && reviewState === "rejected" ? (
          <View style={styles.statusDetailCard}>
            <View style={styles.statusDetailHeader}>
              <Ionicons name="alert-circle" size={20} color="#DC2626" />
              <Text style={styles.statusDetailTitle}>{t("guests.declineDetails")}</Text>
            </View>
            <View style={styles.statusDetailRow}>
              <Text style={styles.statusDetailLabel}>{t("guests.statusLabel")}</Text>
              <Text style={styles.statusDetailValueDanger}>{t("guests.declined")}</Text>
            </View>
            <View style={styles.statusDetailRow}>
              <Text style={styles.statusDetailLabel}>{t("guests.reviewedBy")}</Text>
              <Text style={styles.statusDetailValue}>{rejectedByLabel}</Text>
            </View>
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>{t("guests.reasonForDecline")}</Text>
              <Text style={styles.reasonText}>
                {rejectionReason?.trim()
                  ? rejectionReason
                  : t("guests.noReasonCommunityDefault")}
              </Text>
            </View>
          </View>
        ) : null}

        {reviewState === "approved" ? (
          <View style={styles.statusDetailCardApproved}>
            <View style={styles.statusDetailHeader}>
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
              <Text style={styles.statusDetailTitleApproved}>{t("guests.approvalDetails")}</Text>
            </View>
            <View style={styles.statusDetailRow}>
              <Text style={styles.statusDetailLabel}>{t("guests.statusLabel")}</Text>
              <Text style={styles.statusDetailValueSuccess}>{t("guests.approved")}</Text>
            </View>
            <View style={styles.statusDetailRow}>
              <Text style={styles.statusDetailLabel}>{t("guests.accessLabel")}</Text>
              <Text style={styles.statusDetailValue}>{t("guests.fullAccessGranted")}</Text>
            </View>
          </View>
        ) : null}

        <ReviewTimeline steps={timelineSteps} reviewState={reviewState} />

        <View style={styles.helpSection}>
          <Text style={styles.sectionTitle}>{t("guests.whatToKnow")}</Text>
          {helpItems.map((item) => (
            <View key={item.title} style={styles.helpRow}>
              <View style={styles.helpIconWrap}>
                <Ionicons name={item.icon} size={18} color={Colors.brandPrimaryDeep} />
              </View>
              <View style={styles.helpCopy}>
                <Text style={styles.helpTitle}>{item.title}</Text>
                <Text style={styles.helpBody}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {showGuestRejectedSignIn ? (
          <View style={styles.scrollFooter}>
            <AuthSubmitButton
              label={t("guest.backToGuestSignIn")}
              enabled
              variant="solid"
              style={styles.footerButton}
              onPress={handleBackToGuestSignIn}
            />
          </View>
        ) : null}
      </ScrollView>

      {!showGuestRejectedSignIn ? (
      <View style={styles.footer}>
        {reviewState === "approved" ? (
          <AuthSubmitButton
            label={t("guests.enterCommunity")}
            enabled
            variant="solid"
            style={styles.footerButton}
            onPress={handleEnterCommunity}
          />
        ) : reviewState === "rejected" && isAdminApplicant ? (
          <AuthSubmitButton
            label={t("guests.submitNewRequest")}
            enabled
            variant="solid"
            style={styles.footerButton}
            onPress={() => {
              router.replace({
                pathname: Routes.REQUEST_COMMUNITY,
                params: { role, rejected: "1" },
              });
            }}
          />
        ) : reviewState === "pending" ? (
          <AuthSubmitButton
            label={refreshing ? t("guests.checking") : t("guests.checkStatus")}
            loadingLabel={t("guests.checking")}
            enabled={!refreshing}
            loading={refreshing}
            variant="solid"
            style={styles.footerButton}
            onPress={() => refresh(true)}
          />
        ) : null}

        <TouchableOpacity style={styles.linkBtn} onPress={handleSignOut}>
          <Text style={styles.linkBtnText}>{t("guests.signOut")}</Text>
        </TouchableOpacity>
      </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: "#667085",
  },
  scrollView: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  scrollFooter: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  hero: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 28,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroIconPending: {
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  heroIconApproved: {
    backgroundColor: "#D1FAE5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  heroIconRejected: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 14,
  },
  statusBadgePending: {
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  statusBadgeSuccess: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  statusBadgeDanger: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotPending: {
    backgroundColor: "#14B8A6",
  },
  statusDotSuccess: {
    backgroundColor: "#059669",
  },
  statusDotDanger: {
    backgroundColor: "#DC2626",
  },
  statusBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  statusBadgeTextPending: {
    color: "#14B8A6",
  },
  statusBadgeTextSuccess: {
    color: "#047857",
  },
  statusBadgeTextDanger: {
    color: "#B91C1C",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 24,
    lineHeight: 30,
    color: "#101828",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: "#667085",
    textAlign: "center",
    maxWidth: 340,
  },
  communityCard: {
    marginHorizontal: 24,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#FFFFFF",
    gap: 10,
    ...rnShadow({ color: "#000", offset: { width: 0, height: 2 }, opacity: 0.04, radius: 8 }),
    elevation: 2,
  },
  communityCardApproved: {
    borderColor: "#A7F3D0",
    backgroundColor: "#F0FDF4",
  },
  communityCardRejected: {
    borderColor: "#FECACA",
    backgroundColor: "#FFFBFB",
  },
  communityCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  communityIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  communityIconWrapApproved: {
    backgroundColor: "#D1FAE5",
  },
  communityIconWrapRejected: {
    backgroundColor: "#FEE2E2",
  },
  communityCardHeaderText: {
    flex: 1,
  },
  cardLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#98A2B3",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  cardTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 17,
    color: "#101828",
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  metaText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: "#667085",
  },
  reviewPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#D1FAF5",
    marginTop: 4,
  },
  reviewPillText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#14B8A6",
  },
  approvedPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#D1FAE5",
    marginTop: 4,
  },
  approvedPillText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#047857",
  },
  declinedPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
    marginTop: 4,
  },
  declinedPillText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#B91C1C",
  },
  statusDetailCard: {
    marginHorizontal: 24,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#FEF2F2",
    gap: 10,
  },
  statusDetailCardApproved: {
    marginHorizontal: 24,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#ECFDF5",
    gap: 10,
  },
  statusDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  statusDetailTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: "#B91C1C",
  },
  statusDetailTitleApproved: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: "#047857",
  },
  statusDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  statusDetailLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#667085",
  },
  statusDetailValue: {
    flex: 1,
    textAlign: "right",
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#344054",
  },
  statusDetailValueDanger: {
    flex: 1,
    textAlign: "right",
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#B91C1C",
  },
  statusDetailValueSuccess: {
    flex: 1,
    textAlign: "right",
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#047857",
  },
  reasonBox: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  reasonLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    color: "#B91C1C",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  reasonText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: "#7F1D1D",
    marginTop: 4,
  },
  timelineCard: {
    marginHorizontal: 24,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#FAFBFC",
  },
  timelineCardApproved: {
    borderColor: "#A7F3D0",
    backgroundColor: "#F0FDF4",
  },
  timelineCardRejected: {
    borderColor: "#FECACA",
    backgroundColor: "#FFFBFB",
  },
  sectionTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: "#101828",
    marginBottom: 14,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 12,
  },
  timelineRail: {
    width: 24,
    alignItems: "center",
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotDone: {
    backgroundColor: "#14B8A6",
  },
  timelineDotApproved: {
    backgroundColor: "#059669",
  },
  timelineDotCurrent: {
    backgroundColor: "#D1FAF5",
    borderWidth: 2,
    borderColor: "#14B8A6",
  },
  timelineDotFailed: {
    backgroundColor: "#DC2626",
  },
  timelineDotUpcoming: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: 18,
    backgroundColor: "#E5E7EB",
    marginVertical: 4,
  },
  timelineLineDone: {
    backgroundColor: "rgba(20, 184, 166, 0.28)",
  },
  timelineLineApproved: {
    backgroundColor: "#A7F3D0",
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 16,
  },
  timelineLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  timelineLabelDone: {
    color: "#344054",
  },
  timelineLabelApproved: {
    color: "#047857",
  },
  timelineLabelCurrent: {
    color: "#14B8A6",
  },
  timelineLabelFailed: {
    color: "#B91C1C",
  },
  timelineLabelUpcoming: {
    color: "#98A2B3",
  },
  timelineHint: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: "#667085",
  },
  timelineFailedHint: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: "#B91C1C",
  },
  timelineApprovedHint: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: "#047857",
  },
  helpSection: {
    marginHorizontal: 24,
    marginTop: 16,
    gap: 10,
  },
  helpRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  helpIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  helpCopy: {
    flex: 1,
  },
  helpTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: "#101828",
  },
  helpBody: {
    marginTop: 3,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: "#667085",
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
    gap: 8,
  },
  footerButton: {
    height: 52,
    borderRadius: 14,
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  linkBtnText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "#667085",
  },
});
