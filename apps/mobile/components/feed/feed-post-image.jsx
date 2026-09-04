import React, { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { resolveAppImageSource } from "../../utils/profile-display";
import {
  FEED_IMAGE_DEFAULT_ASPECT,
  FEED_IMAGE_MAX_HEIGHT,
  FEED_IMAGE_MIN_HEIGHT,
} from "../../constants/feed-layout";
import { HomeTheme as T } from "../../constants/home-theme";
import { sw } from "../../utils/responsive";

function FeedPostImage({ uri, style, imageStyle, borderRadius = sw(14) }) {
  const [layoutWidth, setLayoutWidth] = useState(0);
  const source = useMemo(() => resolveAppImageSource(uri), [uri]);
  const recyclingKey = typeof uri === "string" || typeof uri === "number" ? String(uri) : undefined;

  const height = useMemo(() => {
    if (!layoutWidth) return FEED_IMAGE_MIN_HEIGHT;
    const naturalHeight = layoutWidth / FEED_IMAGE_DEFAULT_ASPECT;
    return Math.max(
      FEED_IMAGE_MIN_HEIGHT,
      Math.min(naturalHeight, FEED_IMAGE_MAX_HEIGHT),
    );
  }, [layoutWidth]);

  if (!uri || !source) return null;

  return (
    <View
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
    </View>
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
