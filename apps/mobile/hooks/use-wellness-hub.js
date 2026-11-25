import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect, useNavigation } from "expo-router";
import {
  fetchWellnessHub,
  getCachedWellnessHub,
  subscribeWellnessHub,
} from "../services/wellness-api";
import { resolveLoadRestriction } from "../utils/account-access-sync";

const HUB_POLL_MS = 15000;

export function useWellnessHub() {
  const navigation = useNavigation();
  const cached = getCachedWellnessHub();
  const [hub, setHub] = useState(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const hubRef = useRef(cached);
  const requestIdRef = useRef(0);

  const applyHub = useCallback((next) => {
    hubRef.current = next;
    setHub(next);
  }, []);

  const load = useCallback(async ({ silent } = {}) => {
    const requestId = ++requestIdRef.current;
    const hasData = hubRef.current != null;
    const quiet = silent ?? hasData;

    if (!quiet) {
      setLoading(true);
    }
    if (!hasData) {
      setError(null);
    }

    try {
      const blocked = await resolveLoadRestriction("wellness");
      if (requestId !== requestIdRef.current) return;

      if (blocked) {
        applyHub(null);
        setError(blocked);
        return;
      }

      const data = await fetchWellnessHub();
      if (requestId !== requestIdRef.current) return;

      applyHub(data);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;

      const restricted = await resolveLoadRestriction("wellness", err);
      if (requestId !== requestIdRef.current) return;

      if (restricted) {
        applyHub(null);
        setError(restricted);
        return;
      }

      if (!hasData) {
        applyHub(null);
        setError(err);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [applyHub]);

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = subscribeWellnessHub((next) => {
        applyHub(next);
        setError(null);
        setLoading(false);
      });

      load({ silent: hubRef.current != null });

      const intervalId = setInterval(() => {
        load({ silent: true });
      }, HUB_POLL_MS);

      const appSub = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          load({ silent: true });
        }
      });

      const tabNav = navigation.getParent?.();
      const tabUnsub = tabNav?.addListener?.("tabPress", () => {
        load({ silent: true });
      });

      return () => {
        unsubscribe();
        clearInterval(intervalId);
        appSub.remove();
        tabUnsub?.();
      };
    }, [applyHub, load, navigation]),
  );

  return { hub, loading, error, load };
}
