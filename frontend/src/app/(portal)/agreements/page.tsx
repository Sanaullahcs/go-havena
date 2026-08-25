"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Pencil, ShieldCheck } from "lucide-react";
import { apiError } from "@/lib/api/client";
import { PageLoader, EmptyState } from "@/components/shared/page-states";
import { categoryLabel, fetchMyAgreements, type Agreement, type RecipientStatus } from "@/lib/api/agreements";

type Filter = "awaiting" | "signed" | "all";

function formatDate(value?: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusCopy(status?: RecipientStatus) {
  switch (status) {
    case "signed":
      return { label: "Signed", className: "bg-emerald-50 text-emerald-700" };
    case "declined":
      return { label: "Declined", className: "bg-rose-50 text-rose-700" };
    case "viewed":
      return { label: "In review", className: "bg-blue-50 text-blue-700" };
    default:
      return { label: "Needs signature", className: "bg-amber-50 text-amber-800" };
  }
}

export default function ResidentAgreementsPage() {
  const [rows, setRows] = useState<Agreement[]>([]);
  const [stats, setStats] = useState({ awaiting: 0, signed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("awaiting");

  useEffect(() => {
    fetchMyAgreements()
      .then((res) => {
        setRows(Array.isArray(res.data) ? res.data : []);
        setStats(res.stats ?? { awaiting: 0, signed: 0 });
        setError(null);
      })
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    if (filter === "awaiting") return rows.filter((r) => r.my_status === "pending" || r.my_status === "viewed");
    if (filter === "signed") return rows.filter((r) => r.my_status === "signed");
    return rows;
  }, [rows, filter]);

  if (loading) return <PageLoader variant="cards" />;

  return (
    <div className="space-y-6">
      <div>
        <p className="nl-eyebrow" style={{ color: "#1B4F8A" }}>Community file</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Agreements</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Review community agreements and apply your paid digital signature. A certificate is stored with your unit file after you sign.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="nl-panel flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Pencil className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.awaiting}</p>
            <p className="text-sm text-slate-500">Waiting for your signature</p>
          </div>
        </div>
        <div className="nl-panel flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.signed}</p>
            <p className="text-sm text-slate-500">Certificates on file</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 w-fit">
        {([
          ["awaiting", "Awaiting"],
          ["signed", "Signed"],
          ["all", "All"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              filter === key
                ? "bg-white text-[#1B4F8A] shadow-sm ring-1 ring-slate-200/80"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="nl-panel py-12 text-center text-sm text-slate-400">{error}</div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={filter === "signed" ? "No signed agreements yet." : "Nothing waiting for you."}
          sub="When management sends a living standard, waiver, or pet form, it will appear here."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((row) => {
            const status = statusCopy(row.my_status);
            return (
              <Link
                key={row.id}
                href={`/agreements/${row.id}`}
                className="nl-panel flex items-start gap-3 p-4 transition hover:shadow-sm"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F0F7] text-[#1B4F8A]">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-slate-900">{row.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                    {row.signature_fee_label ? (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                        Fee {row.signature_fee_label}
                      </span>
                    ) : null}
                    {row.is_required ? (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                        Required
                      </span>
                    ) : null}
                    {row.is_overdue && (row.my_status === "pending" || row.my_status === "viewed") ? (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                        Overdue
                      </span>
                    ) : row.is_due_soon && (row.my_status === "pending" || row.my_status === "viewed") ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        Due soon
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[#1B4F8A]">{categoryLabel(row.category)}</p>
                  {row.cover_message ? (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{row.cover_message}</p>
                  ) : null}
                  <p className={`mt-1 text-sm ${row.is_overdue ? "text-rose-600" : "text-slate-500"}`}>Due {formatDate(row.due_at)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
