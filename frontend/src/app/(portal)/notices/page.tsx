"use client";

import { useState, useEffect } from "react";
import { fetchNotices, type Notice } from "@/lib/api/notices";
import { apiError } from "@/lib/api/client";
import { PageLoader, EmptyState } from "@/components/shared/page-states";
import { getUser } from "@/lib/auth/session";
import { isResidentFeatureEnabled } from "@/lib/resident-features";

type NCategory = "All" | "General" | "Emergency" | "Event" | "Maintenance";

const CAT_COLOR: Record<string, string> = {
  General:     "#64748b",
  Emergency:   "#dc2626",
  Event:       "#7c3aed",
  Maintenance: "#d97706",
};

function categoryAllowed(category: string, features: ReturnType<typeof getUser> | null | undefined) {
  const payload = features?.resident_features;
  if (category === "Event") return isResidentFeatureEnabled(payload, "events");
  if (category === "Emergency") return isResidentFeatureEnabled(payload, "alerts");
  return isResidentFeatureEnabled(payload, "notices");
}

export default function NoticesPage() {
  const user = getUser();
  const filters = (["All", "General", "Emergency", "Event", "Maintenance"] as NCategory[]).filter(
    (item) => item === "All" || categoryAllowed(item, user),
  );
  const [filter, setFilter]   = useState<NCategory>("All");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchNotices({ status: "published" })
      .then((res) => { setNotices(res.data); setError(null); })
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
  }, []);

  const visible = notices.filter((n) => {
    if (!categoryAllowed(n.category, user)) return false;
    return filter === "All" || n.category === filter;
  });

  if (loading) return <PageLoader variant="cards" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow" style={{ color: "#0D9488" }}>Community</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Notices</h2>
          <p className="mt-1 text-sm text-slate-500">Community announcements, alerts, and updates.</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 w-fit">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              filter === f
                ? "bg-white shadow-sm ring-1 ring-slate-200/80 text-[#0D9488]"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Notices list */}
      {error ? (
        <div className="nl-panel py-12 text-center text-sm text-slate-400">{error}</div>
      ) : visible.length === 0 ? (
        <EmptyState title="No notices in this category." sub="Check back later for community announcements." />
      ) : (
        <div className="space-y-3">
          {visible.map((n) => {
            const important = n.category === "Emergency";
            return (
              <div
                key={n.id}
                className={[
                  "nl-panel overflow-hidden transition hover:shadow-sm",
                  important ? "ring-1 ring-red-200/80" : "",
                ].join(" ")}
              >
                <div className="h-1" style={{ background: CAT_COLOR[n.category] ?? "#64748b" }} />
                <div className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                          style={{ background: CAT_COLOR[n.category] ?? "#64748b" }}
                        >
                          {n.category}
                        </span>
                        {important && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            Important
                          </span>
                        )}
                        <span className="text-[12px] text-slate-400">
                          {n.published_at ? new Date(n.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
                        </span>
                      </div>
                      <h3 className="mt-2 text-[15px] font-semibold text-slate-900">{n.title}</h3>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">{n.body}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
