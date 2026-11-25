import { useEffect, useMemo, useState } from "react";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { useIsFocused } from "expo-router";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;
const LOAD_TIMEOUT_MS = 20000;
/** YouTube requires an https Referer. Use the app id, not youtube.com. */
const EMBED_ORIGIN = "https://com.zsquare.havena";

function extractYouTubeId(url) {
  if (!url) return null;
  const value = String(url).trim();
  if (YT_ID.test(value)) return value;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0] || "";
      return YT_ID.test(id) ? id : null;
    }
    if (
      host === "youtube.com" ||
      host === "youtube-nocookie.com" ||
      host === "music.youtube.com"
    ) {
      const fromQuery = parsed.searchParams.get("v") || "";
      if (YT_ID.test(fromQuery)) return fromQuery;
      const parts = parsed.pathname.split("/").filter(Boolean);
      const marker = parts.findIndex((part) =>
        ["embed", "shorts", "live", "v"].includes(part),
      );
      const id = marker >= 0 ? parts[marker + 1] || "" : "";
      return YT_ID.test(id) ? id : null;
    }
  } catch {
    return null;
  }

  return null;
}

function isYouTubeUrl(url) {
  return /(?:youtu\.be|youtube(?:-nocookie)?\.com)/i.test(String(url || ""));
}

function watchUrlFor(videoId, url) {
  if (/^https?:\/\//i.test(String(url || ""))) return String(url);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";
}

function allowEmbeddedRequest(url) {
  const value = String(url || "");
  if (!value || value === "about:blank") return true;
  if (/^(youtube|vnd\.youtube|intent):/i.test(value)) return false;
  if (value.startsWith(EMBED_ORIGIN)) return true;
  if (/youtube\.com\/embed|youtube-nocookie\.com\/embed|\/iframe_api|googlevideo\.com|ytimg\.com|ggpht\.com|gstatic\.com|google(?:apis|syndication)?\.com|youtube\.com\/(?:s|youtubei)\//i.test(value)) {
    return true;
  }
  if (/youtube\.com\/(?:watch|shorts|redirect|playlist)|youtu\.be\/|music\.youtube\.com/i.test(value)) {
    return false;
  }
  return true;
}

function youtubeEmbedUri(videoId) {
  const origin = encodeURIComponent(EMBED_ORIGIN);
  return `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1&controls=1&fs=1&enablejsapi=1&origin=${origin}&widget_referrer=${origin}`;
}

const EMBED_ERROR_WATCHER = `
(function() {
  function post(payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }
  var reported = false;
  function check() {
    if (reported) return;
    var text = "";
    try { text = (document.body && document.body.innerText) || ""; } catch (e) {}
    var labeled = text.match(/error\\s*code\\s*[:：]?\\s*(\\d+)/i);
    var code = labeled ? Number(labeled[1]) : null;
    if (!code && /video unavailable|playback on other websites has been disabled/i.test(text)) code = 101;
    if (code === 2 || code === 5 || code === 100 || code === 101 || code === 150 || code === 153) {
      reported = true;
      post({ type: "error", code: code });
    }
  }
  try {
    var observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  } catch (e) {}
  setTimeout(check, 800);
  setTimeout(check, 2500);
})();
true;
`;

async function openWatchOnYouTube(url) {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      // Keep the in-app fallback on screen when neither handoff works.
    }
  }
}

