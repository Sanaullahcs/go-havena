import { Dimensions, PixelRatio } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

export function wp(percentage) {
  return PixelRatio.roundToNearestPixel((SCREEN_WIDTH * percentage) / 100);
}

export function hp(percentage) {
  return PixelRatio.roundToNearestPixel((SCREEN_HEIGHT * percentage) / 100);
}

export function sw(size) {
  return PixelRatio.roundToNearestPixel((size / BASE_WIDTH) * SCREEN_WIDTH);
}

export function sh(size) {
  return PixelRatio.roundToNearestPixel((size / BASE_HEIGHT) * SCREEN_HEIGHT);
}

export function sf(size) {
  const scale = SCREEN_WIDTH / BASE_WIDTH;
  const capped = Math.min(scale, 1.35);
  return PixelRatio.roundToNearestPixel(size * capped);
}

export { SCREEN_WIDTH, SCREEN_HEIGHT };
