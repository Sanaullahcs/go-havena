import React from "react";
import { Stack } from "expo-router";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import MinimalStatusCenter from "../components/ui/minimal-status-center";
import { featureFallbackPath } from "../constants/community-feature-routes";
import { useSessionUser } from "../hooks/use-session-user";

export default function NotFoundScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useSessionUser();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(featureFallbackPath(user));
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.screen} edges={["top", "left", "right", "bottom"]}>
        <MinimalStatusCenter
          code="404"
          title={t("common.notFoundHeading")}
          description={t("common.notFoundDescription")}
          actionLabel={t("common.back")}
          onAction={goBack}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
});