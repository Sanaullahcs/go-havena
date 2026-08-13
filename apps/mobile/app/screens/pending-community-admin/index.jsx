import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { Colors, SolidFills } from "../../../constants/tokens";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import { useRouter } from "expo-router";
import { navigateAfterAuth } from "../../../constants/onboarding-routes";
import { getUser } from "../../../services/auth-session";
import { fetchMe } from "../../../services/auth-api";
import { confirmSignOut } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import {
  canAccessDashboard,
  getPrimaryMembership,
  hasPendingCommunityRequest,
  needsSystemApprovalWait,
} from "../../../services/community-access";

export default function PendingCommunityAdminScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [communityName, setCommunityName] = useState("");
  const [communityAddress, setCommunityAddress] = useState("");
  const [awaitingCommunityApproval, setAwaitingCommunityApproval] = useState(false);

  const syncFromUser = useCallback(
    (user) => {
      if (canAccessDashboard(user)) {
        navigateAfterAuth(router, user);
        return true;
      }

      const nextStep = user?.access?.next_step;
      if (nextStep === "complete_billing_web") {
        navigateAfterAuth(router, user, { role: "admin" });
        return true;
      }
      if (nextStep && !["await_approval", "rejected", "ready"].includes(nextStep)) {
        navigateAfterAuth(router, user, { role: "admin" });
        return true;
      }

      // Stay on this screen while awaiting platform approval.
      if (nextStep === "await_approval" || needsSystemApprovalWait(user)) {
        const membership = getPrimaryMembership(user);
        const community = membership?.community;
        setCommunityName(community?.name || community?.title || "");
        setCommunityAddress(community?.address || "");
        setAwaitingCommunityApproval(hasPendingCommunityRequest(user));
        return true;
      }

      if (hasPendingCommunityRequest(user) || !needsSystemApprovalWait(user)) {
        navigateAfterAuth(router, user, { role: "admin" });
        return true;
      }

      const membership = getPrimaryMembership(user);
      const community = membership?.community;
      setCommunityName(community?.name || community?.title || "");
      setCommunityAddress(community?.address || "");
      setAwaitingCommunityApproval(hasPendingCommunityRequest(user));
      return true;
    },
    [router],
  );

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      try {
        const user = await fetchMe();
        syncFromUser(user);
      } catch {
        const cached = await getUser();
        if (cached) syncFromUser(cached);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [syncFromUser],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSignOut = () => confirmSignOut(dialog);

  const timelineSteps = useMemo(
    () => [
      { label: t('guests.applicationSubmitted'), status: "done" },
      {
        label: awaitingCommunityApproval
          ? t('guests.adminAccountApproved')
          : t('guests.adminAccountReview'),
        status: awaitingCommunityApproval ? "done" : "current",
      },
      {
        label: t('guests.communityRequestReview'),
        status: awaitingCommunityApproval ? "current" : "upcoming",
      },
      { label: t('guests.dashboardAccess'), status: "upcoming" },
    ],
    [awaitingCommunityApproval, t],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brandPrimaryDeep} />
          <Text style={styles.loadingText}>{t('guests.checkingApprovalStatus')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => refresh(true)}
            tintColor={Colors.brandPrimaryDeep}
          />
        }
      >
        <View style={[styles.hero, { backgroundColor: SolidFills.authWash }]}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={34} color={Colors.brandPrimaryDeep} />
          </View>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusBadgeText}>{t('guests.underReview')}</Text>
          </View>
          <Text style={styles.title}>{t('guests.awaitingSystemApproval')}</Text>
          <Text style={styles.subtitle}>
            {awaitingCommunityApproval
              ? t('guests.adminSubtitleCommunityOnly')
              : t('guests.adminSubtitleFullReview')}
          </Text>
        </View>

        {communityName ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <Ionicons name="business-outline" size={20} color={Colors.brandPrimaryDeep} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>{t('guests.selectedCommunity')}</Text>
                <Text style={styles.cardTitle}>{communityName}</Text>
              </View>
            </View>
            {communityAddress ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={16} color="#667085" />
                <Text style={styles.metaText}>{communityAddress}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.timelineCard}>
          <Text style={styles.sectionTitle}>{t('guests.reviewProgress')}</Text>
          {timelineSteps.map((step, index) => {
            const isLast = index === timelineSteps.length - 1;
            const iconName =
              step.status === "done"
                ? "checkmark"
                : step.status === "current"
                  ? "time-outline"
                  : "ellipse-outline";
            const dotStyle =
              step.status === "done"
                ? styles.dotDone
                : step.status === "current"
                  ? styles.dotCurrent
                  : styles.dotUpcoming;

            return (
              <View key={step.label} style={styles.timelineRow}>
                <View style={styles.rail}>
                  <View style={[styles.dot, dotStyle]}>
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
                  {!isLast ? <View style={[styles.line, step.status === "done" && styles.lineDone]} /> : null}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    step.status === "current" && styles.stepLabelCurrent,
                    step.status === "upcoming" && styles.stepLabelUpcoming,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="notifications-outline" size={18} color={Colors.brandPrimaryDeep} />
          <Text style={styles.infoText}>
            {t('guests.pullToRefreshNotification')}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <AuthSubmitButton
          label={refreshing ? t('guests.checking') : t('guests.checkStatus')}
          loadingLabel={t('guests.checking')}
          enabled={!refreshing}
          loading={refreshing}
          variant="solid"
          style={styles.footerButton}
          onPress={() => refresh(true)}
        />
        <TouchableOpacity style={styles.linkBtn} onPress={handleSignOut}>
          <Text style={styles.linkBtnText}>{t('guests.signOut')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
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
  content: {
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
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    marginBottom: 14,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#14B8A6",
  },
  statusBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#14B8A6",
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
  card: {
    marginHorizontal: 24,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
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
  timelineCard: {
    marginHorizontal: 24,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#FAFBFC",
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
    alignItems: "flex-start",
  },
  rail: {
    width: 24,
    alignItems: "center",
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: { backgroundColor: "#14B8A6" },
  dotCurrent: {
    backgroundColor: "#D1FAF5",
    borderWidth: 2,
    borderColor: "#14B8A6",
  },
  dotUpcoming: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  line: {
    flex: 1,
    width: 2,
    minHeight: 18,
    backgroundColor: "#E5E7EB",
    marginVertical: 4,
  },
  lineDone: { backgroundColor: "rgba(20, 184, 166, 0.28)" },
  stepLabel: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: "#344054",
    paddingBottom: 16,
  },
  stepLabelCurrent: { color: "#14B8A6" },
  stepLabelUpcoming: { color: "#98A2B3" },
  infoCard: {
    marginHorizontal: 24,
    marginTop: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  infoText: {
    flex: 1,
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
