import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Bell, CalendarDays, TriangleAlert } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { HomeTheme as T } from "../../constants/home-theme";
import { resolveSeedMediaSource } from "../../constants/seed-media";
import { mediaImageSource, resolveMediaUrl } from "../../utils/profile-display";
import { imageProps } from "../../constants/typography";
import { sw } from "../../utils/responsive";
import {
  isAlertNotice,
  isEventNotice,
} from "../../utils/notice-home-expiry";

export function resolveNoticeCoverUrl(imageUrl) {
  if (resolveSeedMediaSource(imageUrl) != null) {
    return String(imageUrl).trim();
  }
  const resolved = resolveMediaUrl(imageUrl);
  if (!resolved) return null;
  const trimmed = String(resolved).trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
  return trimmed;
}

/** notice | event | alert — drives placeholder icon + tint. */
export function resolveNoticeCoverKind(noticeOrCategory) {
  if (noticeOrCategory == null) return "notice";
  if (typeof noticeOrCategory === "string") {
    const cat = noticeOrCategory.trim().toLowerCase();
    if (cat === "event") return "event";
    if (cat === "emergency" || cat === "alert") return "alert";
    return "notice";
  }
  if (isEventNotice(noticeOrCategory)) return "event";
  if (isAlertNotice(noticeOrCategory)) return "alert";
  return "notice";
}

const KIND_STYLE = {
  event: {
    Icon: CalendarDays,
    backgroundColor: "#FFEDD5",
    iconColor: "#EA580C",
    heroBackgroundColor: "rgba(255, 237, 213, 0.95)",
    heroIconColor: "#EA580C",
  },
  alert: {
    Icon: TriangleAlert,
    backgroundColor: "#FEE2E2",
    iconColor: "#DC2626",
    heroBackgroundColor: "rgba(254, 226, 226, 0.95)",
    heroIconColor: "#DC2626",
  },
  notice: {
    Icon: Bell,
    backgroundColor: T.mint,
    iconColor: T.teal,
    heroBackgroundColor: "rgba(209, 250, 245, 0.92)",
    heroIconColor: T.teal,
  },
};

function isDarkSurface(color) {
  if (!color || typeof color !== "string") return false;
  const value = color.trim().toLowerCase();
  return (
    value.startsWith("#1") ||
    value.startsWith("#0") ||
    value.startsWith("#2") ||
    value.startsWith("#3") ||
    value.startsWith("#b91c") ||
    value.includes("navy")
  );
}

function placeholderIconSize({ size = sw(52), fill = false, onDark = false }) {
  if (fill) {
    return onDark ? sw(36) : sw(32);
  }
  const frame = Math.max(sw(40), Number(size) || sw(52));
  const basis = Math.min(frame, sw(64));
  return Math.max(sw(18), Math.min(sw(26), Math.round(basis * 0.38)));
}

/** Soft typed placeholder when no cover image is available. */
export function NoticeCoverPlaceholder({
  size = sw(52),
  borderRadius = sw(10),
  style,
  fill = false,
  backgroundColor,
  kind = "notice",
  category,
  notice,
}) {
  const { t } = useTranslation();
  const resolvedKind = resolveNoticeCoverKind(notice ?? category ?? kind);
  const theme = KIND_STYLE[resolvedKind] ?? KIND_STYLE.notice;
  const Icon = theme.Icon;
  const onDark = isDarkSurface(backgroundColor);
  const iconSize = placeholderIconSize({ size, fill, onDark });
  const surfaceColor =
    backgroundColor ??
    (fill ? theme.heroBackgroundColor : theme.backgroundColor);
  const iconColor = onDark ? theme.iconColor : fill ? theme.heroIconColor : theme.iconColor;

  const frameStyle = fill
    ? styles.fillPlaceholderFrame
    : { width: size, height: size, borderRadius };

  return (
    <View
      style={[
        styles.placeholder,
        {
          backgroundColor: surfaceColor,
          borderRadius: fill ? 0 : borderRadius,
        },
        frameStyle,
        style,
      ]}
      accessibilityLabel={t("notices.coverPlaceholder")}
    >
      <View
        style={[
          styles.placeholderIconBadge,
          fill && styles.placeholderIconBadgeHero,
          onDark && styles.placeholderIconBadgeDark,
        ]}
      >
        <Icon size={iconSize} color={iconColor} strokeWidth={1.75} />
      </View>
    </View>
  );
}

/** Cover image when available; typed placeholder otherwise. */
export function NoticeCoverMedia({
  imageUrl,
  size = sw(52),
  borderRadius = sw(10),
  style,
  fill = false,
  placeholderStyle,
  backgroundColor,
  onImageError,
  kind,
  category,
  notice,
}) {
  const source = useMemo(() => mediaImageSource(imageUrl), [imageUrl]);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(source != null && !failed);
  const isBundled = typeof source === "number";

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  const frameStyle = fill
    ? [styles.fillFrame, style]
    : [styles.frame, { width: size, height: size, borderRadius }, style];

  const imageStyle = fill
    ? styles.fillImage
    : [styles.thumbImage, { width: size, height: size, borderRadius }];

  return (
    <View style={frameStyle}>
      {showImage ? (
        <Image
          {...(isBundled ? {} : imageProps)}
          source={source}
          style={imageStyle}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority={fill ? "high" : "normal"}
          recyclingKey={typeof source === "string" ? source : imageUrl || undefined}
          onError={() => {
            setFailed(true);
            onImageError?.();
          }}
        />
      ) : (
        <NoticeCoverPlaceholder
          fill={fill}
          size={size}
          borderRadius={borderRadius}
          style={placeholderStyle}
          backgroundColor={backgroundColor}
          kind={kind}
          category={category}
          notice={notice}
        />
      )}
    </View>
  );
}

export default function NoticeCoverThumbnail(props) {
  return <NoticeCoverMedia {...props} />;
}

const styles = StyleSheet.create({
  frame: {
    flexShrink: 0,
    backgroundColor: T.white,
    overflow: "hidden",
  },
  fillFrame: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: T.navy,
  },
  fillImage: {
    width: "100%",
    height: "100%",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  fillPlaceholderFrame: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderIconBadge: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.55)",
    width: sw(40),
    height: sw(40),
  },
  placeholderIconBadgeHero: {
    width: sw(56),
    height: sw(56),
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  placeholderIconBadgeDark: {
    backgroundColor: "rgba(20,184,166,0.18)",
  },
});
