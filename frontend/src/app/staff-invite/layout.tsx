import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accept Your Staff Invitation",
  description:
    "This invitation can only be accepted through the Havena mobile app. Please open this invitation link on your mobile device.",
};

export default function StaffInviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
