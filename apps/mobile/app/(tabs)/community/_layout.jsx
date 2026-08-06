import { Stack } from "expo-router";
import { MarketplaceTheme } from "../../../constants/marketplace-theme";

export default function CommunityLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: MarketplaceTheme.screenBg },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
