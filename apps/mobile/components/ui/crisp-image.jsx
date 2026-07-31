import { Image } from "expo-image";
import { imageProps } from "../../constants/typography";
import { mediaImageSource } from "../../utils/profile-display";

export default function CrispImage({ source, style, contentFit = "cover", ...props }) {
  const resolvedSource = mediaImageSource(source);

  return (
    <Image
      {...imageProps}
      {...props}
      source={resolvedSource ?? source}
      style={style}
      contentFit={contentFit}
    />
  );
}
