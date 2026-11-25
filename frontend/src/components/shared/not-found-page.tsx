"use client";

import { usePathname, useRouter } from "next/navigation";
import { MinimalStatusCenter } from "@/components/shared/minimal-status-center";

const NOT_FOUND_COPY = {
  title: "Page Not Found",
  description:
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.",
};

export function NotFoundContent({ embedded = false }: { embedded?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdminArea = (pathname ?? "").startsWith("/admin");

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace(isAdminArea ? "/admin" : "/");
  };

  return (
    <div
      className={
        embedded
          ? "flex min-h-[min(420px,calc(100dvh-10rem))] w-full items-center justify-center bg-[#F8F9FA]"
          : "flex min-h-dvh w-full items-center justify-center bg-[#F8F9FA]"
      }
    >
      <MinimalStatusCenter
        code="404"
        title={NOT_FOUND_COPY.title}
        description={NOT_FOUND_COPY.description}
        actionLabel="Go Back"
        onAction={goBack}
      />
    </div>
  );
}

export function NotFoundPage() {
  return <NotFoundContent />;
}