import React, { useCallback, useEffect, useState } from "react";
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
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";

import { Fonts } from "../../../constants/font";
import { Colors, SolidFills } from "../../../constants/tokens";
import { API_BASE_URL } from "../../../constants/api-config";
import AuthSubmitButton from "../../../components/ui/auth-submit-button";
import { navigateAfterAuth } from "../../../constants/onboarding-routes";
import { getUser } from "../../../services/auth-session";
import { fetchMe } from "../../../services/auth-api";
import { confirmSignOut } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { canAccessDashboard } from "../../../services/community-access";

WebBrowser.maybeCompleteAuthSession();

export const options = { headerShown: false };

/** Opens the community admin portal URL (activation handled outside the app). */
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
    // Same host as the API, admin dashboard port 3000.
    return `${api.protocol}//${api.hostname}:3000/admin/billing`;
  } catch {
    return "http://192.168.0.134:3000/admin/billing";
  }
}

/**
 * Community admins finish portal activation outside the app.
 * User-facing copy avoids payment-provider or external checkout language (App Store).
 */
export default function CompleteBillingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portalUrl, setPortalUrl] = useState(() => resolveAdminPortalUrl(null));
  const [opening, setOpening] = useState(false);

  const syncFromUser = useCallback(
    (user) => {
      if (canAccessDashboard(user)) {
        navigateAfterAuth(router, user);
        return;
      }

      const nextStep = user?.access?.next_step;
      if (nextStep === "await_approval" || nextStep === "rejected") {
        navigateAfterAuth(router, user, { role: "admin" });
        return;
      }
      if (nextStep && nextStep !== "complete_billing_web" && nextStep !== "ready") {
        navigateAfterAuth(router, user, { role: "admin" });
        return;
      }

      setPortalUrl(resolveAdminPortalUrl(user?.access));
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
        else setPortalUrl(resolveAdminPortalUrl(null));
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

  const copyPortalUrl = async () => {
    try {
      await Clipboard.setStringAsync(portalUrl);
      await dialog.showSuccess(
        t("common.copied", { defaultValue: "Copied" }),
        t("billing.urlCopied", {
          defaultValue: "Admin portal link copied.",
        }),
      );
    } catch {
      await dialog.showError(t("common.error", { defaultValue: "Error" }), portalUrl);
    }
  };

  const openAdminPortal = async () => {
    const url = resolveAdminPortalUrl({ billing_url: portalUrl });
    setPortalUrl(url);
    setOpening(true);
    try {
      // Prefer Custom Tabs / SFSafariViewController — more reliable than Linking on Android.
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        showTitle: true,
        enableBarCollapsing: true,
        createTask: true,
      });
    } catch {
      try {
        // Do NOT gate on Linking.canOpenURL — Android 11+ often returns false for http://.
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
            <Ionicons name="laptop-outline" size={26} color={Colors.brandPrimaryDeep} />
          </View>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusBadgeText}>
              {t("billing.setupRequired", { defaultValue: "One step left" })}
            </Text>
          </View>
          <Text style={styles.title}>
            {t("billing.completeSetupTitle", {
              defaultValue: "Activate your community",
            })}
          </Text>
          <Text style={styles.subtitle}>
            {t("billing.completeSetupBody", {
              defaultValue:
                "Community administrators complete account activation in the Havena Admin Portal. When you're done, return here and refresh your status.",
            })}
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {t("billing.howItWorks", { defaultValue: "Next steps" })}
            </Text>
            <Text style={styles.stepLine}>
              1.{" "}
              {t("billing.stepOpenWeb", {
                defaultValue: "Open the Havena Admin Portal on a desktop or tablet",
              })}
            </Text>
            <Text style={styles.stepLine}>
              2.{" "}
              {t("billing.stepChoosePlan", {
                defaultValue: "Sign in with the same phone number you used in this app",
              })}
            </Text>
            <Text style={styles.stepLine}>
              3.{" "}
              {t("billing.stepReturn", {
                defaultValue: "Finish community administrator activation in the portal",
              })}
            </Text>
            <Text style={styles.stepLine}>
              4.{" "}
              {t("billing.stepRefresh", {
                defaultValue: "Return here and tap Refresh status",
              })}
            </Text>
          </View>

          {__DEV__ ? (
            <View style={styles.urlCard}>
              <Text style={styles.urlLabel}>
                {t("billing.setupLink", { defaultValue: "Developer portal link" })}
              </Text>
              <Text selectable style={styles.urlText} numberOfLines={3}>
                {portalUrl}
              </Text>
              <TouchableOpacity style={styles.copyBtn} onPress={copyPortalUrl}>
                <Ionicons name="copy-outline" size={14} color={Colors.brandPrimaryDeep} />
                <Text style={styles.copyBtnText}>
                  {t("billing.copyLink", { defaultValue: "Copy link" })}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.infoCard}>
            <Ionicons name="notifications-outline" size={16} color={Colors.brandPrimaryDeep} />
            <Text style={styles.infoText}>
              {t("billing.refreshHint", {
                defaultValue:
                  "Your administrator access updates automatically once activation is complete. Pull down to refresh anytime.",
              })}
            </Text>
          </View>
        </View>
      </ScrollView>

      <SafeAreaView style={styles.footer} edges={["bottom"]}>
        <AuthSubmitButton
          label={
            opening
              ? t("billing.opening", { defaultValue: "Opening…" })
              : t("billing.openWebSetup", { defaultValue: "Open Admin Portal" })
          }
          loadingLabel={t("billing.opening", { defaultValue: "Opening…" })}
          enabled={!opening}
          loading={opening}
          style={styles.footerButton}
          textStyle={styles.footerButtonText}
          onPress={openAdminPortal}
        />
        <AuthSubmitButton
          label={
            refreshing
              ? t("guests.checking", { defaultValue: "Checking…" })
              : t("billing.iveFinished", { defaultValue: "Refresh status" })
          }
          loadingLabel={t("guests.checking", { defaultValue: "Checking…" })}
          enabled={!refreshing}
          loading={refreshing}
          solidColor={Colors.brandPrimary}
          style={styles.footerButtonSecondary}
          textStyle={styles.footerButtonText}
          onPress={() => refresh(true)}
        />
        <TouchableOpacity style={styles.linkBtn} onPress={handleSignOut}>
          <Text style={styles.linkBtnText}>
            {t("guests.signOut", { defaultValue: "Sign out" })}
          </Text>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    marginBottom: 10,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#14B8A6",
  },
  statusBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    color: "#14B8A6",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    lineHeight: 26,
    color: "#101828",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: "#667085",
    textAlign: "center",
    maxWidth: 320,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  card: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: "#101828",
    marginBottom: 8,
  },
  stepLine: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: "#475467",
    marginBottom: 5,
  },
  urlCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  urlLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#101828",
    marginBottom: 4,
  },
  urlText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.brandPrimaryDeep,
  },
  copyBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: SolidFills.authWash,
  },
  copyBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: Colors.brandPrimaryDeep,
  },
  infoCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: SolidFills.authWash,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: "#475467",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
    gap: 8,
  },
  footerButton: {
    height: 44,
  },
  footerButtonSecondary: {
    height: 44,
    backgroundColor: Colors.brandPrimary,
  },
  footerButtonText: {
    fontSize: 15,
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: 6,
  },
  linkBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: "#667085",
  },
});
