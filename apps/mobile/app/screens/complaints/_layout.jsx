import { Stack } from "expo-router";

/** Keep My Complaints under detail, create, and chat so Back pops inside this stack. */
export const unstable_settings = {
  anchor: "index",
};

export default function ComplaintsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "default",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="create" options={{ detachPreviousScreen: false }} />
      <Stack.Screen name="detail" options={{ detachPreviousScreen: false }} />
      <Stack.Screen name="chat" options={{ detachPreviousScreen: false }} />
    </Stack>
  );
}
