import { Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

/** Crisp vector icon button — replaces small tinted PNG assets. */
export default function IconButton({
  name,
  size = 22,
  color = "#101828",
  onPress,
  hitSlop = 8,
  accessibilityLabel,
  style,
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <Feather name={name} size={size} color={color} />
    </Pressable>
  );
}
