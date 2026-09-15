import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useRouter, useRootNavigationState } from "expo-router";
import { fetchMe } from "../../services/auth-api";
import { getUser, setGuestSessionTerminatedHandler } from "../../services/auth-session";
import { isGuestUser } from "../../services/community-access";
import {
  enforceGuestAccessFromUser,
  guestRejectedStatusRoute,
  handleGuestAccessTerminationError,
  handleGuestUnauthorized,
} from "../../utils/guest-access-schedule";

const POLL_MS = 20000;

/** Keeps guest sessions in sync when access is revoked, rejected, or expired. */
export default function GuestSessionGuard() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const appState = useRef(AppState.currentState);
  const navigationReady = Boolean(rootNavigationState?.key);

  useEffect(() => {
    if (!navigationReady) return undefined;

    setGuestSessionTerminatedHandler((notice) => {
      if (notice === "GUEST_ACCESS_REJECTED") {
        router.replace(guestRejectedStatusRoute({ code: "GUEST_ACCESS_REJECTED" }));
        return;
      }

      router.replace({
        pathname: "/screens/guest-login",
        params: notice ? { notice } : {},
      });
    });

    return () => setGuestSessionTerminatedHandler(null);
  }, [navigationReady, router]);

  useEffect(() => {
    if (!navigationReady) return undefined;

    let interval;
    let cancelled = false;

    const syncGuestAccess = async () => {
      const user = await getUser();
      if (!isGuestUser(user) || cancelled) return;

      try {
        const fresh = await fetchMe();
        if (!cancelled) {
          await enforceGuestAccessFromUser(fresh, router);
        }
      } catch (err) {
        if (cancelled) return;
        if (await handleGuestAccessTerminationError(err, router)) return;
        await handleGuestUnauthorized(err, router);
      }
    };

    const startTimer = setTimeout(syncGuestAccess, 1500);
    interval = setInterval(syncGuestAccess, POLL_MS);

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        syncGuestAccess();
      }
      appState.current = nextState;
    });

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      if (interval) clearInterval(interval);
      subscription.remove();
    };
  }, [navigationReady, router]);

  return null;
}
