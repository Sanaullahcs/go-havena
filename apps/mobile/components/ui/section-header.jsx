import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { chevronForward } from "../../utils/rtl";

export default function SectionHeader({ title, onPressNext }) {
  const { t } = useTranslation();
  return (
    <View className="mb-3.5 flex-row items-center justify-between">
      <Text className="section-label">{title}</Text>
      {onPressNext ? (
        <Pressable
          onPress={onPressNext}
          hitSlop={12}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface-chip active:opacity-85"
          accessibilityLabel={t("common.browseSection", { title })}
        >
          <Feather name={chevronForward()} size={20} color="#14B8A6" />
        </Pressable>
      ) : null}
    </View>
  );
}
