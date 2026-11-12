"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getManagedCommunityId, getUser, SESSION_PATCHED_EVENT } from "@/lib/auth/session";
import { CheckCircle2, ChevronDown, LifeBuoy, MessageSquare, Timer, X } from "lucide-react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { ComplaintChatModal } from "@/components/admin/complaint-chat-modal";
import { AdminBadge, DataTable, DtPagination, StatTile } from "@/components/admin/ui";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { PageError } from "@/components/shared/page-states";
import {
  ADMIN_COMPLAINT_SYNC_MS,
  assignAdminComplaint,
  downloadAdminComplaintAttachment,
  fetchAdminComplaint,
  fetchAdminComplaints,
  isComplaintNotification,
  updateAdminComplaintStatus,
  type ComplaintList,
  type ComplaintRecord,
  type ComplaintStatus,
} from "@/lib/api/complaints";
import { emitNotificationsRefresh } from "@/lib/api/notifications";
import { subscribeForegroundNotification } from "@/lib/notifications/foreground-notification-events";
import { apiError } from "@/lib/api/client";

const STATUS_TONE: Record<string, "slate" | "blue" | "cyan" | "amber" | "green" | "violet" | "red"> = {
  submitted: "slate",
  in_review: "blue",
  in_progress: "cyan",
  waiting_on_resident: "amber",
  resolved: "green",
  reopened: "violet",
  closed: "slate",
  cancelled: "red",
};

const PRIORITY_TONE = {
  low: "slate",
  normal: "blue",
  high: "amber",
  urgent: "red",
} as const;

const STATUS_ACTION: Record<string, string> = {
  in_review: "Mark in review",
  in_progress: "Mark in progress",
  waiting_on_resident: "Waiting on resident",
  resolved: "Mark resolved",
  closed: "Close",
  cancelled: "Cancel",
  reopened: "Reopen",
};

