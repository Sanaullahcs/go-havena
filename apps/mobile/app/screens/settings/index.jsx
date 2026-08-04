import { ActivityIndicator, Switch, StyleSheet, Text } from "react-native";
import React from "react";
import InternalPageShell from "../../../components/layout/internal-page-shell";
import MenuGroup from "../../../components/layout/menu-group";
import ListRow from "../../../components/ui/list-row";
import { Fonts } from "../../../constants/font";
import { useRouter } from "expo-router";
import { confirmSignOut } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { usePushNotificationSettings } from "../../../hooks/use-push-notification-settings";

export default function ProfileSetting() {
  const router = useRouter();
  const dialog = useAppDialog();
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
        "Notifications blocked",
        "Enable notifications for Havena in your phone settings, then turn push notifications on again.",
        { confirmLabel: "Open Settings", cancelLabel: "Not now" },
      );
      if (choice === "confirm") {
        await openSystemSettings();
      }
      return;
    }

    await dialog.showError("Push notifications", result.message ?? "Could not update push notifications.");
  };

  const handleEmailToggle = async (nextValue) => {
    const result = await setEmail(nextValue);
    if (!result.ok) {
      await dialog.showError("Email notifications", result.message ?? "Could not save your preference.");
    }
  };

  const handleLogout = () => confirmSignOut(dialog);

  const accountData = [
    {
      id: 1,
      title: "Edit Profile",
      subTitle: "Update your name, email, and bio",
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
      title: "Push Notifications",
      subTitle: pushEnabled
        ? "Alerts enabled on this device"
        : "Get notified about activity",
      icon: "smartphone",
      iconColor: "#059669",
      iconBg: "#ECFDF5",
      enabled: pushEnabled,
      busy: pushBusy,
      onToggle: handlePushToggle,
    },
    {
      id: 2,
      title: "Email Notifications",
      subTitle: emailEnabled
        ? "Email updates are enabled on this device"
        : "Receive updates via email",
      icon: "mail",
      iconColor: "#0EA5E9",
      iconBg: "#D1FAF5",
      enabled: emailEnabled,
      busy: emailBusy,
      onToggle: handleEmailToggle,
    },
  ];

  const support = [
    { id: 1, title: "Help Center", subTitle: "FAQs and support articles", icon: "help-circle", iconColor: "#0A2A43", iconBg: "#D1FAF5", chevron: true, onPress: () => {} },
    { id: 2, title: "About Havena", subTitle: "Version 1.0.0", icon: "info", iconColor: "#6B7280", iconBg: "#F3F4F6", chevron: true, onPress: () => {} },
    { id: 3, title: "Log Out", subTitle: "Sign out of your account", icon: "log-out", iconColor: "#DC2626", iconBg: "#FEF2F2", danger: true, onPress: handleLogout },
    { id: 4, title: "Delete Account", subTitle: "Permanently delete your account", icon: "trash-2", iconColor: "#DC2626", iconBg: "#FEF2F2", danger: true, onPress: () => dialog.showError("Delete Account", "Please contact support to delete your account.") },
  ];

  return (
    <InternalPageShell title="Settings" subtitle="Manage your account">
      <MenuGroup label="Account">
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

      <MenuGroup label="Notifications">
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

      <MenuGroup label="Support">
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

      <Text style={styles.footer}>Havena · Version 1.0.0</Text>
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
});
