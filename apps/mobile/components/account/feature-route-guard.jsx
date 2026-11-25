import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { fetchMe } from "../../services/auth-api";
import { getToken, getUser } from "../../services/auth-session";
import { useSessionUser } from "../../hooks/use-session-user";
import { featureFallbackPath, isFeaturePathAllowed } from "../../constants/community-feature-routes";

async function refreshFeatureUser() {
  const token = await getToken();
  if (!token) return null;
  try {
    return await fetchMe();
  } catch {
    return getUser();
  }
}

/** Send deep links and leftover screens away when their feature is turned off. */
export default function FeatureRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionUser();
  const redirecting = useRef(false);

  useEffect(() => {
    void refreshFeatureUser();
  }, [pathname, user?.id, user?.active_context_community_id, user?.active_context, user?.active_mode]);

  useEffect(() => {
    const refresh = () => {
      void refreshFeatureUser();
    };
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" || state === "unknown") refresh();
    });
    const timer = setInterval(() => {
      const state = AppState.currentState;
      if (state === "background") return;
      refresh();
    }, 4000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!user?.resident_features?.features || !pathname || redirecting.current) return;
    if (isFeaturePathAllowed(pathname, user)) return;
    const next = featureFallbackPath(user);
    if (pathname === next || pathname.endsWith(next)) return;
    redirecting.current = true;
    router.replace(next);
    const timer = setTimeout(() => {
      redirecting.current = false;
    }, 400);
    return () => clearTimeout(timer);
  }, [pathname, router, user]);

  return null;
}
