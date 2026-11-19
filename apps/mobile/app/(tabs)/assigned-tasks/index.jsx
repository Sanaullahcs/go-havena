import { Redirect } from "expo-router";
import { StaffTasksScreen } from "../../screens/staff-tasks";
import { isResidentWithStaff } from "../../../constants/onboarding-routes";
import { useSessionUser } from "../../../hooks/use-session-user";

/** Resident staff tasks, rendered inside the resident tab layout. */
export default function AssignedTasksTab() {
  const user = useSessionUser();
  if (!user) return null;
  if (!isResidentWithStaff(user)) {
    return <Redirect href="/(tabs)/home" />;
  }
  return <StaffTasksScreen asTab />;
}
