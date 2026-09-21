import { Stack } from "expo-router";
import { SYSTEM_CHROME_COLOR } from "../../../components/layout/system-chrome";

export default function MarketplaceLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: SYSTEM_CHROME_COLOR },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="deals-offer" />
      <Stack.Screen name="my-coupons" />
      <Stack.Screen name="deal-details" />
      <Stack.Screen name="redeem-coupon" />
      <Stack.Screen name="confirm-redeem" />
      <Stack.Screen name="create-deal" />
      <Stack.Screen name="manage-marketplace" />
      <Stack.Screen name="add-business" />
      <Stack.Screen name="all-marketplace" />
      <Stack.Screen name="reviews" />
      <Stack.Screen name="write-review" />
      <Stack.Screen name="provider-profile" />
      <Stack.Screen name="business-deals" />
    </Stack>
  );
}
