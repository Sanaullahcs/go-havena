"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import MembersPage from "../members/page";
import { isSystemAdminUser } from "@/lib/auth/session";
import { PageLoader } from "@/components/shared/page-states";

export default function ResidentsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isSystemAdminUser()) {
      router.replace("/admin/members");
    }
  }, [router]);

  if (!isSystemAdminUser()) {
    return <PageLoader text="Redirecting…" skeleton />;
  }

  return <MembersPage mode="system-residents" />;
}
