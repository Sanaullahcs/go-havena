import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  AppState,
  TouchableOpacity,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { Colors, SolidFills } from "../../../constants/tokens";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import { fetchMe } from "../../../services/auth-api";
import {
  ensureMyFamily,
  fetchMyFamily,
  fetchSuggestedFamilyNumber,
} from "../../../services/family-api";
import { confirmSignOut } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { showApiFailure } from "../../../utils/auth-errors";
import {
  canAccessDashboard,
  hasPendingMembershipApproval,
} from "../../../services/community-access";
import {
  getCompleteProfileParams,
  navigateAfterAuth,
  Routes,
} from "../../../constants/onboarding-routes";
import { getUser, getToken, setSession } from "../../../services/auth-session";

async function persistSessionUser(user) {
  const token = await getToken();
  if (token && user) {
    await setSession({ token, user });
  }
}

function buildTimeline(reviewState, t) {
  if (reviewState === "rejected") {
    return [
      { id: "profile", label: t("family.profileSubmitted"), status: "done" },
      { id: "family", label: t("family.familyHeadReview"), status: "failed" },
      { id: "admin", label: t("family.communityAdminReview"), status: "upcoming" },
      { id: "access", label: t("family.communityAccess"), status: "upcoming" },
    ];
  }

  return [
    { id: "profile", label: t("family.profileSubmitted"), status: "done" },
    { id: "family", label: t("family.familyHeadReview"), status: "current" },
    { id: "admin", label: t("family.communityAdminReview"), status: "upcoming" },
    { id: "access", label: t("family.communityAccess"), status: "upcoming" },
  ];
}