function posterSource(poster, videoId) {
  if (poster) return typeof poster === "string" ? { uri: poster } : poster;
  if (videoId) return { uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` };
  return null;
}

function VideoFallback({ poster, style, title, message, watchUrl }) {
  const { t } = useTranslation();
  const image = posterSource(poster);

  return (
    <View style={[styles.fallback, style]}>
      {image ? (
        <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <View style={styles.fallbackOverlay}>
        {title ? <Text style={styles.fallbackTitle}>{title}</Text> : null}
        <Text style={styles.fallbackText}>{message ?? t("video.unavailable")}</Text>
        {watchUrl ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("video.watchOnYouTube")}
            onPress={() => openWatchOnYouTube(watchUrl)}
            style={styles.watchBtn}
          >
            <Text style={styles.watchBtnText}>{t("video.watchOnYouTube")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function YouTubePlayer({ videoId, url, style, poster }) {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const [phase, setPhase] = useState("loading");
  const embedUri = useMemo(() => youtubeEmbedUri(videoId), [videoId]);
  const watchUrl = watchUrlFor(videoId, url);

  useEffect(() => {
    if (!focused) return;
    setPhase("loading");
  }, [focused, videoId]);

  useEffect(() => {
    if (!focused || phase !== "loading") return undefined;
    const timer = setTimeout(() => {
      setPhase((current) => (current === "loading" ? "error" : current));
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [focused, phase, videoId]);

  const onMessage = (event) => {
    let payload = null;
    try {
      payload = JSON.parse(event?.nativeEvent?.data || "");
    } catch {
      return;
    }
    if (payload?.type === "ready") {
      setPhase((current) => (current === "error" ? current : "ready"));
      return;
    }
    if (payload?.type !== "error") return;
    const code = Number(payload.code);
    if ([2, 5, 100, 101, 150, 153].includes(code)) {
      setPhase("error");
    }
  };

  if (!focused) {
    return (
      <View style={[styles.wrapper, style]}>
        <Image
          source={posterSource(poster, videoId)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      </View>
    );
  }

  if (phase === "error") {
    return (
      <VideoFallback
        poster={posterSource(poster, videoId)}
        style={style}
        title={t("video.unavailableTitle")}
        message={t("video.unavailableInApp")}
        watchUrl={watchUrl}
      />
    );
  }

  return (
    <View style={[styles.wrapper, style]}>
      <WebView
        key={videoId}
        style={[StyleSheet.absoluteFillObject, Platform.OS === "android" && styles.webViewAndroid]}
        source={{
          uri: embedUri,
          headers: { Referer: EMBED_ORIGIN },
        }}
        injectedJavaScript={EMBED_ERROR_WATCHER}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        allowsLinkPreview={false}
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        thirdPartyCookiesEnabled
        nestedScrollEnabled
        onMessage={onMessage}
        onLoadEnd={() => {
          setPhase((current) => (current === "loading" ? "ready" : current));
        }}
        onShouldStartLoadWithRequest={(request) => allowEmbeddedRequest(request?.url)}
      />
      {phase === "loading" ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" accessibilityLabel={t("video.loading")} />
        </View>
      ) : null}
    </View>
  );
}

function DirectVideoPlayer({ uri, style, poster, onPlayStateChange }) {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  const statusEvent = useEvent(player, "statusChange", { status: player.status });

  useEffect(() => {
    if (!focused) player.pause();
  }, [focused, player]);

  if (statusEvent?.status === "error") {
    return (
      <VideoFallback poster={poster} style={style} message={t("video.playbackError")} />
    );
  }

  const loading = statusEvent?.status !== "readyToPlay";

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
      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" accessibilityLabel={t("video.loading")} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Renders the appropriate player based on the video URL:
 *  - YouTube link or id → embedded player, with an explicit external fallback
 *  - Direct URL         → expo-video native player
 *  - No URL             → fallback placeholder
 */
export default function LazyVideoPlayer({ source, style, poster, onPlayStateChange }) {
  const { t } = useTranslation();
  const uri = source?.uri ?? (typeof source === "string" ? source : null);
  const ytId = extractYouTubeId(uri);

  if (!uri) {
    return <VideoFallback poster={poster} style={style} message={t("video.noVideoProvided")} />;
  }

  if (ytId) {
    return (
      <YouTubePlayer key={ytId} videoId={ytId} url={uri} style={style} poster={poster} />
    );
  }

  if (isYouTubeUrl(uri)) {
    return (
      <VideoFallback
        poster={poster}
        style={style}
        title={t("video.unavailableTitle")}
        message={t("video.unavailableInApp")}
        watchUrl={watchUrlFor(null, uri)}
      />
    );
  }

  return (
    <DirectVideoPlayer
      key={uri}
      uri={uri}
      style={style}
      poster={poster}
      onPlayStateChange={onPlayStateChange}
    />
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  webViewAndroid: {
    opacity: 0.99,
  },
  fallback: {
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  fallbackOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  fallbackTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 18,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 4,
  },
  fallbackText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#FFFFFF",
    textAlign: "center",
  },
  watchBtn: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  watchBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: "#101828",
    textAlign: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
});
