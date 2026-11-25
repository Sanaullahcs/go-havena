import { Stack } from "expo-router";

export const unstable_settings = {
  anchor: "index",
};

export default function StaffTasksLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        header: () => null,
        animation: "default",
      }}
    >
      <Stack.Screen name="home" options={{ title: "Home" }} />
      <Stack.Screen name="index" options={{ title: "My Assigned Tasks" }} />
      <Stack.Screen name="messages" options={{ title: "Messages" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="profile" options={{ title: "Profile" }} />
      <Stack.Screen name="detail" options={{ title: "Service Request Details", detachPreviousScreen: false }} />
      <Stack.Screen name="chat" options={{ title: "Chat", detachPreviousScreen: false }} />
      <Stack.Screen name="invitations" options={{ title: "Invitations" }} />
    </Stack>
  );
}
