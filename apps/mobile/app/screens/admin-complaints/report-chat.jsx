import ComplaintChatScreen from "../../../components/complaints/complaint-chat-screen";
import { useAdminComplaintMode } from "../../../hooks/use-complaint-mode";

export default function AdminTechnicalReportChatScreen() {
  useAdminComplaintMode();
  return <ComplaintChatScreen audience="resident" backTo="/screens/admin-complaints" />;
}
