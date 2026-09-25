import { useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { getUser } from "../services/auth-session";
import { isCommunityAdmin } from "../services/community-access";
import { useSafeModeBack } from "./use-safe-mode-back";

/** Keep Community Admin screens closed to residents and Resident Mode. */
export function useRequireCommunityAdmin() {
  const router = useRouter();
  useSafeModeBack();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        const user = await getUser();
        if (cancelled) return;
        if (!isCommunityAdmin(user)) {
          router.replace("/(tabs)/home");
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [router]),
  );
}
