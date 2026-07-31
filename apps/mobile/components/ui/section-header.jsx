import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

export default function SectionHeader({ title, onPressNext }) {
  return (
    <View className="mb-3.5 flex-row items-center justify-between">
      <Text className="section-label">{title}</Text>
      {onPressNext ? (
        <Pressable
          onPress={onPressNext}
          hitSlop={12}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface-chip active:opacity-85"
          accessibilityLabel={`Browse ${title}`}
        >
          <Feather name="chevron-right" size={20} color="#007BFF" />
        </Pressable>
      ) : null}
    </View>
  );
}
