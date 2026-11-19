import { Redirect } from "expo-router";
import { useSessionUser } from "../../hooks/use-session-user";
import { isResidentWithStaff, STAFF_HOME } from "../../constants/onboarding-routes";

/** Kept out of the resident tab bar. Dual-role users open the staff app from the side menu. */
export default function AssignedTasksTab() {
  const user = useSessionUser();
  if (user && !isResidentWithStaff(user)) {
    return <Redirect href="/(tabs)/home" />;
  }
  return <Redirect href={STAFF_HOME} />;
}
