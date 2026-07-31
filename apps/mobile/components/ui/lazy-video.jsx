import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Fonts } from "../../constants/font";

/* ── YouTube helpers ──────────────────────────────────────────── */
const YT_REGEX =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(YT_REGEX);
  return m ? m[1] : null;
}

function YouTubePlayer({ videoId, url, style }) {
  const thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

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
        <Text style={styles.ytLabel}>Tap to watch on YouTube</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ── Direct video fallback ─────────────────────────────────────── */
function VideoFallback({ poster, style, message }) {
  return (
    <View style={[styles.fallback, style]}>
      {poster ? (
        <Image source={poster} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <View style={styles.fallbackOverlay}>
        <Text style={styles.fallbackText}>{message ?? "Video unavailable."}</Text>
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
  const uri = source?.uri ?? (typeof source === "string" ? source : null);
  const ytId = extractYouTubeId(uri);

  if (!uri) {
    return <VideoFallback poster={poster} style={style} message="No video provided." />;
  }

  if (ytId) {
    return <YouTubePlayer videoId={ytId} url={uri} style={style} />;
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
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  ytPlayIcon: {
    color: "#FFFFFF",
    fontSize: 22,
    marginLeft: 4,
  },
  ytLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
