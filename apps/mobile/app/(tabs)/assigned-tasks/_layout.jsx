import { Stack } from "expo-router";
import { SYSTEM_CHROME_COLOR } from "../../../components/layout/system-chrome";

export default function AssignedTasksLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: SYSTEM_CHROME_COLOR },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="detail" options={{ detachPreviousScreen: false }} />
      <Stack.Screen name="chat" options={{ detachPreviousScreen: false }} />
    </Stack>
  );
}
