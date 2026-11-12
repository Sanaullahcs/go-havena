import ComplaintChatScreen from "../../../components/complaints/complaint-chat-screen";
import { useAdminComplaintMode } from "../../../hooks/use-complaint-mode";

export default function AdminComplaintChatScreen() {
  useAdminComplaintMode();
  return <ComplaintChatScreen audience="admin" backTo="/screens/admin-complaints" />;
}