const CATEGORIES = [
  ["all", "All categories"],
  ["plumbing", "Plumbing"],
  ["electrical", "Electrical"],
  ["cleaning", "Cleaning"],
  ["lifts", "Lifts"],
  ["parking", "Parking"],
  ["app_bug", "App Bug"],
  ["account", "Account"],
  ["login", "Login"],
  ["payment", "Payment"],
  ["other", "Other"],
] as const;

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatWhen(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function readComplaintId() {
  if (typeof window === "undefined") return null;
  const value = Number(new URLSearchParams(window.location.search).get("complaint") || 0);
  return value || null;
}

export function ComplaintsPanel({ audience }: { audience: "community" | "system" }) {
  const router = useRouter();
  const pathname = usePathname();
  const base = audience === "system" ? "/admin/support-complaints" : "/admin/complaints";
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [communityId, setCommunityId] = useState<number | null>(() => getManagedCommunityId(getUser()) ?? null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [rows, setRows] = useState<ComplaintRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ComplaintRecord | null>(null);
  const [detailError, setDetailError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const categories = CATEGORIES.filter(([key]) => {
    if (key === "all" || key === "other") return true;
    return audience === "community"
      ? ["plumbing", "electrical", "cleaning", "lifts", "parking"].includes(key)
      : ["app_bug", "account", "login", "payment"].includes(key);
  });

  useEffect(() => {
    setSelectedId(readComplaintId());
  }, [pathname]);

  useEffect(() => {
    const syncCommunity = () => {
      const next = getManagedCommunityId(getUser()) ?? null;
      if (communityRef.current !== next) {
        communityRef.current = next;
        setPage(1);
        setRows([]);
        setCounts({});
      }
      setCommunityId(next);
      setSessionEpoch((current) => current + 1);
    };
    const syncQuery = () => setSelectedId(readComplaintId());
    syncCommunity();
    window.addEventListener("popstate", syncQuery);
    window.addEventListener("nbr-session-updated", syncCommunity);
    window.addEventListener(SESSION_PATCHED_EVENT, syncCommunity);
    return () => {
      window.removeEventListener("popstate", syncQuery);
      window.removeEventListener("nbr-session-updated", syncCommunity);
      window.removeEventListener(SESSION_PATCHED_EVENT, syncCommunity);
    };
  }, [pathname]);

  const loadRequest = useRef(0);
  const inflight = useRef(false);
  const communityRef = useRef(communityId);
  const signatureRef = useRef("");
  const selectedIdRef = useRef(selectedId);
  const busyRef = useRef(busy);
  const detailRef = useRef(detail);
  selectedIdRef.current = selectedId;
  busyRef.current = busy;
  detailRef.current = detail;

  const applyList = useCallback((result: ComplaintList, silent: boolean) => {
    const signature = [
      result.meta.total,
      result.meta.current_page,
      JSON.stringify(result.meta.counts ?? {}),
      result.data.map((row) => `${row.id}:${row.status}:${row.updated_at}:${row.assigned_to_user_id ?? ""}`).join(","),
    ].join("|");
    if (silent && signature === signatureRef.current) return false;
    const hadSnapshot = signatureRef.current !== "";
    signatureRef.current = signature;
    setRows(result.data);
    setCounts(result.meta.counts ?? {});
    setLastPage(result.meta.last_page);
    setTotal(result.meta.total);
    return silent && hadSnapshot;
  }, []);

  const load = useCallback(async (silent = false) => {
    if (silent && (inflight.current || busyRef.current)) return;
    const requestId = ++loadRequest.current;
    inflight.current = true;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const result = await fetchAdminComplaints({ search, status, category, priority, page });
      if (requestId !== loadRequest.current) return;
      const changed = applyList(result, silent);
      if (!silent) setError("");
      if (!changed) return;
      emitNotificationsRefresh();
      const openId = selectedIdRef.current;
      const openRow = openId ? result.data.find((row) => row.id === openId) : undefined;
      const currentDetail = detailRef.current;
      if (!openId || !openRow || busyRef.current) return;
      if (currentDetail?.id === openId && currentDetail.updated_at === openRow.updated_at) return;
      const fresh = await fetchAdminComplaint(openId);
      if (selectedIdRef.current !== openId) return;
      setDetail((current) => (current?.id === fresh.id ? fresh : current));
    } catch (err) {
      if (requestId !== loadRequest.current || silent) return;
      setError(apiError(err));
    } finally {
      if (requestId === loadRequest.current) {
        inflight.current = false;
        if (!silent) setLoading(false);
      }
    }
  }, [search, status, category, priority, page, communityId, sessionEpoch, applyList]);

  useEffect(() => {
    signatureRef.current = "";
    const handle = window.setTimeout(() => void load(), search ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [load, search]);

  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      void load(true);
    };
    const timer = window.setInterval(sync, ADMIN_COMPLAINT_SYNC_MS);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    const unsubscribe = subscribeForegroundNotification((payload) => {
      if (!isComplaintNotification(payload)) return;
      void load(true);
    });
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      unsubscribe();
    };
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailError("");
    setChatOpen(false);
    fetchAdminComplaint(selectedId)
      .then((row) => {
        if (!cancelled) setDetail(row);
      })
      .catch((err) => {
        if (!cancelled) setDetailError(apiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const openComplaint = (id: number) => {
    setSelectedId(id);
    const next = new URLSearchParams(window.location.search);
    next.set("complaint", String(id));
    router.replace(`${base}?${next.toString()}`);
  };

  const closeComplaint = () => {
    setSelectedId(null);
    const next = new URLSearchParams(window.location.search);
    next.delete("complaint");
    const query = next.toString();
    router.replace(query ? `${base}?${query}` : base);
  };

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
      if (chatOpen) setChatOpen(false);
      else closeComplaint();
    }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, chatOpen, base, router]);

  const runStatus = async (row: ComplaintRecord, next: ComplaintStatus) => {
    const confirmed = await confirmAction({
      title: `${STATUS_ACTION[next] ?? "Update"}?`,
      text: `${row.reference} will move to ${next.replaceAll("_", " ")}.`,
      confirmText: "Update",
      color: next === "cancelled" ? "red" : "blue",
    });
    if (!confirmed.isConfirmed) return;
    setBusy(true);
    try {
      const updated = await updateAdminComplaintStatus(row.id, next);
      toastSuccess("Complaint updated");
      setDetail((current) => (current?.id === updated.id ? updated : current));
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const assign = async (userId: number) => {
    if (!detail || !userId) return;
    const confirmed = await confirmAction({
      title: "Assign this complaint?",
      text: "The selected staff member will be notified.",
      confirmText: "Assign",
    });
    if (!confirmed.isConfirmed) return;
    setBusy(true);
    try {
      const updated = await assignAdminComplaint(detail.id, userId);
      setDetail(updated);
      toastSuccess("Complaint assigned");
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (fileId: number, name: string) => {
    if (!detail) return;
    try {
      const blob = await downloadAdminComplaintAttachment(detail.id, fileId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const openCount = ["submitted", "in_review", "in_progress", "waiting_on_resident", "reopened"].reduce(
    (sum, key) => sum + Number(counts[key] ?? 0),
    0,
  );
  const filters = useMemo(
    () => [
      { key: "all", label: "All", count: counts.all ?? 0 },
      { key: "submitted", label: "Submitted", count: counts.submitted ?? 0 },
      { key: "in_review", label: "In Review", count: counts.in_review ?? 0 },
      { key: "in_progress", label: "In Progress", count: counts.in_progress ?? 0 },
      { key: "waiting_on_resident", label: "Waiting", count: counts.waiting_on_resident ?? 0 },
      { key: "resolved", label: "Resolved", count: counts.resolved ?? 0 },
      { key: "reopened", label: "Reopened", count: counts.reopened ?? 0 },
      { key: "closed", label: "Closed", count: counts.closed ?? 0 },
      { key: "cancelled", label: "Cancelled", count: counts.cancelled ?? 0 },
    ],
    [counts],
  );

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total" value={counts.all ?? 0} icon={<LifeBuoy />} tone="blue" />
        <StatTile label="Open" value={openCount} icon={<Timer />} tone="amber" />
        <StatTile label="Waiting" value={counts.waiting_on_resident ?? 0} icon={<MessageSquare />} tone="violet" />
        <StatTile label="Resolved" value={counts.resolved ?? 0} icon={<CheckCircle2 />} tone="green" />
      </div>
      {error ? <PageError message={error} onRetry={() => void load()} /> : null}
      <DataTable
        title={audience === "system" ? "Complaints & Support" : "Complaints"}
        totalCount={total}
        search={search}
        onSearch={(value) => {
          setPage(1);
          setSearch(value);
        }}
        searchPlaceholder="Search tickets"
        loading={loading}
        filters={filters}
        activeFilter={status}
        onFilter={(key) => {
          setPage(1);
          setStatus(key);
        }}
        beforeSearch={
          <div className="flex gap-2">
            <div className="relative shrink-0">
              <select aria-label="Category" value={category} onChange={(event) => { setPage(1); setCategory(event.target.value); }} className="h-8 w-44 appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-9 text-[12.5px] font-medium text-slate-700 outline-none focus:border-blue-400 sm:w-52">
                {categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            </div>
            <div className="relative shrink-0">
              <select aria-label="Priority" value={priority} onChange={(event) => { setPage(1); setPriority(event.target.value); }} className="h-8 w-32 appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-9 text-[12.5px] font-medium text-slate-700 outline-none focus:border-blue-400">
                <option value="all">All priorities</option>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            </div>
          </div>
        }
        isEmpty={!loading && rows.length === 0}
        empty="No complaints match your filters."
      >
        <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              {["Ticket ID", "Complaint", "Resident", "Unit", "Category", "Priority", "Submitted Date", "Status", "Actions"].map((label) => (
                <th key={label} className="px-4 py-3 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-900">{row.reference}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{row.title}</p>
                  <p className="text-xs text-slate-400">{row.support_team}</p>
                </td>
                <td className="px-4 py-3 text-slate-700">{row.reporter_name}</td>
                <td className="px-4 py-3 text-slate-700">{row.unit_number ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{row.category_label}</td>
                <td className="px-4 py-3"><AdminBadge tone={PRIORITY_TONE[row.priority]}>{row.priority}</AdminBadge></td>
                <td className="px-4 py-3 text-slate-700">{formatDate(row.created_at)}</td>
                <td className="px-4 py-3"><AdminBadge tone={STATUS_TONE[row.status] ?? "slate"}>{row.status_label}</AdminBadge></td>
                <td className="px-4 py-3 text-right">
                  <AdminActionsMenu
                    actions={[
                      { label: "View", icon: "view", onClick: () => openComplaint(row.id) },
                      ...(row.allowed_transitions ?? []).map((next) => ({
                        label: STATUS_ACTION[next] ?? next,
                        icon: next === "cancelled" ? "ban" as const : "check" as const,
                        tone: next === "cancelled" ? "danger" as const : "primary" as const,
                        onClick: () => void runStatus(row, next),
                      })),
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <DtPagination showing={rows.length} total={total} page={page} lastPage={lastPage} onPageChange={setPage} pageSize={8} />
      </DataTable>
      {selectedId ? (
        <ComplaintDetailModal
          detail={detail}
          error={detailError}
          busy={busy}
          onClose={closeComplaint}
          onOpenChat={() => setChatOpen(true)}
          onRetry={() => openComplaint(selectedId)}
          onAssign={(userId) => void assign(userId)}
          onStatus={(next) => {
            if (detail) void runStatus(detail, next);
          }}
          onOpenFile={(fileId, name) => void openFile(fileId, name)}
        />
      ) : null}
      {chatOpen && detail ? (
        <ComplaintChatModal
          detail={detail}
          onBack={() => setChatOpen(false)}
          onSynced={(record) => setDetail((current) => (current?.id === record.id ? record : current))}
        />
      ) : null}
    </section>
  );
}

function ComplaintDetailModal({
  detail,
  error,
  busy,
  onClose,
  onOpenChat,
  onRetry,
  onAssign,
  onStatus,
  onOpenFile,
}: {
  detail: ComplaintRecord | null;
  error: string;
  busy: boolean;
  onClose: () => void;
  onOpenChat: () => void;
  onRetry: () => void;
  onAssign: (userId: number) => void;
  onStatus: (next: ComplaintStatus) => void;
  onOpenFile: (fileId: number, name: string) => void;
}) {
  const facts = detail
    ? [
        ["Resident", detail.reporter_name],
        ["Unit", detail.unit_number ?? "—"],
        ["Category", detail.category_label],
        ["Priority", detail.priority],
        ["Assigned", detail.assigned_to_name ?? "Unassigned"],
        ["Submitted", formatDate(detail.created_at)],
      ]
    : [];

  return (
    <div className="nl-notice-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="nl-notice-modal"
        style={{ maxWidth: "58rem" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="complaint-view-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="nl-notice-modal-head">
          <div className="min-w-0 flex-1">
            <p className="nl-notice-modal-eyebrow">{detail?.reference ?? "Complaint"}</p>
            {detail ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <AdminBadge tone={STATUS_TONE[detail.status] ?? "slate"}>{detail.status_label}</AdminBadge>
                <AdminBadge tone={PRIORITY_TONE[detail.priority]}>
                  {detail.priority.charAt(0).toUpperCase() + detail.priority.slice(1)}
                </AdminBadge>
                <AdminBadge tone="slate">{detail.category_label}</AdminBadge>
              </div>
            ) : null}
            <h3 id="complaint-view-title" className="nl-notice-modal-title mt-2 break-words">
              {detail?.title ?? (error ? "Could not open complaint" : "Loading complaint")}
            </h3>
            {detail ? (
              <p className="mt-1 text-[13px] text-slate-500">
                {detail.reporter_name}
                {detail.unit_number ? ` · Unit ${detail.unit_number}` : ""}
                {` · ${formatDate(detail.created_at)}`}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="nl-notice-modal-close" aria-label="Close">
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </header>

        <div className="nl-notice-modal-body">
          {error ? <PageError message={error} onRetry={onRetry} /> : null}
          {!detail && !error ? <p className="py-10 text-center text-sm text-slate-500">Loading complaint…</p> : null}
          {detail ? (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_17.5rem]">
              <div className="min-w-0">
                <div className="nl-notice-view-grid">
                  {facts.map(([label, value]) => (
                    <div key={label} className="nl-notice-view-tile">
                      <div className="min-w-0">
                        <p className="nl-notice-view-tile-label">{label}</p>
                        <p className="nl-notice-view-tile-value capitalize">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {detail.description ? (
                  <div className="nl-notice-view-section">
                    <p className="nl-notice-view-section-title">Description</p>
                    <p className="nl-notice-view-body whitespace-pre-wrap">{detail.description}</p>
                  </div>
                ) : null}

                <div className="nl-notice-view-section">
                  <p className="nl-notice-view-section-title">Attachments</p>
                  {(detail.attachments ?? []).length === 0 ? (
                    <p className="text-sm text-slate-400">No attachments.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(detail.attachments ?? []).map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-[#1B4F8A] hover:bg-slate-50"
                          onClick={() => onOpenFile(file.id, file.file_name)}
                        >
                          {file.file_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="nl-notice-view-section">
                  <p className="nl-notice-view-section-title">Conversation</p>
                  <button
                    type="button"
                    onClick={onOpenChat}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left hover:border-[#1B4F8A]/30 hover:bg-slate-50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E8F0F7] text-[#1B4F8A]">
                      <MessageSquare className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">Open chat</span>
                      <span className="block truncate text-xs text-slate-500">
                        {(detail.messages ?? []).filter((message) => message.visibility !== "internal").at(-1)?.body || "No messages yet"}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-[#1B4F8A]">
                      {(detail.messages ?? []).filter((message) => message.visibility !== "internal").length}
                    </span>
                  </button>
                </div>
              </div>

              <aside className="space-y-3 lg:sticky lg:top-0">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="nl-notice-view-section-title">Assignment</p>
                  <label className="mt-2 block text-xs font-medium text-slate-500" htmlFor="assignee">
                    Staff member
                  </label>
                  <select
                    id="assignee"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-[#1B4F8A]"
                    value={detail.assigned_to_user_id ?? ""}
                    onChange={(event) => onAssign(Number(event.target.value))}
                  >
                    <option value="">Unassigned</option>
                    {(detail.assignees ?? []).map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(detail.allowed_transitions ?? []).map((next) => (
                      <button
                        key={next}
                        type="button"
                        disabled={busy}
                        onClick={() => onStatus(next)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                          next === "cancelled"
                            ? "border-red-200 text-red-700 hover:bg-red-50"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {STATUS_ACTION[next] ?? next}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="nl-notice-view-section-title">Activity</p>
                  {(detail.events ?? []).length === 0 ? <p className="text-sm text-slate-400">No activity yet.</p> : null}
                  <ol className="mt-1 space-y-3 border-l border-slate-200 pl-3">
                    {(detail.events ?? []).map((event) => (
                      <li key={event.id} className="relative text-sm text-slate-600">
                        <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-[#1B4F8A]" />
                        <p className="font-medium capitalize text-slate-800">
                          {event.action.replaceAll("_", " ")}
                          {event.to_status ? ` · ${event.to_status.replaceAll("_", " ")}` : ""}
                        </p>
                        {event.note ? <p className="mt-0.5">{event.note}</p> : null}
                        <p className="text-[11px] text-slate-400">{formatWhen(event.created_at)}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </aside>
            </div>
          ) : null}
        </div>

        <footer className="nl-notice-modal-foot">
          <button type="button" onClick={onClose} className="nl-btn-ghost">
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
