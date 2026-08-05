import { Stack } from "expo-router";
import { SYSTEM_CHROME_COLOR } from "../../../components/layout/system-chrome";

export default function ServicesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: SYSTEM_CHROME_COLOR },
      }}
    />
  );
}
