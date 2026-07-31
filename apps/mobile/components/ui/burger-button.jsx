import { Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { sw, sf } from "../../utils/responsive";

export default function BurgerButton({ onPress, compact = false, plain = false }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel="Open menu"
      style={({ pressed }) => [
        compact ? styles.compact : styles.normal,
        !plain && styles.bg,
        pressed && styles.pressed,
      ]}
    >
      <Feather name="menu" size={compact ? sf(18) : sf(20)} color="#000000" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  normal: {
    width: sw(38),
    height: sw(38),
    alignItems: "center",
    justifyContent: "center",
  },
  compact: {
    width: sw(38),
    height: sw(38),
    alignItems: "center",
    justifyContent: "center",
  },
  bg: {
    borderRadius: sw(11),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
});
