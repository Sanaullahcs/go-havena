import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
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
  defaultTitle = "Could not load content",
  children,
}) {
  if (error && isFeatureAccessBlockedError(error)) {
    return (
      <GuestFeatureErrorState
        error={error}
        fallbackFeature={feature}
        defaultTitle={defaultTitle}
        onRetry={onRetry}
        compact={compact}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0A2A43" />
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
