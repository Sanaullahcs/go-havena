import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Linking,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";

import { Fonts } from "../../../constants/font";
import { Colors, SolidFills } from "../../../constants/tokens";
import { API_BASE_URL } from "../../../constants/api-config";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import { navigateAfterAuth } from "../../../constants/onboarding-routes";
import { getUser } from "../../../services/auth-session";
import { createWebHandoff, fetchMe } from "../../../services/auth-api";
import { confirmSignOut } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { canAccessDashboard, getPrimaryMembership } from "../../../services/community-access";

WebBrowser.maybeCompleteAuthSession();

export const options = { headerShown: false };

function resolveAdminPortalUrl(fromAccess) {
  const candidate = String(fromAccess?.billing_url || "").trim();
  const unusable =
    !candidate ||
    /localhost|127\.0\.0\.1|0\.0\.0\.0|admin\.gohavena\.com/i.test(candidate);

  if (!unusable) {
    return candidate.replace(/\/$/, "");
  }

  try {
    const api = new URL(API_BASE_URL);
    return `${api.protocol}//${api.hostname}:3000/admin/billing`;
  } catch {
    return "http://192.168.0.134:3000/admin/billing";
  }
}

function appendQuery(url, params) {
  try {
    const next = new URL(url);
    Object.entries(params).forEach(([key, value]) => {
      if (value) next.searchParams.set(key, String(value));
    });
    return next.toString();
  } catch {
    return url;
  }
}

