import { useEffect, useState } from "react";
import * as Location from "expo-location";

export function useUserCoordinates() {
  const [origin, setOrigin] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        const next = current.status === "granted"
          ? current
          : await Location.requestForegroundPermissionsAsync();
        if (next.status !== "granted") return;
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!active) return;
        setOrigin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch {
        // Listings keep the distance already saved with the community pin.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return origin;
}
