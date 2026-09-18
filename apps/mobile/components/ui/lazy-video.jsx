import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { rnShadow, rnTextShadow } from "../../utils/shadow";

/* ── YouTube helpers ──────────────────────────────────────────── */
const YT_REGEX =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(YT_REGEX);
  return m ? m[1] : null;
}

function YouTubePlayer({ videoId, url, style, poster }) {
  const { t } = useTranslation();
  const thumb = poster || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

  const open = async () => {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  };

  return (
    <TouchableOpacity style={[styles.ytWrapper, style]} onPress={open} activeOpacity={0.88}>
      <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.ytOverlay}>
        <View style={styles.ytPlayBtn}>
          <Text style={styles.ytPlayIcon}>▶</Text>
        </View>
        <Text style={styles.ytLabel}>{t("common.watchOnYouTube")}</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ── Direct video fallback ─────────────────────────────────────── */
function VideoFallback({ poster, style, message }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.fallback, style]}>
      {poster ? (
        <Image source={poster} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <View style={styles.fallbackOverlay}>
        <Text style={styles.fallbackText}>{message ?? t("video.unavailable")}</Text>
      </View>
    </View>
  );
}

/* ── Direct video via expo-video ───────────────────────────────── */
function DirectVideoPlayer({ uri, style, onPlayStateChange }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });

  return (
    <View style={[styles.wrapper, style]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
        fullscreenOptions={{
          enable: true,
          orientation: "landscape",
          autoExitOnRotate: true,
        }}
        onFullscreenEnter={() => onPlayStateChange?.(true)}
        onFullscreenExit={() => onPlayStateChange?.(false)}
      />
    </View>
  );
}

/* ── Main exported component ───────────────────────────────────── */
/**
 * Renders the appropriate player based on the video URL:
 *  - YouTube link  → thumbnail + tap-to-watch in-app browser
 *  - Direct URL    → expo-video native player
 *  - No URL        → fallback placeholder
 */
export default function LazyVideoPlayer({ source, style, poster, onPlayStateChange }) {
  const { t } = useTranslation();
  const uri = source?.uri ?? (typeof source === "string" ? source : null);
  const ytId = extractYouTubeId(uri);

  if (!uri) {
    return <VideoFallback poster={poster} style={style} message={t("video.noVideoProvided")} />;
  }

  if (ytId) {
    return <YouTubePlayer videoId={ytId} url={uri} style={style} poster={poster} />;
  }

  return <DirectVideoPlayer uri={uri} style={style} onPlayStateChange={onPlayStateChange} />;
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  fallback: {
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  fallbackOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  fallbackText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: "#FFFFFF",
    textAlign: "center",
  },
  /* YouTube */
  ytWrapper: {
    overflow: "hidden",
    backgroundColor: "#0f0f0f",
    justifyContent: "center",
    alignItems: "center",
  },
  ytOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  ytPlayBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FF0000",
    justifyContent: "center",
    alignItems: "center",
    ...rnShadow({ color: "#000", offset: { width: 0, height: 2 }, opacity: 0.4, radius: 8, elevation: 6 }),
  },
  ytPlayIcon: {
    color: "#FFFFFF",
    fontSize: 22,
    marginStart: 4,
  },
  ytLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
    textAlign: "center",
    ...rnTextShadow({ color: "rgba(0,0,0,0.7)", offset: { width: 0, height: 1 }, radius: 4 }),
  },
});
