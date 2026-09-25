import { ActivityIndicator, Linking, Switch, StyleSheet, Text, View, Pressable } from "react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalPageShell from "../../../components/layout/internal-page-shell";
import MenuGroup from "../../../components/layout/menu-group";
import ListRow from "../../../components/ui/list-row";
import { Fonts } from "../../../constants/font";
import { HomeTheme as T } from "../../../constants/home-theme";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { confirmSignOut } from "../../../services/sign-out";
import { deleteAccount } from "../../../services/auth-api";
import { getApiErrorMessage } from "../../../utils/auth-errors";
import { setCurrentRole } from "../../../constants/role-session";
import {
  CONTACT_URL,
  PRIVACY_POLICY_URL,
  SUPPORT_EMAIL,
  TERMS_OF_SERVICE_URL,
} from "../../../constants/legal";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { usePushNotificationSettings } from "../../../hooks/use-push-notification-settings";
import { useLanguage } from "../../../providers/language-provider";
import { sw, sf } from "../../../utils/responsive";
import {
  clearDevInstalledVersionOverride,
  getDevInstalledVersionOverride,
  getRealInstalledAppVersion,
  setDevInstalledVersionOverride,
} from "../../../services/app-version";

const LANGUAGE_OPTIONS = [
  { code: "en", flag: "🇺🇸", nativeName: "English" },
  { code: "es", flag: "🇪🇸", nativeName: "Español" },
  { code: "ar", flag: "🇸🇦", nativeName: "العربية" },
];

