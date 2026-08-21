"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Client navigations to folder routes can keep a trailing slash and 404. */
export function StripTrailingSlash() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const path = window.location.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      router.replace(path.replace(/\/+$/, "") + window.location.search + window.location.hash);
    }
  }, [pathname, router]);

  return null;
}
