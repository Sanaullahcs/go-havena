import { useEffect, useState } from "react";
import { getCachedUser, getUser, subscribeSessionUser } from "../services/auth-session";

/** Live session user so Admin ↔ Resident mode changes update navigation immediately. */
export function useSessionUser() {
  const [user, setUser] = useState(() => getCachedUser());

  useEffect(() => {
    let cancelled = false;

    getUser().then((next) => {
      if (!cancelled && next) setUser(next);
    });

    const unsubscribe = subscribeSessionUser((next) => {
      if (!cancelled) setUser(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return user;
}
