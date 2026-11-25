import React, { useMemo } from "react";
import { Image } from "expo-image";
import { imageProps } from "../../constants/typography";
import { mediaImageSource } from "../../utils/profile-display";

function sourceKey(source) {
  if (source == null) return "";
  if (typeof source === "number") return `asset:${source}`;
  if (typeof source === "string") return source;
  return source.uri ?? "";
}

function CrispImage({ source, style, contentFit = "cover", recyclingKey, ...props }) {
  const resolvedSource = useMemo(() => mediaImageSource(source) ?? source, [source]);
  const finalSource = resolvedSource ?? source;
  const isBundled = typeof finalSource === "number";
  const key = recyclingKey ?? sourceKey(source) ?? sourceKey(finalSource);

  return (
    <Image
      {...(isBundled ? {} : imageProps)}
      {...props}
      source={finalSource}
      recyclingKey={key || undefined}
      style={style}
      contentFit={contentFit}
    />
  );
}

export default React.memo(CrispImage, (prev, next) => (
  sourceKey(prev.source) === sourceKey(next.source)
  && prev.contentFit === next.contentFit
  && prev.recyclingKey === next.recyclingKey
  && prev.style === next.style
  && prev.onError === next.onError
));
