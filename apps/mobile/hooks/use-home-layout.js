import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Chrome that sits outside the scrollable section area */
const TOP_BAR_H = 46;
const NAV_RESERVE = 78;

/**
 * Derive every home-section height from the live viewport so the layout scales
 * with the device. Heights are clamped to comfortable bounds; the body scrolls
 * when a device is too short, so nothing ever clips (fully responsive).
 */
export function useHomeLayout() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const available = Math.max(
      height - insets.top - insets.bottom - TOP_BAR_H - NAV_RESERVE,
      460,
    );

    return {
      width,
      hero: Math.round(clamp(available * 0.14, 90, 118)),
      deal: Math.round(clamp(available * 0.28, 196, 210)),
    };
  }, [height, width, insets.top, insets.bottom]);
}
