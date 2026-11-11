"use client";

import { useEffect, useState } from "react";
import { Users, X } from "lucide-react";
import { UserAvatar } from "@/components/admin/user-avatar";
import { AdminBadge, DtPagination } from "@/components/admin/ui";
import {
  fetchAdminPollVoters,
  type AdminPollVotersMeta,
  type AdminPollVotersPayload,
  type AdminPost,
} from "@/lib/api/posts";
import { apiError } from "@/lib/api/client";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";

const SKELETON_SHIMMER =
  "animate-skeleton rounded bg-gradient-to-r from-slate-200/80 via-slate-100 to-slate-200/80 bg-[length:200%_100%]";

function voterRoleLabel(role?: string | null): string {
  if (!role) return "Resident";
  if (role === "community_admin") return "Community admin";
  if (role === "system_admin") return "System admin";
  return role.replace(/_/g, " ");
}

export function PollVoterDetailsModal({
  post,
  onClose,
}: {
  post: AdminPost | null;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<AdminPollVotersPayload | null>(null);
  const [meta, setMeta] = useState<AdminPollVotersMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPage(1);
  }, [post?.id]);

  useEffect(() => {
    if (!post) {
      setPayload(null);
      setMeta(null);
      setPage(1);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    void fetchAdminPollVoters(post.id, { page, per_page: ADMIN_TABLE_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setPayload(res.data);
        setMeta(res.meta);
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err) || "Could not load voter details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [post, page]);

  if (!post) return null;

  const question = payload?.question ?? post.poll?.question ?? post.body ?? "";
  const voters = payload?.voters ?? [];
  const voterCount = meta?.total ?? payload?.unique_voters_count ?? 0;
  const isMultiple = (payload?.voting_method ?? post.poll?.voting_method) === "multiple";
  const lastPage = meta?.last_page ?? 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 pr-3">
            <h3 className="text-lg font-bold text-slate-900">Voter details</h3>
            <p className="mt-0.5 truncate text-xs text-slate-500">Poll #{post.id} · {question}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close voter details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <PollVotersSummarySkeleton />
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F0F7]">
                <Users className="h-5 w-5 text-[#1B4F8A]" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Residents who voted</p>
                <p className="mt-0.5 text-2xl font-bold text-[#1B4F8A]">{voterCount}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {isMultiple ? "Multiple selections allowed per resident" : "One option per resident"}
                </p>
              </div>
            </div>
          )}

          {error ? (
            <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          {loading ? (
            <ul className="mt-4 space-y-3" aria-busy="true" aria-label="Loading voters">
              {Array.from({ length: 4 }).map((_, index) => (
                <PollVoterRowSkeleton key={index} />
              ))}
            </ul>
          ) : null}

          {!loading && !error && voters.length === 0 ? (
            <p className="mt-6 rounded-xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
              No residents have voted on this poll yet.
            </p>
          ) : null}

          {!loading && voters.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {voters.map((voter) => (
                <li
                  key={voter.user_id}
                  className="rounded-xl border border-slate-100 bg-slate-50/50 p-4"
                >
                  <div className="flex items-start gap-3">
                    <UserAvatar name={voter.name} src={voter.avatar_url} className="h-10 w-10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{voter.name}</p>
                        <AdminBadge tone="slate">{voterRoleLabel(voter.role)}</AdminBadge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                        {voter.unit_number ? <span>Unit {voter.unit_number}</span> : null}
                        {voter.voted_at ? <span>Last vote · {formatVotedAt(voter.voted_at)}</span> : null}
                      </div>
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {isMultiple ? "Selected options" : "Selected option"}
                        </p>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {voter.selected_options.map((option) => (
                            <li
                              key={option.id}
                              className="rounded-full border border-[#1B4F8A]/25 bg-[#E8F0F7] px-3 py-1 text-sm font-medium text-[#1B4F8A]"
                            >
                              {option.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {!error && voterCount > 0 ? (
          <div className="shrink-0 border-t border-slate-100">
            <DtPagination
              showing={loading ? 0 : voters.length}
              total={voterCount}
              page={page}
              lastPage={lastPage}
              pageSize={ADMIN_TABLE_PAGE_SIZE}
              onPageChange={(next) => setPage(next)}
            />
          </div>
        ) : null}

        <div className="border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary w-full justify-center">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PollVotersSummarySkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4">
      <div className={`h-10 w-10 shrink-0 rounded-full ${SKELETON_SHIMMER}`} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className={`h-2.5 w-28 ${SKELETON_SHIMMER}`} />
        <div className={`h-7 w-12 ${SKELETON_SHIMMER}`} />
        <div className={`h-2.5 w-40 ${SKELETON_SHIMMER}`} />
      </div>
    </div>
  );
}

function PollVoterRowSkeleton() {
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 shrink-0 rounded-full ${SKELETON_SHIMMER}`} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <div className={`h-4 w-28 ${SKELETON_SHIMMER}`} />
            <div className={`h-5 w-16 rounded-full ${SKELETON_SHIMMER}`} />
          </div>
          <div className={`h-3 w-48 max-w-full ${SKELETON_SHIMMER}`} />
          <div className={`h-2.5 w-24 ${SKELETON_SHIMMER}`} />
          <div className="flex gap-2">
            <div className={`h-7 w-16 rounded-full ${SKELETON_SHIMMER}`} />
            <div className={`h-7 w-20 rounded-full ${SKELETON_SHIMMER}`} />
          </div>
        </div>
      </div>
    </li>
  );
}

function formatVotedAt(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
