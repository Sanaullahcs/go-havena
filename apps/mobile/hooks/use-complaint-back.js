import { useCallback } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { safeGoBack } from "../utils/app-navigation";

/**
 * Prefer a real stack pop when this navigator can go back; otherwise replace
 * to the complaints list. Never call goBack() when the stack is empty — that
 * triggers React Navigation's "GO_BACK was not handled" LogBox warning.
 */
export function useComplaintBack(fallbackPath = "/screens/complaints") {
  const router = useRouter();
  const navigation = useNavigation();

  const goBack = useCallback(() => {
    try {
      if (typeof navigation?.canGoBack === "function" && navigation.canGoBack()) {
        navigation.goBack();
        return true;
      }
    } catch {
      // Fall through to replace.
    }

    if (fallbackPath) {
      try {
        router.replace(fallbackPath);
        return true;
      } catch {
        // Fall through to safeGoBack.
      }
    }

    return safeGoBack(router, navigation, { fallbackPath });
  }, [fallbackPath, navigation, router]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => goBack());
      return () => sub.remove();
    }, [goBack]),
  );

  return goBack;
}
