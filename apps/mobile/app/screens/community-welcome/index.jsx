import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import ProductWelcome from "../../../components/welcome/product-welcome";
import { continueFromCommunityWelcome, shouldShowCommunityWelcome } from "../../../constants/onboarding-routes";
import { Colors } from "../../../constants/tokens";
import { fetchMe } from "../../../services/auth-api";
import { getUser } from "../../../services/auth-session";

export default function CommunityWelcomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      let current = null;
      try {
        current = await fetchMe();
      } catch {
        current = await getUser();
      }

      if (!mounted || !current) return;

      if (!shouldShowCommunityWelcome(current)) {
        continueFromCommunityWelcome(router, current);
        return;
      }

      setUser(current);
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (!user) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.brandPrimaryDeep} />
      </View>
    );
  }

  return <ProductWelcome user={user} onContinue={() => continueFromCommunityWelcome(router, user)} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E3EDF8",
  },
});
