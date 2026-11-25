import { Stack } from "expo-router";
import { SYSTEM_CHROME_COLOR } from "../../../components/layout/system-chrome";

export default function WellnessLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: SYSTEM_CHROME_COLOR },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="wellness-detail" />
      <Stack.Screen name="lessons" />
      <Stack.Screen name="lessonVedio" />
    </Stack>
  );
}
