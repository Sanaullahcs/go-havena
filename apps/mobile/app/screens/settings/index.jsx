import { ActivityIndicator, I18nManager, Switch, StyleSheet, Text, View, Pressable } from "react-native";
import React, { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalPageShell from "../../../components/layout/internal-page-shell";
import MenuGroup from "../../../components/layout/menu-group";
import ListRow from "../../../components/ui/list-row";
import { Fonts } from "../../../constants/font";
import { HomeTheme as T } from "../../../constants/home-theme";
import { useRouter } from "expo-router";
import { confirmSignOut } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { usePushNotificationSettings } from "../../../hooks/use-push-notification-settings";
import { useLanguage } from "../../../providers/language-provider";
import { SUPPORTED } from "../../../i18n";
import { sw, sf } from "../../../utils/responsive";

const LANGUAGE_OPTIONS = [
  { code: "en", flag: "🇺🇸" },
  { code: "es", flag: "🇪🇸" },
  { code: "ar", flag: "🇸🇦" },
];

export default function ProfileSetting() {
  const router = useRouter();
  const dialog = useAppDialog();
  const { t } = useTranslation();
  const { language, changeLanguage } = useLanguage();
  const [langPickerOpen, setLangPickerOpen] = useState(false);
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

  const accountData = [
    {
      id: 1,
      title: t("settings.editProfile"),
      subTitle: t("settings.editProfileSub"),
      icon: "edit-3",
      iconColor: "#0A2A43",
      iconBg: "#D1FAF5",
      onPress: () =>
        router.push({
          pathname: "/screens/complete-profile",
          params: { mode: "edit" },
        }),
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
    { id: 1, title: t("settings.helpCenter"), subTitle: t("settings.helpCenterSub"), icon: "help-circle", iconColor: "#0A2A43", iconBg: "#D1FAF5", chevron: true, onPress: () => {} },
    { id: 2, title: t("settings.aboutHavena"), subTitle: t("common.version", { version: "1.0.0" }), icon: "info", iconColor: "#6B7280", iconBg: "#F3F4F6", chevron: true, onPress: () => {} },
    { id: 3, title: t("settings.logOut"), subTitle: t("settings.logOutSub"), icon: "log-out", iconColor: "#DC2626", iconBg: "#FEF2F2", danger: true, onPress: handleLogout },
    { id: 4, title: t("settings.deleteAccount"), subTitle: t("settings.deleteAccountSub"), icon: "trash-2", iconColor: "#DC2626", iconBg: "#FEF2F2", danger: true, onPress: () => dialog.showError(t("settings.deleteAccount"), t("settings.deleteAccountMsg")) },
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
            <View style={styles.langCurrent}>
              <Text style={styles.langFlag}>{currentLang.flag}</Text>
              <Text style={styles.langName}>{t(`languages.${language}`)}</Text>
              <Feather
                name={langPickerOpen ? "chevron-up" : "chevron-down"}
                size={sf(16)}
                color={T.gray}
              />
            </View>
          }
        />
        {langPickerOpen && (
          <View style={styles.langOptions}>
            {LANGUAGE_OPTIONS.map((opt) => {
              const active = opt.code === language;
              const isRtl = opt.code === "ar";
              return (
                <Pressable
                  key={opt.code}
                  style={({ pressed }) => [
                    styles.langOption,
                    active && styles.langOptionActive,
                    pressed && styles.langOptionPressed,
                  ]}
                  onPress={() => handleLanguageSelect(opt.code)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t(`languages.${opt.code}`)}
                >
                  <View style={styles.langOptionRow}>
                    <Text style={styles.langOptionFlag}>{opt.flag}</Text>
                    <Text
                      style={[
                        styles.langOptionText,
                        active && styles.langOptionTextActive,
                        isRtl && styles.langOptionTextRtl,
                      ]}
                      numberOfLines={1}
                    >
                      {t(`languages.${opt.code}`)}
                    </Text>
                  </View>
                  {active && (
                    <Feather name="check-circle" size={sf(18)} color={T.deepTeal} />
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

      <Text style={styles.footer}>{t("settings.footer", { version: "1.0.0" })}</Text>
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
  langCurrent: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingVertical: sw(4),
    paddingHorizontal: sw(10),
    borderRadius: sw(8),
    backgroundColor: "#F8FAFC",
  },
  langFlag: {
    fontSize: sf(18),
  },
  langName: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: T.navy,
    fontWeight: "500",
  },
  langOptions: {
    paddingHorizontal: sw(16),
    paddingTop: sw(4),
    paddingBottom: sw(14),
    gap: sw(10),
  },
  langOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: sw(56),
    paddingVertical: sw(14),
    paddingHorizontal: sw(16),
    borderRadius: sw(14),
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: T.border,
  },
  langOptionActive: {
    backgroundColor: T.mint,
    borderColor: T.teal,
  },
  langOptionPressed: {
    opacity: 0.85,
  },
  langOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    flex: 1,
  },
  langOptionFlag: {
    fontSize: sf(22),
  },
  langOptionText: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    color: T.navy,
    fontWeight: "600",
  },
  langOptionTextActive: {
    color: T.deepTeal,
  },
  langOptionTextRtl: {
    writingDirection: "rtl",
    textAlign: I18nManager.isRTL ? "left" : "right",
  },
});
