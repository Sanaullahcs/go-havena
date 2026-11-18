import { useCallback } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { safeGoBack } from "../utils/app-navigation";

/** Android hardware Back uses the same safe Community Admin fallback as the header. */
export function useSafeModeBack(fallbackPath) {
  const router = useRouter();
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        return safeGoBack(router, navigation, { fallbackPath });
      });
      return () => sub.remove();
    }, [fallbackPath, navigation, router]),
  );
}
