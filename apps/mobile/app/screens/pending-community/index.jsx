import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../../constants/font";
import { Colors, Gradients } from "../../../constants/tokens";
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

async function persistSessionUser(user) {
  const token = await getToken();
  if (token && user) {
    await setSession({ token, user });
  }
}

function formatGuestAccessWindow(startsAt, endsAt) {
  const start = startsAt
    ? new Date(startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const end = endsAt
    ? new Date(endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  return `${start} → ${end}`;
}

function guestHostLabel(invitation) {
  if (!invitation) return null;
  if (invitation.resident) {
    const name = invitation.resident.display_name || invitation.resident.name;
    return invitation.resident.unit_number
      ? `${name} · Unit ${invitation.resident.unit_number}`
      : name;
  }
  if (invitation.invited_by) {
    return invitation.invited_by.display_name || invitation.invited_by.name;
  }
  return null;
}

function buildGuestTimeline(reviewState) {
  if (reviewState === "rejected") {
    return [
      { id: "phone", label: "Phone verified", status: "done" },
      { id: "invite", label: "Invite code verified", status: "done" },
      { id: "approval", label: "Host approval", status: "failed" },
      { id: "access", label: "Community access", status: "upcoming" },
    ];
  }

  return [
    { id: "phone", label: "Phone verified", status: "done" },
    { id: "invite", label: "Invite code verified", status: "done" },
    { id: "approval", label: "Host approval", status: "current" },
    { id: "access", label: "Community access", status: "upcoming" },
  ];
}

function buildTimeline({
  reviewState,
  approvalKind,
  isAdminApplicant,
  adminApprovedAwaitingCommunity,
  rejectedBy,
}) {
  if (reviewState === "approved" && approvalKind === "membership_approval") {
    return [
      { id: "region", label: "Region & community selected", status: "done" },
      { id: "profile", label: "Profile submitted", status: "done" },
      { id: "approval", label: "Community admin approval", status: "done" },
      { id: "access", label: "Full community access", status: "done" },
    ];
  }

  if (reviewState === "rejected") {
    if (approvalKind === "membership_approval") {
      return [
        { id: "profile", label: "Profile submitted", status: "done" },
        {
          id: "review",
          label:
            rejectedBy === "system_admin"
              ? "System admin review"
              : "Community admin review",
          status: "failed",
        },
        { id: "access", label: "Community access", status: "upcoming" },
      ];
    }

    return [
      { id: "submitted", label: "Request submitted", status: "done" },
      { id: "review", label: "System admin review", status: "failed" },
      { id: "active", label: "Community activated", status: "upcoming" },
    ];
  }

  if (approvalKind === "membership_approval") {
    return [
      { id: "region", label: "Region & community selected", status: "done" },
      { id: "profile", label: "Profile submitted", status: "done" },
      { id: "approval", label: "Community admin approval", status: "current" },
      { id: "access", label: "Full community access", status: "upcoming" },
    ];
  }

  if (isAdminApplicant) {
    if (adminApprovedAwaitingCommunity) {
      return [
        { id: "submitted", label: "Application submitted", status: "done" },
        { id: "account", label: "Admin account approved", status: "done" },
        { id: "community", label: "Community request review", status: "current" },
        { id: "dashboard", label: "Dashboard access", status: "upcoming" },
      ];
    }

    return [
      { id: "submitted", label: "Application submitted", status: "done" },
      { id: "account", label: "Admin account review", status: "current" },
      { id: "community", label: "Community request review", status: "current" },
      { id: "dashboard", label: "Dashboard access", status: "upcoming" },
    ];
  }

  return [
    { id: "submitted", label: "Request submitted", status: "done" },
    { id: "review", label: "System admin review", status: "current" },
    { id: "active", label: "Community activated", status: "upcoming" },
    { id: "join", label: "Residents can join", status: "upcoming" },
  ];
}

function ReviewTimeline({ steps, reviewState }) {
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
        {reviewState === "approved" ? "All steps complete" : "Review progress"}
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
                        ? "#0B66E8"
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
                <Text style={styles.timelineHint}>In progress — usually 1–2 business days</Text>
              ) : null}
              {step.status === "failed" ? (
                <Text style={styles.timelineFailedHint}>Requires your attention</Text>
              ) : null}
              {step.status === "done" && allDone ? (
                <Text style={styles.timelineApprovedHint}>Complete</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function PendingCommunityScreen() {
  const router = useRouter();
  const dialog = useAppDialog();
  const { role = "resident", guest: guestParam } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [community, setCommunity] = useState(null);
  const [approvalKind, setApprovalKind] = useState(null);
  const [rejectionReason, setRejectionReason] = useState(null);
  const [rejectedBy, setRejectedBy] = useState(null);
  const [reviewState, setReviewState] = useState("pending");
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdminApplicant, setIsAdminApplicant] = useState(false);
  const [adminApprovedAwaitingCommunity, setAdminApprovedAwaitingCommunity] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(guestParam === "1");
  const [guestInvitation, setGuestInvitation] = useState(null);
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
      setGuestStatusNote("Complete invite verification to continue.");
      return true;
    },
    [router],
  );

  const syncFromUser = useCallback(
    (user, reviewSnapshot = null) => {
      if (!user) return false;

      setCurrentUser(user);
      setIsAdminApplicant(isCommunityAdminRole(user));
      setAdminApprovedAwaitingCommunity(awaitsCommunityReviewOnly(user));

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
        if (!isCommunityAdminRole(user)) {
          const membership = getPrimaryMembership(user);
          if (
            membership?.status === "approved" &&
            membership.community &&
            membership.community.review_status !== "pending"
          ) {
            setReviewState("approved");
            setApprovalKind("membership_approval");
            setCommunity(membership.community);
            setRejectionReason(null);
            setRejectedBy(null);
            return true;
          }
        }

        navigateAfterAuth(router, user);
        return true;
      }
      if (needsCompleteProfile(user)) {
        router.replace({
          pathname: Routes.COMPLETE_PROFILE,
          params: getCompleteProfileParams(user, role),
        });
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
    [role, router, syncFromUser, guestParam, syncGuestInvitation],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      if (isGuestMode) return undefined;
      refresh(true);
      return undefined;
    }, [isGuestMode, refresh]),
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
    if (!isGuestMode) return undefined;

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
  }, [currentUser, guestInvitation, isGuestMode, refresh, router]);

  const handleSignOut = () => confirmSignOut(dialog);

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
        ? "Guest access expired"
        : guestStatusNote?.includes("revoked")
          ? "Guest access revoked"
          : "Guest access declined"
      : guestStatusNote === GUEST_ACCESS_NOT_STARTED_MESSAGE
        ? "Guest access not started"
      : "Guest access under review"
    : reviewState === "approved"
      ? "Membership approved"
      : reviewState === "rejected"
        ? approvalKind === "membership_approval"
          ? "Application declined"
          : "Community request declined"
        : approvalKind === "membership_approval"
          ? "Membership under review"
          : isAdminApplicant
            ? "Application under review"
            : "Community under review";

  const screenSubtitle = isGuestMode
    ? reviewState === "rejected"
      ? guestStatusNote ||
        (rejectionReason?.trim()
          ? "Your host or community admin declined your guest access request. See the reason below."
          : "Your host or community admin declined your guest access request.")
      : guestStatusNote === GUEST_ACCESS_NOT_STARTED_MESSAGE
        ? GUEST_ACCESS_NOT_STARTED_MESSAGE
      : guestInvitation?.invitation_type === "admin"
        ? "Your phone and invite code are verified. Your host will approve your temporary guest access shortly."
        : "Your phone and invite code are verified. The resident who invited you needs to approve your guest access."
    : reviewState === "approved"
      ? "You're all set! Your community admin approved your membership. Tap below to enter your community."
      : reviewState === "rejected"
        ? approvalKind === "membership_approval"
          ? rejectedBy === "system_admin"
            ? "Your account was rejected by a system administrator. Contact support if you believe this was a mistake."
            : "Your community admin declined your membership request. See the reason below and reach out to your community office if you have questions."
          : "Your community request was not approved. You can submit a new request with updated details."
        : approvalKind === "membership_approval"
          ? "Your community admin is reviewing your request to join. You'll get full access once they approve your membership."
          : isAdminApplicant
            ? adminApprovedAwaitingCommunity
              ? "Your admin account is approved. We're now reviewing your community request before unlocking the dashboard."
              : "A system administrator is reviewing your admin application and community details. You'll get access once both are approved."
            : "We're reviewing your community request. You'll be notified as soon as an admin approves it.";

  const statusBadge =
    reviewState === "approved"
      ? { label: "Approved", tone: "success" }
      : reviewState === "rejected"
        ? { label: "Declined", tone: "danger" }
        : { label: "Under review", tone: "pending" };

  const timelineSteps = useMemo(
    () =>
      isGuestMode
        ? buildGuestTimeline(reviewState)
        : buildTimeline({
            reviewState,
            approvalKind,
            isAdminApplicant,
            adminApprovedAwaitingCommunity,
            rejectedBy,
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
            title: "Contact your host",
            body: "Reach out to the resident or admin who invited you if you believe this was a mistake.",
          },
          {
            icon: "log-in-outline",
            title: "Need a new invite?",
            body: "Ask your host to send a fresh guest invitation if you still need access.",
          },
        ]
      : [
          {
            icon: "notifications-outline",
            title: "We'll notify you",
            body: "You'll get a notification as soon as your guest access is approved.",
          },
          {
            icon: "refresh-outline",
            title: "Check status anytime",
            body: "Pull down or tap Check status to see if your access has been approved.",
          },
          {
            icon: "eye-outline",
            title: "Read-only guest access",
            body: "Once approved, you can browse community content for the dates on your invitation.",
          },
        ]
    : reviewState === "approved"
      ? [
          {
            icon: "home-outline",
            title: "Welcome to your community",
            body: "Explore announcements, connect with neighbors, and access community services.",
          },
          {
            icon: "person-outline",
            title: "Complete your profile anytime",
            body: "Add a photo and bio from your profile settings to help neighbors recognize you.",
          },
        ]
      : reviewState === "rejected"
        ? [
            {
              icon: "create-outline",
              title: "Update your details",
              body: "Fix any issues mentioned in the reason below, then submit a fresh request.",
            },
            {
              icon: "mail-outline",
              title: "Need help?",
              body: "Contact your community office or NeighborLink support if you think this was a mistake.",
            },
          ]
        : [
            {
              icon: "notifications-outline",
              title: "We'll notify you",
              body: "You'll receive a push notification and can return here to check your status anytime.",
            },
            {
              icon: "refresh-outline",
              title: "Pull to refresh",
              body: "Status updates appear here automatically. Pull down or tap Check status for the latest.",
            },
            {
              icon: "time-outline",
              title: "Typical review time",
              body: "Most reviews are completed within 1–2 business days.",
            },
          ];

  const heroGradient =
    reviewState === "approved"
      ? ["#ECFDF5", "#FFFFFF"]
      : reviewState === "rejected"
        ? ["#FEF2F2", "#FFFFFF"]
        : Gradients.authScreen;

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
    rejectedBy === "system_admin" ? "System administrator" : "Community admin";

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brandPrimaryDeep} />
          <Text style={styles.loadingText}>
            {isGuestMode ? "Checking guest access status…" : "Checking application status…"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => refresh(true)}
            tintColor={Colors.brandPrimaryDeep}
          />
        }
      >
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
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
        </LinearGradient>

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
                  {isGuestMode ? "Guest invitation" : approvalKind === "membership_approval"
                    ? "Selected community"
                    : "Requested community"}
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
                    <Text style={styles.metaText}>Invited by {guestHostLabel(guestInvitation)}</Text>
                  </View>
                ) : null}
                <View style={styles.metaRow}>
                  <Ionicons name="calendar-outline" size={16} color="#667085" />
                  <Text style={styles.metaText}>
                    Access window: {formatGuestAccessWindow(guestInvitation.starts_at, guestInvitation.ends_at)}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Ionicons name="key-outline" size={16} color="#667085" />
                  <Text style={styles.metaText}>Invite code: {guestInvitation.invite_code}</Text>
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
                <Ionicons name="time-outline" size={14} color="#0B66E8" />
                <Text style={styles.reviewPillText}>
                  {isGuestMode ? "Waiting for host approval" : "Review in progress"}
                </Text>
              </View>
            ) : null}

            {reviewState === "approved" ? (
              <View style={styles.approvedPill}>
                <Ionicons name="checkmark-circle" size={14} color="#059669" />
                <Text style={styles.approvedPillText}>Membership approved</Text>
              </View>
            ) : null}

            {reviewState === "rejected" ? (
              <View style={styles.declinedPill}>
                <Ionicons name="close-circle" size={14} color="#DC2626" />
                <Text style={styles.declinedPillText}>
                  {isGuestMode ? "Guest access declined" : "Membership declined"}
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
                {guestStatusNote ? "Access unavailable" : "Decline details"}
              </Text>
            </View>
            {guestStatusNote ? (
              <Text style={styles.reasonText}>{guestStatusNote}</Text>
            ) : (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>Reason for decline</Text>
                <Text style={styles.reasonText}>
                  {rejectionReason?.trim()
                    ? rejectionReason
                    : "No reason was provided. Contact the person who invited you for more information."}
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {!isGuestMode && reviewState === "rejected" ? (
          <View style={styles.statusDetailCard}>
            <View style={styles.statusDetailHeader}>
              <Ionicons name="alert-circle" size={20} color="#DC2626" />
              <Text style={styles.statusDetailTitle}>Decline details</Text>
            </View>
            <View style={styles.statusDetailRow}>
              <Text style={styles.statusDetailLabel}>Status</Text>
              <Text style={styles.statusDetailValueDanger}>Declined</Text>
            </View>
            <View style={styles.statusDetailRow}>
              <Text style={styles.statusDetailLabel}>Reviewed by</Text>
              <Text style={styles.statusDetailValue}>{rejectedByLabel}</Text>
            </View>
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>Reason for decline</Text>
              <Text style={styles.reasonText}>
                {rejectionReason?.trim()
                  ? rejectionReason
                  : "No reason was provided. Contact your community office for more information."}
              </Text>
            </View>
          </View>
        ) : null}

        {reviewState === "approved" ? (
          <View style={styles.statusDetailCardApproved}>
            <View style={styles.statusDetailHeader}>
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
              <Text style={styles.statusDetailTitleApproved}>Approval details</Text>
            </View>
            <View style={styles.statusDetailRow}>
              <Text style={styles.statusDetailLabel}>Status</Text>
              <Text style={styles.statusDetailValueSuccess}>Approved</Text>
            </View>
            <View style={styles.statusDetailRow}>
              <Text style={styles.statusDetailLabel}>Access</Text>
              <Text style={styles.statusDetailValue}>Full community access granted</Text>
            </View>
          </View>
        ) : null}

        <ReviewTimeline steps={timelineSteps} reviewState={reviewState} />

        <View style={styles.helpSection}>
          <Text style={styles.sectionTitle}>What to know</Text>
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
      </ScrollView>

      <View style={styles.footer}>
        {reviewState === "approved" ? (
          <AuthSubmitButton
            label="Enter community"
            enabled
            variant="solid"
            style={styles.footerButton}
            onPress={handleEnterCommunity}
          />
        ) : reviewState === "rejected" && isAdminApplicant ? (
          <AuthSubmitButton
            label="Submit new request"
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
            label={refreshing ? "Checking…" : "Check status"}
            loadingLabel="Checking…"
            enabled={!refreshing}
            loading={refreshing}
            variant="solid"
            style={styles.footerButton}
            onPress={() => refresh(true)}
          />
        ) : null}

        <TouchableOpacity style={styles.linkBtn} onPress={handleSignOut}>
          <Text style={styles.linkBtnText}>Sign out</Text>
        </TouchableOpacity>
      </View>
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
  scroll: {
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
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
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
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
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
    backgroundColor: "#0B66E8",
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
    color: "#0B66E8",
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
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
    backgroundColor: "#EFF6FF",
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
    backgroundColor: "#EFF6FF",
    marginTop: 4,
  },
  reviewPillText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#0B66E8",
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
    backgroundColor: "#0B66E8",
  },
  timelineDotApproved: {
    backgroundColor: "#059669",
  },
  timelineDotCurrent: {
    backgroundColor: "#EFF6FF",
    borderWidth: 2,
    borderColor: "#0B66E8",
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
    backgroundColor: "#BFDBFE",
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
    color: "#0B66E8",
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
    backgroundColor: "#EFF6FF",
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
