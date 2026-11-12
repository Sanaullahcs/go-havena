import ComplaintChatScreen from "../../../components/complaints/complaint-chat-screen";
import { useResidentComplaintMode } from "../../../hooks/use-complaint-mode";

export default function ResidentComplaintChatScreen() {
  useResidentComplaintMode();
  return <ComplaintChatScreen audience="resident" />;
}
