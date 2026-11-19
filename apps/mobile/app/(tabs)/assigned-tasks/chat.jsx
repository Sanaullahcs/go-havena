import { useLocalSearchParams } from "expo-router";
import ComplaintChatScreen from "../../../components/complaints/complaint-chat-screen";

export default function ResidentStaffChatScreen() {
  const { id } = useLocalSearchParams();
  const taskId = Array.isArray(id) ? id[0] : id;
  return (
    <ComplaintChatScreen
      audience="staff"
      backTo={taskId
        ? { pathname: "/(tabs)/assigned-tasks/detail", params: { id: String(taskId) } }
        : "/(tabs)/assigned-tasks"}
    />
  );
}
