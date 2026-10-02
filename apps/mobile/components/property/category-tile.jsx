import { View, Text, Pressable, StyleSheet } from "react-native";
import { Fonts } from "../../constants/font";
import { PageType } from "../../constants/page-styles";

export default function CategoryTile({ title, subtitle, width, onPress }) {
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        width != null ? { width } : styles.tileFlex,
        onPress && pressed && styles.pressed,
      ]}
    >
      <Text style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  tile: {
    padding: 14,
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    minHeight: 88,
    justifyContent: "space-between",
  },
  tileFlex: { flex: 1, minWidth: "46%" },
  pressed: { opacity: 0.88 },
  title: {
    fontFamily: Fonts.bold,
    fontSize: PageType.cardTitle,
    lineHeight: PageType.cardTitleLine,
    color: "#101828",
    fontWeight: "700",
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: PageType.caption,
    lineHeight: PageType.captionLine,
    color: "#6A7282",
    marginTop: 4,
  },
});
