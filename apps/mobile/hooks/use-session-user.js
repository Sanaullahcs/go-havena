import { useEffect, useState } from "react";
import { getCachedUser, getUser, subscribeSessionUser } from "../services/auth-session";

/** Live session user so Admin ↔ Resident mode changes update navigation immediately. */
export function useSessionUser() {
  const [user, setUser] = useState(() => getCachedUser());

  useEffect(() => {
    let cancelled = false;
    let sawLiveUpdate = false;

    const unsubscribe = subscribeSessionUser((next) => {
      sawLiveUpdate = true;
      if (!cancelled) setUser(next);
    });

    getUser().then((next) => {
      if (!cancelled && next && !sawLiveUpdate) setUser(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return user;
}
