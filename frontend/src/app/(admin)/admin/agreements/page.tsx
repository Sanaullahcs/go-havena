"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AgreementsRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const agreement = params.get("agreement");
    router.replace(
      agreement
        ? `/admin/documents?tab=agreements&agreement=${encodeURIComponent(agreement)}`
        : "/admin/documents?tab=agreements",
    );
  }, [router, params]);

  return null;
}

export default function AgreementsRedirectPage() {
  return (
    <Suspense fallback={null}>
      <AgreementsRedirect />
    </Suspense>
  );
}
