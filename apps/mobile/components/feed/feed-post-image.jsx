import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { resolveAppImageSource } from "../../utils/profile-display";
import {
  FEED_IMAGE_DEFAULT_ASPECT,
  FEED_IMAGE_MAX_HEIGHT,
  FEED_IMAGE_MIN_HEIGHT,
} from "../../constants/feed-layout";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw } from "../../utils/responsive";
import ImageLightbox from "../ui/image-lightbox";

function FeedPostImage({
  uri,
  uris,
  initialIndex = 0,
  style,
  imageStyle,
  borderRadius = sw(14),
}) {
  const { t } = useTranslation();
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  const images = useMemo(() => {
    if (Array.isArray(uris) && uris.length) {
      return uris.map((item) => String(item ?? "").trim()).filter(Boolean);
    }
    const single = String(uri ?? "").trim();
    return single ? [single] : [];
  }, [uri, uris]);

  const previewUri = images[Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0))] || uri;
  const source = useMemo(() => resolveAppImageSource(previewUri), [previewUri]);
  const recyclingKey =
    typeof previewUri === "string" || typeof previewUri === "number" ? String(previewUri) : undefined;

  const height = useMemo(() => {
    if (!layoutWidth) return FEED_IMAGE_MIN_HEIGHT;
    const naturalHeight = layoutWidth / FEED_IMAGE_DEFAULT_ASPECT;
    return Math.max(
      FEED_IMAGE_MIN_HEIGHT,
      Math.min(naturalHeight, FEED_IMAGE_MAX_HEIGHT),
    );
  }, [layoutWidth]);

  if (!previewUri || !source) return null;

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={t("feed.viewPhoto")}
        onPress={() => setViewerOpen(true)}
        style={[styles.wrap, { borderRadius, height }, style]}
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (nextWidth > 0 && nextWidth !== layoutWidth) {
            setLayoutWidth(nextWidth);
          }
        }}
      >
        <Image
          source={source}
          recyclingKey={recyclingKey}
          cachePolicy="memory-disk"
          transition={0}
          style={[styles.image, { borderRadius }, imageStyle]}
          contentFit="cover"
        />
      </Pressable>
      <ImageLightbox
        visible={viewerOpen}
        uris={images}
        initialIndex={initialIndex}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}

export default React.memo(FeedPostImage);

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: T.canvas,
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
