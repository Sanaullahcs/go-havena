import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Linking,
  TouchableOpacity,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { Fonts } from "../../../constants/font";
import { Colors, SolidFills } from "../../../constants/tokens";
import { resolveAdminPortalBaseUrl } from "../../../constants/api-config";
import { createBillingReturnUrl } from "../../../constants/app-linking";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import { navigateAfterAuth } from "../../../constants/onboarding-routes";
import { getUser } from "../../../services/auth-session";
import { createWebHandoff, fetchMe } from "../../../services/auth-api";
import { confirmSignOut } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import {
  canAccessDashboard,
  getPrimaryMembership,
  isBillingExempt,
} from "../../../services/community-access";

WebBrowser.maybeCompleteAuthSession();

export const options = { headerShown: false };

function resolveAdminPortalUrl(fromAccess) {
  // Expo Go on a phone cannot open localhost or the production site while the
  // API/frontend are on LAN. Always use the Metro LAN host on port 3000.
  if (__DEV__) {
    return `${resolveAdminPortalBaseUrl()}/admin/billing`;
  }

  const candidate = String(fromAccess?.billing_url || "").trim();
  const unusable =
    !candidate ||
    /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(candidate);

  if (!unusable) {
    return candidate.replace(/\/$/, "");
  }

  return `${resolveAdminPortalBaseUrl()}/admin/billing`;
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

function isBillingStillRequired(user) {
  if (!user) return true;
  const access = user.access ?? {};
  if (isBillingExempt(user) || access.card_on_file || access.billing_complete) return false;
  const nextStep = access.next_step;
  if (nextStep === "await_approval" || nextStep === "ready" || nextStep === "configure_resident_features") return false;
  return nextStep === "complete_billing_web";
}

export default function CompleteBillingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [billingExempt, setBillingExempt] = useState(false);
  const [communityName, setCommunityName] = useState("");
  const openedPortalRef = useRef(false);
  const pollTimersRef = useRef([]);
  const awaitingApprovalRef = useRef(false);

  const clearPollTimers = useCallback(() => {
    pollTimersRef.current.forEach((id) => clearTimeout(id));
    pollTimersRef.current = [];
  }, []);

  const syncFromUser = useCallback(
    (user) => {
      if (canAccessDashboard(user)) {
        openedPortalRef.current = false;
        clearPollTimers();
        navigateAfterAuth(router, user);
        return;
      }

      const nextStep = user?.access?.next_step;
      if (nextStep === "rejected") {
        openedPortalRef.current = false;
        clearPollTimers();
        navigateAfterAuth(router, user, { role: "admin" });
        return;
      }
      if (nextStep && !["complete_billing_web", "await_approval", "ready"].includes(nextStep)) {
        openedPortalRef.current = false;
        clearPollTimers();
        navigateAfterAuth(router, user, { role: "admin" });
        return;
      }

      const membership = getPrimaryMembership(user);
      setCommunityName(membership?.community?.name || membership?.community?.title || "");
      const exempt = isBillingExempt(user);
      setBillingExempt(exempt);
      // Prefer card_on_file over a possibly-stale next_step so the Continue CTA hides right away.
      // Exempt regions skip checkout — never treat them as needing a card.
      const nextAwaiting =
        nextStep === "await_approval" ||
        exempt ||
        (!exempt && Boolean(user?.access?.card_on_file));
      awaitingApprovalRef.current = nextAwaiting;
      setAwaitingApproval(nextAwaiting);

      if (nextAwaiting || !isBillingStillRequired(user)) {
        openedPortalRef.current = false;
        clearPollTimers();
      }
    },
    [clearPollTimers, router],
  );

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      try {
        const user = await fetchMe();
        syncFromUser(user);
        return user;
      } catch {
        const cached = await getUser();
        if (cached) syncFromUser(cached);
        return cached ?? null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [syncFromUser],
  );

  /** After browser checkout, Stripe/webhook may lag — poll a few times on return. */
  const refreshAfterBrowserReturn = useCallback(async () => {
    clearPollTimers();
    const user = await refresh(true);
    if (!openedPortalRef.current || !isBillingStillRequired(user) || awaitingApprovalRef.current) {
      return;
    }

    const delaysMs = [1200, 2800, 5000];
    delaysMs.forEach((delay) => {
      const timer = setTimeout(async () => {
        if (!openedPortalRef.current || awaitingApprovalRef.current) return;
        const next = await refresh(true);
        if (!isBillingStillRequired(next) || awaitingApprovalRef.current) {
          openedPortalRef.current = false;
          clearPollTimers();
        }
      }, delay);
      pollTimersRef.current.push(timer);
    });
  }, [clearPollTimers, refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh(true);
      return () => clearPollTimers();
    }, [clearPollTimers, refresh]),
  );

  // Linking.openURL returns immediately; when the user switches back to the app
  // the screen never remounts, so we must refresh on AppState "active".
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void (openedPortalRef.current ? refreshAfterBrowserReturn() : refresh(true));
      }
    });
    return () => {
      sub.remove();
      clearPollTimers();
    };
  }, [clearPollTimers, refresh, refreshAfterBrowserReturn]);

  // Deep link return (exp://…/complete-billing or havena://…) after web done page.
  useEffect(() => {
    const onUrl = ({ url }) => {
      if (!url || !String(url).includes("complete-billing")) return;
      openedPortalRef.current = true;
      void refreshAfterBrowserReturn();
    };
    const sub = Linking.addEventListener("url", onUrl);
    return () => sub.remove();
  }, [refreshAfterBrowserReturn]);

  const handleSignOut = () => confirmSignOut(dialog);

  const openAdminPortal = async () => {
    const returnUrl = createBillingReturnUrl();
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
    openedPortalRef.current = true;
    try {
      const code = await createWebHandoff();
      if (code) url = appendQuery(url, { handoff: code });
    } catch {
      // Still open the portal — they can sign in with the same email.
    }

    if (__DEV__) {
      console.log("[Havena] Opening billing portal:", url);
    }

    // HTTP LAN URLs: Chrome Custom Tabs often close immediately. Open the
    // system browser. HTTPS: same in-app browser as Terms of Service.
    const isPlainHttp = /^http:\/\//i.test(url);
    let waitedForReturn = false;
    try {
      if (isPlainHttp) {
        await Linking.openURL(url);
      } else {
        try {
          waitedForReturn = true;
          await WebBrowser.openAuthSessionAsync(url, returnUrl, {
            showInRecents: true,
            createTask: false,
          });
        } catch {
          waitedForReturn = false;
          await WebBrowser.openBrowserAsync(url, {
            enableBarCollapsing: true,
            showTitle: true,
            showInRecents: true,
          });
        }
      }
    } catch {
      try {
        await Linking.openURL(url);
      } catch {
        openedPortalRef.current = false;
        await dialog.showError(
          t("common.error", { defaultValue: "Error" }),
          t("billing.cannotOpenBrowser", {
            defaultValue: "Could not open the admin portal. Try again or use a desktop browser.",
          }) + `\n\n${url}`,
        );
      }
    } finally {
      setOpening(false);
      if (waitedForReturn) {
        await refreshAfterBrowserReturn();
      }
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
        billingExempt
          ? {
              label: t("billing.timelineSubmitted", { defaultValue: "Community submitted" }),
              status: "done",
            }
          : { label: t("billing.timelineCard", { defaultValue: "Card saved" }), status: "done" },
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
                ? billingExempt
                  ? t("billing.submittedBadge", { defaultValue: "Request submitted" })
                  : t("billing.cardSavedBadge", { defaultValue: "Card on file" })
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
              ? billingExempt
                ? t("billing.waitingBodyExempt", {
                    defaultValue:
                      "Your community request has been submitted. A Havena administrator will review your community. Once approved, you’ll get access to your dashboard.",
                  })
                : t("billing.waitingBody", {
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
