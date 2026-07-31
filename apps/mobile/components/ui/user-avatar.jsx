import { View, Text, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react-native";
import CrispImage from "./crisp-image";
import { Fonts } from "../../constants/font";
import { getProfileInitial, resolveMediaUrl } from "../../utils/profile-display";

/**
 * Circular avatar — remote image when provided, otherwise first letter of name.
 * Falls back to initials when the image fails to load.
 */
export default function UserAvatar({
  source,
  name = "",
  size = 40,
  style,
  useIconPlaceholder = false,
}) {
  const [failed, setFailed] = useState(false);
  const rawUri =
    typeof source === "string"
      ? source
      : source?.uri ?? null;
  const uri = resolveMediaUrl(rawUri);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const initial = getProfileInitial(name);

  if (uri && !failed) {
    return (
      <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }, style]}>
        <CrispImage
          source={uri}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        styles.initialsOnly,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      {useIconPlaceholder ? (
        <UserRound size={size * 0.4} color="#0052DF" strokeWidth={1.75} />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.38 }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", backgroundColor: "#EFF6FF" },
  initialsOnly: {
    backgroundColor: "rgba(0, 82, 223, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontFamily: Fonts.bold,
    color: "#0052DF",
    fontWeight: "700",
  },
});
