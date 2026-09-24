import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { homeSize } from "../constants/home-styles";

const MAX_HOME_CONTENT = 440;

/** Live Home insets so cards, gutters, and sections share one width. */
export function useHomeFrame() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const gutter = homeSize(16, width);
    const contentWidth = Math.min(MAX_HOME_CONTENT, Math.max(0, width - gutter * 2));
    const sideInset = Math.max(gutter, Math.round((width - contentWidth) / 2));
    return {
      screenWidth: width,
      screenHeight: height,
      gutter,
      sideInset,
      contentWidth,
      size: (value) => homeSize(value, width),
    };
  }, [width, height]);
}
