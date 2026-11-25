"use client";

import { useEffect, useMemo, useState } from "react";
import { assignCommunityToAdmin, type CommunityAdminApplicant } from "@/lib/api/community-admins";
import { fetchAdminCommunities, type AdminCommunityOption } from "@/lib/api/communities";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import { formatAccountDisplayName } from "@/lib/user/email-display";

export function AssignAdminCommunityModal({
  admin,
  open,
  onClose,
  onAssigned,
}: {
  admin: CommunityAdminApplicant | null;
  open: boolean;
  onClose: () => void;
  onAssigned?: (updated: CommunityAdminApplicant) => void;
}) {
  const [communities, setCommunities] = useState<AdminCommunityOption[]>([]);
  const [communityId, setCommunityId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setCommunities([]);
      setCommunityId("");
      setSubmitting(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchAdminCommunities()
      .then((res) => {
        if (cancelled) return;
        const rows = [...(res.data ?? [])].sort((a, b) => {
          const aOpen = a.has_admin ? 1 : 0;
          const bOpen = b.has_admin ? 1 : 0;
          if (aOpen !== bOpen) return aOpen - bOpen;
          return a.name.localeCompare(b.name);
        });
        setCommunities(rows);
        setCommunityId(String(rows.find((row) => !row.has_admin)?.id ?? rows[0]?.id ?? ""));
      })
      .catch((err) => {
        if (!cancelled) toastError(apiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const selected = useMemo(
    () => communities.find((row) => String(row.id) === communityId) ?? null,
    [communities, communityId],
  );

  if (!open || !admin) return null;

  const handleAssign = async () => {
    if (!communityId) {
      toastError("Select a community to assign.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await assignCommunityToAdmin(admin.id, Number(communityId));
      toastSuccess(res.message);
      onAssigned?.(res.data);
      onClose();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
            Assign community
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">
            {formatAccountDisplayName(admin, "Community admin")}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Choose a community for this unassigned admin. They will return to Active after assignment.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-slate-700">
              Community <span className="text-red-500">*</span>
            </span>
            <select
              className="nl-input w-full"
              value={communityId}
              onChange={(event) => setCommunityId(event.target.value)}
              disabled={loading || submitting}
            >
              {communities.length === 0 ? (
                <option value="">{loading ? "Loading communities…" : "No communities available"}</option>
              ) : (
                communities.map((community) => (
                  <option key={community.id} value={community.id}>
                    {community.name}
                    {community.region_title || community.region
                      ? ` · ${community.region_title || community.region}`
                      : ""}
                    {community.has_admin ? " · has admin" : " · available"}
                  </option>
                ))
              )}
            </select>
          </label>

          {selected?.has_admin ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              This community already has an admin. Assigning {formatAccountDisplayName(admin)} will
              replace the current assignment.
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" className="nl-btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="nl-btn-primary"
            onClick={() => void handleAssign()}
            disabled={submitting || loading || !communityId}
          >
            {submitting ? "Assigning…" : "Assign community"}
          </button>
        </div>
      </div>
    </div>
  );
}
