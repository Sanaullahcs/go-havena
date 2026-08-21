import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import GuestFeatureErrorState from "../guest/guest-permission-denied-state";
import { isFeatureAccessBlockedError } from "../../utils/guest-permission-errors";

/**
 * Hides screen content and shows the shared guest/suspension blocked card.
 */
export default function FeatureAccessGate({
  feature,
  error,
  loading = false,
  onRetry,
  compact = false,
  defaultTitle,
  children,
}) {
  const { t } = useTranslation();
  const resolvedTitle = defaultTitle ?? t("common.couldNotLoad");
  if (error && isFeatureAccessBlockedError(error)) {
    return (
      <GuestFeatureErrorState
        error={error}
        fallbackFeature={feature}
        defaultTitle={resolvedTitle}
        onRetry={onRetry}
        compact={compact}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1B4F8A" />
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
});
