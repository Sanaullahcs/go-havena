import { redirect } from "next/navigation";

export default function CommunityRequestsRedirect() {
  redirect("/admin/communities?tab=requests");
}
