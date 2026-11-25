import { useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { useSessionUser } from "./use-session-user";
import { isCommunityAdmin } from "../services/community-access";

/** Resident complaint screens close when Community Admin mode is active. */
export function useResidentComplaintMode() {
  const router = useRouter();
  const user = useSessionUser();

  useFocusEffect(
    useCallback(() => {
      if (user && isCommunityAdmin(user)) {
        router.replace("/screens/admin-complaints");
      }
    }, [router, user]),
  );
}

/** Service request management stays closed in Resident Mode and for residents. */
export function useAdminComplaintMode() {
  const router = useRouter();
  const user = useSessionUser();

  useFocusEffect(
    useCallback(() => {
      if (user && !isCommunityAdmin(user)) {
        router.replace("/screens/complaints");
      }
    }, [router, user]),
  );
}
