import React, { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { mediaImageSource } from "../../utils/profile-display";
import {
  FEED_IMAGE_DEFAULT_ASPECT,
  FEED_IMAGE_MAX_HEIGHT,
  FEED_IMAGE_MIN_HEIGHT,
} from "../../constants/feed-layout";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw } from "../../utils/responsive";

export default function FeedPostImage({ uri, style, imageStyle, borderRadius = sw(14) }) {
  const [aspectRatio, setAspectRatio] = useState(FEED_IMAGE_DEFAULT_ASPECT);
  const [layoutWidth, setLayoutWidth] = useState(0);

  const height = useMemo(() => {
    if (!layoutWidth) return FEED_IMAGE_MIN_HEIGHT;
    const naturalHeight = layoutWidth / Math.max(aspectRatio, 0.35);
    return Math.max(
      FEED_IMAGE_MIN_HEIGHT,
      Math.min(naturalHeight, FEED_IMAGE_MAX_HEIGHT),
    );
  }, [aspectRatio, layoutWidth]);

  if (!uri) return null;

  return (
    <View
      style={[styles.wrap, { borderRadius }, style]}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth > 0 && nextWidth !== layoutWidth) {
          setLayoutWidth(nextWidth);
        }
      }}
    >
      <Image
        source={mediaImageSource(uri)}
        style={[
          styles.image,
          { height, borderRadius },
          imageStyle,
        ]}
        contentFit="cover"
        transition={200}
        onLoad={(event) => {
          const { width, height: imgHeight } = event.source ?? {};
          if (width > 0 && imgHeight > 0) {
            setAspectRatio(width / imgHeight);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: T.canvas,
  },
  image: {
    width: "100%",
  },
});