export default function CompleteBillingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [communityName, setCommunityName] = useState("");

  const syncFromUser = useCallback(
    (user) => {
      if (canAccessDashboard(user)) {
        navigateAfterAuth(router, user);
        return;
      }

      const nextStep = user?.access?.next_step;
      if (nextStep === "rejected") {
        navigateAfterAuth(router, user, { role: "admin" });
        return;
      }
      if (nextStep && !["complete_billing_web", "await_approval", "ready"].includes(nextStep)) {
        navigateAfterAuth(router, user, { role: "admin" });
        return;
      }

      const membership = getPrimaryMembership(user);
      setCommunityName(membership?.community?.name || membership?.community?.title || "");
      setAwaitingApproval(
        nextStep === "await_approval" || Boolean(user?.access?.card_on_file && nextStep !== "complete_billing_web"),
      );
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

  useFocusEffect(
    useCallback(() => {
      void refresh(true);
    }, [refresh]),
  );

  const handleSignOut = () => confirmSignOut(dialog);

  const openAdminPortal = async () => {
    const returnUrl = ExpoLinking.createURL("screens/complete-billing");
    let url = appendQuery(resolveAdminPortalUrl(null), {
      from: "app",
      return_to: returnUrl,
    });
    try {
      const cached = await getUser();
      url = appendQuery(resolveAdminPortalUrl(cached?.access), {
        from: "app",
        return_to: returnUrl,
      });
    } catch {
      // keep resolved URL
    }

    setOpening(true);
    try {
      const code = await createWebHandoff();
      if (code) url = appendQuery(url, { handoff: code });
    } catch {
      // Still open the portal — they'll sign in with the same phone number.
    }

    try {
      await WebBrowser.openAuthSessionAsync(url, returnUrl, {
        showInRecents: true,
        createTask: false,
      });
    } catch {
      try {
        await Linking.openURL(url);
      } catch {
        await dialog.showError(
          t("common.error", { defaultValue: "Error" }),
          t("billing.cannotOpenBrowser", {
            defaultValue: "Could not open the admin portal. Try again or use a desktop browser.",
          }),
        );
      }
    } finally {
      setOpening(false);
      await refresh(true);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brandPrimaryDeep} />
          <Text style={styles.loadingText}>
            {t("billing.checkingStatus", { defaultValue: "Checking account status…" })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const timeline = awaitingApproval
    ? [
        { label: t("billing.timelineAccount", { defaultValue: "Account created" }), status: "done" },
        { label: t("billing.timelineCard", { defaultValue: "Card saved" }), status: "done" },
        { label: t("billing.timelineReview", { defaultValue: "Havena review" }), status: "current" },
        { label: t("billing.timelineAccess", { defaultValue: "Dashboard access" }), status: "upcoming" },
      ]
    : [
        { label: t("billing.timelineAccount", { defaultValue: "Account created" }), status: "done" },
        { label: t("billing.timelineCard", { defaultValue: "Save a card" }), status: "current" },
        { label: t("billing.timelineReview", { defaultValue: "Havena review" }), status: "upcoming" },
        { label: t("billing.timelineAccess", { defaultValue: "Dashboard access" }), status: "upcoming" },
      ];

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.scroll}
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
            <Ionicons
              name={awaitingApproval ? "shield-checkmark" : "card-outline"}
              size={28}
              color={Colors.brandPrimaryDeep}
            />
          </View>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusBadgeText}>
              {awaitingApproval
                ? t("billing.cardSavedBadge", { defaultValue: "Card on file" })
                : t("billing.setupRequired", { defaultValue: "Payment method" })}
            </Text>
          </View>
          <Text style={styles.title}>
            {awaitingApproval
              ? t("billing.waitingTitle", { defaultValue: "Waiting for approval" })
              : t("billing.completeSetupTitle", { defaultValue: "Add a payment method" })}
          </Text>
          <Text style={styles.subtitle}>
            {awaitingApproval
              ? t("billing.waitingBody", {
                  defaultValue:
                    "Your card is saved and you will not be charged yet. A Havena administrator will review your community. When you’re approved, your 30-day free trial begins.",
                })
              : t("billing.completeSetupBody", {
                  defaultValue:
                    "Save a card in the Havena admin portal. $0 is due today. Your free trial starts only after a system administrator approves you.",
                })}
          </Text>
        </View>

        <View style={styles.body}>
          {communityName ? (
            <View style={styles.communityCard}>
              <View style={styles.communityIcon}>
                <Ionicons name="business-outline" size={18} color={Colors.brandPrimaryDeep} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.communityLabel}>
                  {t("billing.yourCommunity", { defaultValue: "Your community" })}
                </Text>
                <Text style={styles.communityName}>{communityName}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.timelineCard}>
            <Text style={styles.sectionTitle}>
              {t("billing.reviewProgress", { defaultValue: "Progress" })}
            </Text>
            {timeline.map((step, index) => {
              const isLast = index === timeline.length - 1;
              const iconName =
                step.status === "done" ? "checkmark" : step.status === "current" ? "time-outline" : "ellipse-outline";
              return (
                <View key={step.label} style={styles.timelineRow}>
                  <View style={styles.rail}>
                    <View
                      style={[
                        styles.dot,
                        step.status === "done" && styles.dotDone,
                        step.status === "current" && styles.dotCurrent,
                        step.status === "upcoming" && styles.dotUpcoming,
                      ]}
                    >
                      <Ionicons
                        name={iconName}
                        size={step.status === "upcoming" ? 10 : 13}
                        color={
                          step.status === "upcoming" ? "#98A2B3" : step.status === "current" ? "#14B8A6" : "#FFFFFF"
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
            <Ionicons name="information-circle-outline" size={18} color={Colors.brandPrimaryDeep} />
            <Text style={styles.infoText}>
              {awaitingApproval
                ? t("billing.waitingHint", {
                    defaultValue: "Stay in the app. Tap Refresh status after you’re notified, or pull down anytime.",
                  })
                : t("billing.refreshHint", {
                    defaultValue:
                      "You’ll add card details in a secure browser, then return here. Nothing is charged until after approval and the trial.",
                  })}
            </Text>
          </View>
        </View>
      </ScrollView>

      <SafeAreaView style={styles.footer} edges={["bottom"]}>
        {!awaitingApproval ? (
          <AuthSubmitButton
            label={
              opening
                ? t("billing.opening", { defaultValue: "Opening…" })
                : t("billing.openWebSetup", { defaultValue: "Continue in browser" })
            }
            loadingLabel={t("billing.opening", { defaultValue: "Opening…" })}
            enabled={!opening}
            loading={opening}
            style={styles.footerButton}
            textStyle={styles.footerButtonText}
            onPress={openAdminPortal}
          />
        ) : null}
        <AuthSubmitButton
          label={
            refreshing
              ? t("guests.checking", { defaultValue: "Checking…" })
              : t("billing.iveFinished", { defaultValue: "Refresh status" })
          }
          loadingLabel={t("guests.checking", { defaultValue: "Checking…" })}
          enabled={!refreshing}
          loading={refreshing}
          solidColor={awaitingApproval ? Colors.brandPrimaryDeep : Colors.brandPrimary}
          style={styles.footerButton}
          textStyle={styles.footerButtonText}
          onPress={() => refresh(true)}
        />
        <TouchableOpacity style={styles.linkBtn} onPress={handleSignOut}>
          <Text style={styles.linkBtnText}>{t("guests.signOut", { defaultValue: "Sign out" })}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scroll: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#667085",
  },
  content: {
    flexGrow: 1,
    paddingBottom: 12,
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
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
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
    marginBottom: 12,
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
    color: "#0F766E",
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
  body: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 14,
  },
  communityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  communityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  communityLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#98A2B3",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  communityName: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: "#101828",
    marginTop: 2,
  },
  timelineCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
  stepLabelCurrent: { color: "#0F766E" },
  stepLabelUpcoming: { color: "#98A2B3" },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: SolidFills.authWash,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  infoText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: "#475467",
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
    gap: 8,
  },
  footerButton: {
    height: 52,
    borderRadius: 14,
  },
  footerButtonText: {
    fontSize: 15,
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  linkBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: "#667085",
  },
});
