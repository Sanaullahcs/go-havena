import { redirect } from "next/navigation";

export default function CreateUsersRedirectPage() {
  redirect("/admin/community-admins");
}