export default function ProfileSetting() {
  const router = useRouter();
  const dialog = useAppDialog();
  const { t } = useTranslation();
  const { language, changeLanguage } = useLanguage();
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const appVersion = getRealInstalledAppVersion();
  const [devOverride, setDevOverride] = useState(null);
  const {
    pushEnabled,
    emailEnabled,
    loading,
    pushBusy,
    emailBusy,
    setPush,
    setEmail,
    openSystemSettings,
  } = usePushNotificationSettings();

  const refreshDevOverride = useCallback(async () => {
    if (!__DEV__) return;
    setDevOverride(await getDevInstalledVersionOverride());
  }, []);

  useEffect(() => {
    void refreshDevOverride();
  }, [refreshDevOverride]);

  const applyDevVersionScenario = useCallback(
    async (version) => {
      if (!__DEV__) return;
      if (version) {
        await setDevInstalledVersionOverride(version);
      } else {
        await clearDevInstalledVersionOverride();
      }
      await refreshDevOverride();
      await dialog.showDialog({
        type: "info",
        title: "Dev version override",
        message: version
          ? `Installed version simulated as ${version}. The update check re-runs immediately. Configure System Admin App Version settings for the scenario under test.`
          : "Override cleared. Using the real installed version again.",
        actions: [{ key: "ok", label: "OK", variant: "primary" }],
      });
    },
    [dialog, refreshDevOverride],
  );

  const handlePushToggle = async (nextValue) => {
    const result = await setPush(nextValue);
    if (result.ok) return;

    if (nextValue && /denied|permission/i.test(result.message ?? "")) {
      const choice = await dialog.showConfirm(
        t("settings.notificationsBlocked"),
        t("settings.notificationsBlockedMsg"),
        { confirmLabel: t("common.openSettings"), cancelLabel: t("common.notNow") },
      );
      if (choice === "confirm") {
        await openSystemSettings();
      }
      return;
    }

    await dialog.showError(t("settings.pushError"), result.message ?? t("settings.pushErrorMsg"));
  };

  const handleEmailToggle = async (nextValue) => {
    const result = await setEmail(nextValue);
    if (!result.ok) {
      await dialog.showError(t("settings.emailError"), result.message ?? t("settings.emailErrorMsg"));
    }
  };

  const handleLanguageSelect = async (code) => {
    setLangPickerOpen(false);
    if (code === language) return;
    await changeLanguage(code);
  };

  const handleLogout = () => confirmSignOut(dialog);

  const openLegalUrl = async (url) => {
    try {
      await WebBrowser.openBrowserAsync(url, {
        enableBarCollapsing: true,
        showTitle: true,
      });
      return;
    } catch {
      // Fall through to the system browser if the in-app browser is unavailable.
    }
    try {
      await Linking.openURL(url);
    } catch {
      await dialog.showError(t("common.error"), url);
    }
  };

  const handleDeleteAccount = async () => {
    const choice = await dialog.showConfirm(
      t("settings.deleteAccount"),
      t("settings.deleteAccountConfirmMsg"),
      { confirmLabel: t("settings.deleteAccountConfirm"), cancelLabel: t("common.cancel"), destructive: true },
    );
    if (choice !== "confirm") return;

    try {
      await deleteAccount();
      setCurrentRole("resident");
      if (router.canDismiss?.()) {
        router.dismissAll();
      }
      router.replace("/screens/login");
      await dialog.showSuccess(t("settings.deleteAccountDone"), t("settings.deleteAccountDoneMsg"));
    } catch (err) {
      await dialog.showError(t("settings.deleteAccount"), getApiErrorMessage(err) || t("settings.deleteAccountFailed"));
    }
  };

  const accountData = [
    {
      id: 1,
      title: t("settings.editProfile"),
      subTitle: t("settings.editProfileSub"),
      icon: "edit-3",
      iconColor: "#1B4F8A",
      iconBg: "#D1FAF5",
      onPress: () =>
        router.push({
          pathname: "/screens/complete-profile",
          params: { mode: "edit" },
        }),
    },
    {
      id: 2,
      title: t("settings.blockedUsers"),
      subTitle: t("settings.blockedUsersSub"),
      icon: "slash",
      iconColor: "#DC2626",
      iconBg: "#FEF2F2",
      onPress: () => router.push("/screens/blocked-users"),
    },
  ];

  const notification = [
    {
      id: 1,
      title: t("settings.pushNotifications"),
      subTitle: pushEnabled
        ? t("settings.pushEnabledSub")
        : t("settings.pushDisabledSub"),
      icon: "smartphone",
      iconColor: "#059669",
      iconBg: "#ECFDF5",
      enabled: pushEnabled,
      busy: pushBusy,
      onToggle: handlePushToggle,
    },
    {
      id: 2,
      title: t("settings.emailNotifications"),
      subTitle: emailEnabled
        ? t("settings.emailEnabledSub")
        : t("settings.emailDisabledSub"),
      icon: "mail",
      iconColor: "#0EA5E9",
      iconBg: "#D1FAF5",
      enabled: emailEnabled,
      busy: emailBusy,
      onToggle: handleEmailToggle,
    },
  ];

  const support = [
    { id: 1, title: t("settings.helpCenter"), subTitle: t("settings.helpCenterSub"), icon: "help-circle", iconColor: "#1B4F8A", iconBg: "#D1FAF5", chevron: true, onPress: () => openLegalUrl(CONTACT_URL) },
    { id: 2, title: t("settings.privacyPolicy"), subTitle: t("settings.privacyPolicySub"), icon: "shield", iconColor: "#1B4F8A", iconBg: "#D1FAF5", chevron: true, onPress: () => openLegalUrl(PRIVACY_POLICY_URL) },
    { id: 3, title: t("settings.termsOfService"), subTitle: t("settings.termsOfServiceSub"), icon: "file-text", iconColor: "#1B4F8A", iconBg: "#D1FAF5", chevron: true, onPress: () => openLegalUrl(TERMS_OF_SERVICE_URL) },
    { id: 4, title: t("settings.aboutHavena"), subTitle: t("common.version", { version: appVersion }), icon: "info", iconColor: "#6B7280", iconBg: "#F3F4F6", chevron: true, onPress: () => dialog.showSuccess(t("settings.aboutHavena"), t("settings.aboutHavenaMsg", { email: SUPPORT_EMAIL })) },
    { id: 5, title: t("settings.logOut"), subTitle: t("settings.logOutSub"), icon: "log-out", iconColor: "#DC2626", iconBg: "#FEF2F2", danger: true, onPress: handleLogout },
    { id: 6, title: t("settings.deleteAccount"), subTitle: t("settings.deleteAccountSub"), icon: "trash-2", iconColor: "#DC2626", iconBg: "#FEF2F2", danger: true, onPress: handleDeleteAccount },
  ];

  const currentLang = LANGUAGE_OPTIONS.find((l) => l.code === language) ?? LANGUAGE_OPTIONS[0];

  return (
    <InternalPageShell title={t("settings.title")} subtitle={t("settings.subtitle")}>
      <MenuGroup label={t("settings.account")}>
        {accountData.map((item) => (
          <ListRow
            key={item.id}
            flat
            title={item.title}
            subtitle={item.subTitle}
            icon={item.icon}
            iconColor={item.iconColor}
            iconBg={item.iconBg}
            onPress={item.onPress}
          />
        ))}
      </MenuGroup>

      {/* Language picker */}
      <MenuGroup label={t("settings.language")}>
        <ListRow
          flat
          title={t("settings.language")}
          subtitle={t("settings.languageSub")}
          icon="globe"
          iconColor={T.deepTeal}
          iconBg={T.mint}
          onPress={() => setLangPickerOpen(!langPickerOpen)}
          right={
            <Pressable
              style={styles.langCurrentPill}
              onPress={() => setLangPickerOpen(!langPickerOpen)}
            >
              <Text style={styles.langCurrentFlag}>{currentLang.flag}</Text>
              <Text style={styles.langCurrentName} numberOfLines={1}>
                {currentLang.nativeName}
              </Text>
              <Feather
                name={langPickerOpen ? "chevron-up" : "chevron-down"}
                size={sf(14)}
                color={T.deepTeal}
              />
            </Pressable>
          }
        />
        {langPickerOpen && (
          <View style={styles.langGrid}>
            {LANGUAGE_OPTIONS.map((opt) => {
              const active = opt.code === language;
              return (
                <Pressable
                  key={opt.code}
                  style={({ pressed }) => [
                    styles.langCard,
                    active && styles.langCardActive,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => handleLanguageSelect(opt.code)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t(`languages.${opt.code}`)}
                >
                  <Text style={styles.langCardFlag}>{opt.flag}</Text>
                  <Text
                    style={[styles.langCardNative, active && styles.langCardNativeActive]}
                    numberOfLines={1}
                  >
                    {opt.nativeName}
                  </Text>
                  <Text
                    style={[styles.langCardTranslated, active && styles.langCardTranslatedActive]}
                    numberOfLines={1}
                  >
                    {t(`languages.${opt.code}`)}
                  </Text>
                  {active && (
                    <View style={styles.langCardCheck}>
                      <Feather name="check" size={sf(12)} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </MenuGroup>

      <MenuGroup label={t("settings.notifications")}>
        {notification.map((item) => (
          <ListRow
            key={item.id}
            flat
            title={item.title}
            subtitle={item.subTitle}
            icon={item.icon}
            iconColor={item.iconColor}
            iconBg={item.iconBg}
            right={
              loading || item.busy ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <Switch
                  value={item.enabled}
                  onValueChange={item.onToggle}
                  trackColor={{ false: "#E5E7EB", true: "#10B981" }}
                  thumbColor="#FFFFFF"
                />
              )
            }
          />
        ))}
      </MenuGroup>

      <MenuGroup label={t("settings.support")}>
        {support.map((item) => (
          <ListRow
            key={item.id}
            flat
            title={item.title}
            subtitle={item.subTitle}
            icon={item.icon}
            iconColor={item.iconColor}
            iconBg={item.iconBg}
            danger={item.danger}
            onPress={item.onPress}
          />
        ))}
      </MenuGroup>

      {__DEV__ ? (
        <MenuGroup label="Dev · App Update">
          <ListRow
            flat
            title="Real installed version"
            subtitle={appVersion}
            icon="smartphone"
            iconColor="#64748B"
            iconBg="#F1F5F9"
          />
          <ListRow
            flat
            title="Active override"
            subtitle={devOverride || "None (using real version)"}
            icon="tool"
            iconColor="#D97706"
            iconBg="#FFFBEB"
          />
          <ListRow
            flat
            title="Simulate 1.0.1 (force / optional tests)"
            subtitle="Then set System Admin min/latest as needed"
            icon="alert-triangle"
            iconColor="#DC2626"
            iconBg="#FEF2F2"
            onPress={() => void applyDevVersionScenario("1.0.1")}
          />
          <ListRow
            flat
            title="Simulate 1.0.2 (no popup baseline)"
            subtitle="Matches current production baseline"
            icon="check-circle"
            iconColor="#059669"
            iconBg="#ECFDF5"
            onPress={() => void applyDevVersionScenario("1.0.2")}
          />
          <ListRow
            flat
            title="Clear version override"
            subtitle="Restore real installed version"
            icon="x-circle"
            iconColor="#64748B"
            iconBg="#F1F5F9"
            onPress={() => void applyDevVersionScenario("")}
          />
        </MenuGroup>
      ) : null}

      <Text style={styles.footer}>{t("settings.footer", { version: appVersion })}</Text>
    </InternalPageShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  langCurrentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    paddingVertical: sw(6),
    paddingHorizontal: sw(12),
    borderRadius: sw(20),
    backgroundColor: T.mint,
    borderWidth: 1,
    borderColor: T.teal,
  },
  langCurrentFlag: {
    fontSize: sf(16),
  },
  langCurrentName: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: T.deepTeal,
    fontWeight: "600",
    maxWidth: sw(70),
  },
  langGrid: {
    flexDirection: "row",
    paddingHorizontal: sw(14),
    paddingTop: sw(6),
    paddingBottom: sw(16),
    gap: sw(10),
  },
  langCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sw(16),
    paddingHorizontal: sw(6),
    borderRadius: sw(16),
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    position: "relative",
  },
  langCardActive: {
    backgroundColor: T.mint,
    borderColor: T.teal,
    borderWidth: 2,
  },
  langCardFlag: {
    fontSize: sf(28),
    marginBottom: sw(8),
  },
  langCardNative: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: T.navy,
    fontWeight: "700",
    textAlign: "center",
    writingDirection: "auto",
  },
  langCardNativeActive: {
    color: T.deepTeal,
  },
  langCardTranslated: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
    marginTop: sw(2),
    textAlign: "center",
    writingDirection: "auto",
  },
  langCardTranslatedActive: {
    color: T.teal,
  },
  langCardCheck: {
    position: "absolute",
    top: sw(8),
    end: sw(8),
    width: sw(20),
    height: sw(20),
    borderRadius: sw(10),
    backgroundColor: T.deepTeal,
    alignItems: "center",
    justifyContent: "center",
  },
});
