import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { navigateAfterAuth } from "../../../constants/onboarding-routes";
import { fetchMe } from "../../../services/auth-api";
import { getUser } from "../../../services/auth-session";

/** Old signup screen. Feature changes live in Settings. */
export default function ResidentFeaturesScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await fetchMe();
        if (!cancelled) navigateAfterAuth(router, user, { role: "admin" });
      } catch {
        if (!cancelled) navigateAfterAuth(router, getUser(), { role: "admin" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F4FBFD" }}>
      <ActivityIndicator />
    </View>
  );
}
