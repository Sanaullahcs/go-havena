import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_RADIUS_MILES } from "../constants/location-radius";
import {
  getActiveRadiusMiles,
  loadSavedRadiusMiles,
  persistRadiusMiles,
} from "../services/location-scope";

const LocationScopeContext = createContext({
  radiusMiles: DEFAULT_RADIUS_MILES,
  setRadiusMiles: async () => DEFAULT_RADIUS_MILES,
  revision: 0,
  ready: false,
});

export function useLocationScope() {
  return useContext(LocationScopeContext);
}

export default function LocationScopeProvider({ children }) {
  const [radiusMiles, setRadiusState] = useState(getActiveRadiusMiles());
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadSavedRadiusMiles();
      if (!cancelled) {
        setRadiusState(saved);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setRadiusMiles = useCallback(async (miles) => {
    const next = await persistRadiusMiles(miles);
    setRadiusState(next);
    setRevision((value) => value + 1);
    return next;
  }, []);

  const value = useMemo(
    () => ({ radiusMiles, setRadiusMiles, revision, ready }),
    [radiusMiles, setRadiusMiles, revision, ready],
  );

  return <LocationScopeContext.Provider value={value}>{children}</LocationScopeContext.Provider>;
}
