import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { resolveLoadRestriction } from "../utils/account-access-sync";
import { isFeatureAccessBlockedError } from "../utils/guest-permission-errors";

/**
 * Keeps a screen's restriction state in sync with cached/API suspension blocks.
 */
export function useAccountRestriction(feature) {
  const [restrictionError, setRestrictionError] = useState(null);

  const refreshRestriction = useCallback(async () => {
    const resolved = await resolveLoadRestriction(feature);
    setRestrictionError(resolved);
    return resolved;
  }, [feature]);

  useFocusEffect(
    useCallback(() => {
      refreshRestriction();
    }, [refreshRestriction]),
  );

  const guardLoad = useCallback(
    async (loadFn) => {
      const blocked = await resolveLoadRestriction(feature);
      if (blocked) {
        setRestrictionError(blocked);
        return { blocked: true, result: null };
      }

      try {
        const result = await loadFn();
        setRestrictionError(null);
        return { blocked: false, result };
      } catch (err) {
        const restricted = await resolveLoadRestriction(feature, err);
        if (restricted) {
          setRestrictionError(restricted);
          return { blocked: true, result: null, error: restricted };
        }
        throw err;
      }
    },
    [feature],
  );

  return {
    restrictionError,
    isRestricted: Boolean(restrictionError),
    accessBlocked: Boolean(restrictionError && isFeatureAccessBlockedError(restrictionError)),
    refreshRestriction,
    guardLoad,
  };
}
