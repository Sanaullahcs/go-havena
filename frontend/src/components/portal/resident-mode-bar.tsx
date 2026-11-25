"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { toastError } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { switchToAdminMode } from "@/lib/auth/resident-mode";
import { canSwitchToAdminMode, getManagedCommunityId, getUser } from "@/lib/auth/session";

export function ResidentModeBar() {
  const router = useRouter();
  const user = getUser();
  const [busy, setBusy] = useState(false);

  if (!canSwitchToAdminMode(user)) return null;

  const communityName =
    user?.resident_mode_communities?.find((community) => community.id === user.active_context_community_id)?.name
    ?? user?.memberships?.find((membership) => membership.community_id === user.active_context_community_id)?.community?.name;

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Resident Mode</p>
        {communityName ? (
          <p className="truncate text-[12px] text-emerald-800/80">{communityName}</p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await switchToAdminMode(getManagedCommunityId(user));
            router.replace("/admin");
          } catch (err) {
            toastError(apiError(err));
            setBusy(false);
          }
        }}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-200 transition hover:bg-emerald-100 disabled:opacity-60 sm:w-auto sm:py-1.5"
      >
        <Shield className="h-3.5 w-3.5" />
        {busy ? "Returning…" : "Return to Admin"}
      </button>
    </div>
  );
}
