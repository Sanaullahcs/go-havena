"use client";

import { Info } from "lucide-react";

export function ResidentInviteProfileNotice({ message }: { message: string }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-teal-100 bg-teal-50/80 px-3.5 py-3 text-[12.5px] leading-relaxed text-teal-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" strokeWidth={2} aria-hidden />
      <p>{message}</p>
    </div>
  );
}
