"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser, isSystemAdminUser } from "@/lib/auth/session";

export default function FeatureSettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(isSystemAdminUser(getUser()) ? "/admin/communities" : "/admin/profile");
  }, [router]);

  return null;
}
