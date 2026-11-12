import { useCallback } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { safeGoBack } from "../utils/app-navigation";

/**
 * Pop the complaints stack. Hardware Back and the header share this path so
 * neither one falls through to Home while My Complaints is still underneath.
 */
export function useComplaintBack(fallbackPath = "/screens/complaints") {
  const router = useRouter();
  const navigation = useNavigation();

  const goBack = useCallback(() => {
    const state = typeof navigation?.getState === "function" ? navigation.getState() : null;
    const index = Number.isInteger(state?.index) ? state.index : 0;
    // Pop only this stack. Parent history can go back to Home, and that must not run while a complaint screen is open.
    if (index > 0) {
      navigation.goBack();
      return true;
    }
    if (fallbackPath) {
      router.replace(fallbackPath);
      return true;
    }
    return safeGoBack(router, navigation);
  }, [fallbackPath, navigation, router]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => goBack());
      return () => sub.remove();
    }, [goBack]),
  );

  return goBack;
}
