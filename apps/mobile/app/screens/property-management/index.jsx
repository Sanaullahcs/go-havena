import { Redirect } from "expo-router";

/** Legacy stack route — keep tab bar by redirecting into the services tab. */
export default function PropertyManagementRedirect() {
  return <Redirect href="/(tabs)/services" />;
}
