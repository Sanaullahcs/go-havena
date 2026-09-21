import { Image } from "expo-image";
import { imageProps } from "../../constants/typography";
import { mediaImageSource } from "../../utils/profile-display";

export default function CrispImage({ source, style, contentFit = "cover", ...props }) {
  const resolvedSource = mediaImageSource(source);
  const finalSource = resolvedSource ?? source;
  const isBundled = typeof finalSource === "number";

  return (
    <Image
      {...(isBundled ? {} : imageProps)}
      {...props}
      source={finalSource}
      style={style}
      contentFit={contentFit}
    />
  );
}
