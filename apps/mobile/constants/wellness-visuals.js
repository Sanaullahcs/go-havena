import React from "react";
import Svg, { Path } from "react-native-svg";
import { View } from "react-native";
import { Apple, BookOpen, Heart, Moon, Users, Wind } from "lucide-react-native";
import { Media } from "./media";
import { HomeTheme as T } from "./home-theme";
import { mediaImageSource } from "../utils/profile-display";

const PURPLE = "#4338CA";

export function SneakerIcon({ color, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.2 16.4c0 1.1 3.1 2.2 8.1 2.2s8.1-1.1 8.1-2.2c0-.45-.22-.86-.62-1.16L18.4 9.6A3.1 3.1 0 0 0 15.5 7.6h-4.3c-1 0-1.95.5-2.5 1.32L6.1 13.2c-.8.7-1.9 1.6-1.9 3.2z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path
        d="M7.2 13.4h9.2M8.6 11h5.4"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function WellnessHeroWave({ width, blobColor, height = 32 }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, bottom: -1, height, zIndex: 1 }}>
      <Svg width={width} height={height} viewBox="0 0 200 40" preserveAspectRatio="none">
        <Path
          fill={blobColor}
          opacity={0.18}
          d="M0 10C46 -2 86 6 118 20C146 32 172 30 200 18V40H0V10Z"
        />
        <Path
          fill={T.white}
          d="M0 20C40 6 78 5 108 16C140 28 168 34 200 24V40H0V20Z"
        />
      </Svg>
    </View>
  );
}

const VISUALS = {
  weight: { image: Media.wellnessWeightBowl, accent: T.navy, blob: T.navy, wash: "#E8F1FA", Icon: Apple },
  nutrition: { image: Media.wellnessWeightBowl, accent: T.navy, blob: T.navy, wash: "#E8F1FA", Icon: Apple },
  exercise: { image: Media.wellnessExerciseShoes, accent: T.teal, blob: T.teal, wash: "#E6FAF6", Icon: SneakerIcon },
  stress: { image: Media.wellnessCalmStill, accent: PURPLE, blob: PURPLE, wash: "#EEF0FF", Icon: Wind },
  mindful: { image: Media.wellnessCalmStill, accent: PURPLE, blob: PURPLE, wash: "#EEF0FF", Icon: Heart },
  sleep: { image: Media.wellnessCalmStill, accent: PURPLE, blob: PURPLE, wash: "#EEF0FF", Icon: Moon },
  learning: { image: Media.wellnessLearning, accent: T.navy, blob: T.navy, wash: "#E8F1FA", Icon: BookOpen },
  social: { image: Media.wellnessSocial, accent: T.teal, blob: T.teal, wash: "#E6FAF6", Icon: Users },
};

const DEFAULT_VISUAL = VISUALS.weight;

const COURSE_THUMBS = {
  "balanced nutrition basics": Media.wellnessCourseNutrition,
  "meal prep mastery": Media.wellnessCourseMealPrep,
  "exercise fundamentals": Media.wellnessActive,
  "home workout essentials": Media.wellnessExerciseShoes,
  "breathing for calm": Media.wellnessCalm,
  "mindful moments": Media.wellnessCalmStill,
  "learning wellness basics": Media.wellnessLearning,
  "goal setting for growth": Media.wellnessLearning,
  "connecting with neighbors": Media.wellnessSocial,
  "healthy communication": Media.wellnessSocial,
};

function titleThumb(title) {
  const key = String(title ?? "").trim().toLowerCase();
  if (COURSE_THUMBS[key]) return COURSE_THUMBS[key];
  if (key.includes("meal prep")) return Media.wellnessCourseMealPrep;
  if (key.includes("nutrition") || key.includes("balanced")) return Media.wellnessCourseNutrition;
  if (key.includes("workout") || key.includes("exercise")) return Media.wellnessExerciseShoes;
  if (key.includes("breath") || key.includes("mindful") || key.includes("calm")) {
    return Media.wellnessCalmStill;
  }
  if (key.includes("learn") || key.includes("goal")) return Media.wellnessLearning;
  if (key.includes("neighbor") || key.includes("social") || key.includes("communication")) {
    return Media.wellnessSocial;
  }
  return null;
}

function usableImageUrl(imageUrl) {
  if (imageUrl && typeof imageUrl === "object" && imageUrl.uri) {
    return usableImageUrl(imageUrl.uri);
  }
  const uri = String(imageUrl ?? "").trim();
  if (!uri || uri === "null" || uri === "undefined") return "";
  return uri;
}

/** Loadable RN image source for an uploaded wellness URL, or null. */
export function resolveWellnessImageSource(imageUrl) {
  const uri = usableImageUrl(imageUrl);
  return uri ? mediaImageSource(uri) : null;
}

function bundledCourseThumb(title, categoryKey) {
  return titleThumb(title) ?? (VISUALS[String(categoryKey ?? "").toLowerCase()] ?? DEFAULT_VISUAL).image;
}

/** Square course thumbnail — uploaded course image, then topic image, then category visual. */
export function getCourseThumbnail(title, categoryKey, imageUrl) {
  return resolveWellnessImageSource(imageUrl) ?? bundledCourseThumb(title, categoryKey);
}

export function getCourseThumbnailPair(title, categoryKey, imageUrl) {
  const fallbackImage = bundledCourseThumb(title, categoryKey);
  return {
    image: resolveWellnessImageSource(imageUrl) ?? fallbackImage,
    fallbackImage,
  };
}

/** Hero image, accent, and icon for any wellness pillar (including unknown keys). */
export function getWellnessVisual(categoryKey, imageUrl) {
  const base = VISUALS[String(categoryKey ?? "").toLowerCase()] ?? DEFAULT_VISUAL;
  const uploaded = resolveWellnessImageSource(imageUrl);
  return {
    ...base,
    image: uploaded ?? base.image,
    fallbackImage: base.image,
  };
}
