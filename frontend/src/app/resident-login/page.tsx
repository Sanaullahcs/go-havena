"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Deep-link alias — resident auth now lives on /login with an audience picker. */
export default function ResidentLoginRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login?audience=resident");
  }, [router]);

  return <div className="min-h-screen bg-[#f4f8fd]" />;
}
