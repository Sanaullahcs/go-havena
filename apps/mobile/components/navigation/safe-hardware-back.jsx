import { useEffect } from "react";
import { BackHandler } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { safeGoBack } from "../../utils/app-navigation";

/** Android system Back uses the same history rules as the header back button. */
export default function SafeHardwareBack() {
  const router = useRouter();
  const navigation = useNavigation();

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      return safeGoBack(router, navigation);
    });
    return () => sub.remove();
  }, [navigation, router]);

  return null;
}