function ReviewTimeline({ steps, reviewState, t }) {
  return (
    <View
      style={[
        styles.timelineCard,
        reviewState === "rejected" && styles.timelineCardRejected,
      ]}
    >
      <Text style={styles.sectionTitle}>{t("family.reviewProgress")}</Text>
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
            ? styles.timelineDotDone
            : step.status === "failed"
              ? styles.timelineDotFailed
              : step.status === "current"
                ? styles.timelineDotCurrent
                : styles.timelineDotUpcoming;
        const labelStyle =
          step.status === "done"
            ? styles.timelineLabelDone
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
              {!isLast ? <View style={styles.timelineLine} /> : null}
            </View>
            <View style={styles.timelineContent}>
              <Text style={[styles.timelineLabel, labelStyle]}>{step.label}</Text>
              {step.status === "current" ? (
                <Text style={styles.timelineHint}>{t("family.waitingForFamilyHead")}</Text>
              ) : null}
              {step.status === "failed" ? (
                <Text style={styles.timelineFailedHint}>{t("family.requiresAttention")}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function PendingFamilyScreen() {
  const router = useRouter();
  const dialog = useAppDialog();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingFamily, setCreatingFamily] = useState(false);
  const creatingFamilyRef = useRef(false);
  const [reviewState, setReviewState] = useState("pending");
  const [request, setRequest] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const routeFromFamilyState = useCallback(
    async (familyPayload, user) => {
      const state = familyPayload?.state ?? "none";
      const nextRequest =
        familyPayload?.pending_request ?? familyPayload?.rejected_request ?? null;

      if (state === "pending") {
        setReviewState("pending");
        setRequest(nextRequest);
        setCurrentUser(user);
        return true;
      }

      if (state === "rejected") {
        setReviewState("rejected");
        setRequest(nextRequest);
        setCurrentUser(user);
        return true;
      }

      if (state === "awaiting_admin" || hasPendingMembershipApproval(user)) {
        router.replace({
          pathname: Routes.PENDING_COMMUNITY,
          params: { role: user?.role || "resident" },
        });
        return true;
      }

      if (state === "member" || canAccessDashboard(user)) {
        navigateAfterAuth(router, user);
        return true;
      }

      navigateAfterAuth(router, user);
      return true;
    },
    [router],
  );

  const refresh = useCallback(
    async (silent = false) => {
      if (creatingFamilyRef.current) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        let user = null;
        try {
          user = await fetchMe();
          await persistSessionUser(user);
        } catch {
          user = await getUser();
        }

        const familyPayload = await fetchMyFamily();
        if (user) {
          const withFamily = {
            ...user,
            family: {
              state: familyPayload?.state ?? "none",
              request:
                familyPayload?.pending_request ??
                familyPayload?.rejected_request ??
                null,
            },
          };
          await persistSessionUser(withFamily);
          await routeFromFamilyState(familyPayload, withFamily);
        }
      } catch {
        const cached = await getUser();
        if (cached?.family) {
          await routeFromFamilyState(
            {
              state: cached.family.state,
              pending_request:
                cached.family.state === "pending" || cached.family.state === "awaiting_admin"
                  ? cached.family.request
                  : null,
              rejected_request:
                cached.family.state === "rejected" ? cached.family.request : null,
            },
            cached,
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [routeFromFamilyState],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh(true);
      return undefined;
    }, [refresh]),
  );

  useEffect(() => {
    if (reviewState !== "pending") return undefined;
    const intervalId = setInterval(() => refresh(true), 15000);
    return () => clearInterval(intervalId);
  }, [reviewState, refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh(true);
    });
    return () => sub.remove();
  }, [refresh]);

  const handleSignOut = () => confirmSignOut(dialog);

  const handleCreateFamily = useCallback(async () => {
    if (creatingFamilyRef.current) return;
    creatingFamilyRef.current = true;
    setCreatingFamily(true);
    try {
      const suggested = await fetchSuggestedFamilyNumber();
      const number = suggested.family_number ?? "";
      const family = await ensureMyFamily(number || undefined);
      if (!family?.family_number) {
        const user = currentUser ?? (await getUser());
        router.replace({
          pathname: Routes.COMPLETE_PROFILE,
          params: {
            ...(user ? getCompleteProfileParams(user, user?.role || "resident") : {}),
            familyMode: "create",
          },
        });
        return;
      }

      let user = currentUser;
      try {
        user = await fetchMe();
        await persistSessionUser(user);
      } catch {
        user = user ?? (await getUser());
      }

      const familyPayload = await fetchMyFamily();
      const withFamily = {
        ...(user ?? {}),
        family: {
          state: familyPayload?.state ?? "member",
          request: null,
        },
      };
      await persistSessionUser(withFamily);
      await routeFromFamilyState(familyPayload, withFamily);
    } catch (err) {
      await showApiFailure(dialog, t("family.couldNotCreateFamily"), err);
    } finally {
      creatingFamilyRef.current = false;
      setCreatingFamily(false);
    }
  }, [currentUser, dialog, routeFromFamilyState, router, t]);

  const timelineSteps = useMemo(() => buildTimeline(reviewState, t), [reviewState, t]);

  const familyNumber = request?.family?.family_number;
  const communityName = request?.family?.community_name;
  const rejectionReason = request?.rejection_reason;

  const screenTitle =
    reviewState === "rejected"
      ? t("family.familyRequestDeclined")
      : t("family.familyApprovalPending");
  const screenSubtitle =
    reviewState === "rejected"
      ? t("family.rejectedSubtitle")
      : familyNumber
        ? t("family.pendingSubtitleWithNumber", { number: familyNumber })
        : t("family.pendingSubtitle");

  const statusBadge =
    reviewState === "rejected"
      ? { label: t("family.declined"), tone: "danger" }
      : { label: t("family.underReview"), tone: "pending" };

  const heroBg =
    reviewState === "rejected" ? "#FEF2F2" : SolidFills.authWash;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brandPrimaryDeep} />
          <Text style={styles.loadingText}>{t("family.checkingFamilyStatus")}</Text>
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
        <View style={[styles.hero, { backgroundColor: heroBg }]}>
          <View
            style={[
              styles.heroIconWrap,
              reviewState === "rejected" ? styles.heroIconRejected : styles.heroIconPending,
            ]}
          >
            <Ionicons
              name={reviewState === "rejected" ? "close-circle" : "people"}
              size={34}
              color={reviewState === "rejected" ? "#DC2626" : Colors.brandPrimaryDeep}
            />
          </View>

          <View
            style={[
              styles.statusBadge,
              statusBadge.tone === "danger" ? styles.statusBadgeDanger : styles.statusBadgePending,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                statusBadge.tone === "danger" ? styles.statusDotDanger : styles.statusDotPending,
              ]}
            />
            <Text
              style={[
                styles.statusBadgeText,
                statusBadge.tone === "danger"
                  ? styles.statusBadgeTextDanger
                  : styles.statusBadgeTextPending,
              ]}
            >
              {statusBadge.label}
            </Text>
          </View>

          <Text style={styles.title}>{screenTitle}</Text>
          <Text style={styles.subtitle}>{screenSubtitle}</Text>
        </View>

        {(familyNumber || communityName) && (
          <View
            style={[
              styles.communityCard,
              reviewState === "rejected" && styles.communityCardRejected,
            ]}
          >
            <View style={styles.communityCardHeader}>
              <View
                style={[
                  styles.communityIconWrap,
                  reviewState === "rejected" && styles.communityIconWrapRejected,
                ]}
              >
                <Ionicons
                  name="people-outline"
                  size={20}
                  color={reviewState === "rejected" ? "#DC2626" : Colors.brandPrimaryDeep}
                />
              </View>
              <View style={styles.communityCardHeaderText}>
                <Text style={styles.cardLabel}>{t("family.familyRequest")}</Text>
                <Text style={styles.cardTitle}>{familyNumber || t("family.familyJoin")}</Text>
              </View>
            </View>
            {communityName ? (
              <View style={styles.metaRow}>
                <Ionicons name="business-outline" size={16} color="#667085" />
                <Text style={styles.metaText}>{communityName}</Text>
              </View>
            ) : null}
            {reviewState === "pending" ? (
              <View style={styles.reviewPill}>
                <Ionicons name="time-outline" size={14} color="#14B8A6" />
                <Text style={styles.reviewPillText}>{t("family.waitingForApproval")}</Text>
              </View>
            ) : (
              <View style={styles.declinedPill}>
                <Ionicons name="close-circle" size={14} color="#DC2626" />
                <Text style={styles.declinedPillText}>{t("family.familyHeadDeclined")}</Text>
              </View>
            )}
          </View>
        )}

        {reviewState === "rejected" ? (
          <View style={styles.statusDetailCard}>
            <View style={styles.statusDetailHeader}>
              <Ionicons name="alert-circle" size={20} color="#DC2626" />
              <Text style={styles.statusDetailTitle}>{t("family.declineDetails")}</Text>
            </View>
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>{t("family.reasonForDecline")}</Text>
              <Text style={styles.reasonText}>
                {rejectionReason?.trim()
                  ? rejectionReason
                  : t("family.noReasonProvided")}
              </Text>
            </View>
          </View>
        ) : null}

        <ReviewTimeline steps={timelineSteps} reviewState={reviewState} t={t} />

        <View style={styles.helpSection}>
          <Text style={styles.sectionTitle}>{t("family.whatToKnow")}</Text>
          {(reviewState === "rejected"
            ? [
                {
                  icon: "people-outline",
                  title: t("family.createMyFamily"),
                  body: t("family.createMyFamilyBody"),
                },
                {
                  icon: "shield-checkmark-outline",
                  title: t("family.adminStillReviews"),
                  body: t("family.adminStillReviewsBody"),
                },
              ]
            : [
                {
                  icon: "notifications-outline",
                  title: t("family.wellNotifyYou"),
                  body: t("family.wellNotifyYouBody"),
                },
                {
                  icon: "lock-closed-outline",
                  title: t("family.familyFeaturesLocked"),
                  body: t("family.familyFeaturesLockedBody"),
                },
                {
                  icon: "shield-outline",
                  title: t("family.nextCommunityAdmin"),
                  body: t("family.nextCommunityAdminBody"),
                },
              ]
          ).map((item) => (
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
        {reviewState === "rejected" ? (
          <AuthSubmitButton
            label={t("family.createMyFamilyBtn")}
            loadingLabel={t("family.creatingFamily")}
            enabled={!creatingFamily}
            loading={creatingFamily}
            variant="solid"
            style={styles.footerButton}
            onPress={handleCreateFamily}
          />
        ) : (
          <AuthSubmitButton
            label={refreshing ? t("family.checking") : t("family.checkStatus")}
            loadingLabel={t("family.checking")}
            enabled={!refreshing}
            loading={refreshing}
            variant="solid"
            style={styles.footerButton}
            onPress={() => refresh(true)}
          />
        )}

        <TouchableOpacity style={styles.linkBtn} onPress={handleSignOut}>
          <Text style={styles.linkBtnText}>{t("family.signOut")}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: Fonts.regular, fontSize: 14, color: "#667085" },
  scroll: { paddingBottom: 24 },
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
  statusBadgeDanger: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotPending: { backgroundColor: "#14B8A6" },
  statusDotDanger: { backgroundColor: "#DC2626" },
  statusBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  statusBadgeTextPending: { color: "#14B8A6" },
  statusBadgeTextDanger: { color: "#B91C1C" },
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
  },
  communityCardRejected: {
    borderColor: "#FECACA",
    backgroundColor: "#FFFBFB",
  },
  communityCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  communityIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  communityIconWrapRejected: { backgroundColor: "#FEE2E2" },
  communityCardHeaderText: { flex: 1 },
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
  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
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
  reviewPillText: { fontFamily: Fonts.medium, fontSize: 12, color: "#14B8A6" },
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
  declinedPillText: { fontFamily: Fonts.medium, fontSize: 12, color: "#B91C1C" },
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
  statusDetailHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  statusDetailTitle: { fontFamily: Fonts.semiBold, fontSize: 14, color: "#B91C1C" },
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
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineRail: { width: 24, alignItems: "center" },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotDone: { backgroundColor: "#14B8A6" },
  timelineDotCurrent: {
    backgroundColor: "#D1FAF5",
    borderWidth: 2,
    borderColor: "#14B8A6",
  },
  timelineDotFailed: { backgroundColor: "#DC2626" },
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
  timelineContent: { flex: 1, paddingBottom: 16 },
  timelineLabel: { fontFamily: Fonts.medium, fontSize: 13, lineHeight: 18 },
  timelineLabelDone: { color: "#344054" },
  timelineLabelCurrent: { color: "#14B8A6" },
  timelineLabelFailed: { color: "#B91C1C" },
  timelineLabelUpcoming: { color: "#98A2B3" },
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
  helpSection: { marginHorizontal: 24, marginTop: 16, gap: 10 },
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
  helpCopy: { flex: 1 },
  helpTitle: { fontFamily: Fonts.semiBold, fontSize: 13, color: "#101828" },
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
  footerButton: { height: 52, borderRadius: 14 },
  linkBtn: { alignItems: "center", paddingVertical: 10 },
  linkBtnText: { fontFamily: Fonts.medium, fontSize: 14, color: "#667085" },
});
