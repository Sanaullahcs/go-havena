"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { getManagedCommunityId, getUser, SESSION_PATCHED_EVENT } from "@/lib/auth/session";
import { Calendar, CheckCircle2, ChevronDown, CircleDot, ClipboardList, Clock, FileText, Flag, Hash, MessageSquare, Paperclip, SlidersHorizontal, Tag, UserCheck, UserRound, X } from "lucide-react";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { ComplaintChatModal } from "@/components/admin/complaint-chat-modal";
import { AdminBadge, DataTable, DtPagination } from "@/components/admin/ui";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedSelect } from "@/components/ui/themed-select";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { PageError } from "@/components/shared/page-states";
import {
  ADMIN_COMPLAINT_SYNC_MS,
  assignAdminComplaint,
  markAdminComplaintRead,
  downloadAdminComplaintAttachment,
  fetchAdminComplaint,
  fetchAdminComplaintAssignees,
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
  open: "slate",
  requested: "violet",
  pending: "amber",
  in_review: "amber",
  in_progress: "blue",
  waiting_on_resident: "amber",
  not_resolved: "red",
  resolved: "green",
  reopened: "violet",
  closed: "slate",
  cancelled: "red",
};

function complaintTone(record: { status: string; workflow_status?: string }) {
  const key = record.workflow_status || record.status;
  return STATUS_TONE[key] ?? STATUS_TONE[record.status] ?? "slate";
}

function assignedStaffName(record: { assigned_to_name?: string | null; assigned_staff_label?: string | null }) {
  if (record.assigned_to_name) return record.assigned_to_name;
  if (record.assigned_staff_label) return record.assigned_staff_label.split(" · ")[0];
  return "";
}

function complaintWorkflow(record: { status: string; workflow_status?: string }) {
  return record.workflow_status || (record.status === "submitted" ? "open" : record.status);
}

type StaffAssignMode = "assign" | "change" | "reassign" | "emergency";

const STAFF_ASSIGN_COPY: Record<StaffAssignMode, { title: string; confirmTitle: string; confirmText: string; confirmButton: string; color: "blue" | "amber" }> = {
  assign: {
    title: "Assign Staff",
    confirmTitle: "Assign this complaint?",
    confirmText: "The selected staff member will be notified.",
    confirmButton: "Assign",
    color: "blue",
  },
  change: {
    title: "Change Staff",
    confirmTitle: "Change the assigned staff?",
    confirmText: "The current request will be withdrawn and the new staff member will be notified.",
    confirmButton: "Change staff",
    color: "blue",
  },
  reassign: {
    title: "Reassign Staff",
    confirmTitle: "Reassign this complaint?",
    confirmText: "The previous and new staff members will be notified. The complaint history is kept.",
    confirmButton: "Reassign",
    color: "blue",
  },
  emergency: {
    title: "Emergency reassignment",
    confirmTitle: "Reassign during in-progress work?",
    confirmText: "Use this only when the assigned staff member cannot continue. The resident and both staff members will be notified.",
    confirmButton: "Reassign",
    color: "amber",
  },
};

const PRIORITY_TONE = {
  low: "slate",
  normal: "slate",
  high: "amber",
  urgent: "red",
} as const;

const STATUS_ACTION: Record<string, string> = {
  in_review: "Mark in review",
  in_progress: "Mark in progress",
  waiting_on_resident: "Waiting on resident",
  not_resolved: "Not resolved",
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

const ACTIVITY_STATUS: Record<string, string> = {
  submitted: "Open",
  in_review: "Pending",
  in_progress: "In Progress",
  waiting_on_resident: "Waiting on Resident",
  not_resolved: "Not Resolved",
  resolved: "Resolved",
  reopened: "Reopened",
  closed: "Closed",
  cancelled: "Cancelled",
};

const ACTIVITY_ACTION: Record<string, string> = {
  created: "Complaint submitted",
  status_changed: "Status updated",
  assigned: "Staff assigned",
  reassigned: "Staff changed",
  accepted: "Assignment accepted",
  declined: "Assignment declined",
  unassigned: "Assignment removed",
  message: "Message",
  internal_note: "Internal note",
  attachment: "Attachment added",
};

function activityTitle(action: string, toStatus?: string | null) {
  const label = ACTIVITY_ACTION[action] ?? action.replaceAll("_", " ");
  if (action !== "status_changed" || !toStatus) return label;
  return `${label} · ${ACTIVITY_STATUS[toStatus] ?? toStatus.replaceAll("_", " ")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type ComplaintFilterValue = {
  status: string;
  category: string;
  priority: string;
};

const PRIORITY_FILTERS = [
  { value: "all", label: "All" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

function activeFilterCount(value: ComplaintFilterValue) {
  return [value.status, value.category, value.priority].filter((item) => item !== "all").length;
}

function ComplaintFiltersButton({
  value,
  statuses,
  categories,
  onApply,
}: {
  value: ComplaintFilterValue;
  statuses: readonly (readonly [string, string])[];
  categories: readonly (readonly [string, string])[];
  onApply: (next: ComplaintFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { style } = useAnchoredPopover(open, anchorRef, {
    popoverRef: panelRef,
    width: 320,
    align: "right",
    gap: 8,
    maxHeight: 460,
    constrainToViewport: true,
    preferBelow: true,
  });
  const count = activeFilterCount(value);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (open) setDraft(valueRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".nl-themed-popover")) return;
      setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest(".nl-themed-popover")) return;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const apply = (next: ComplaintFilterValue) => {
    onApply(next);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-white px-3 text-[12.5px] font-semibold text-[#0A2A43] shadow-sm transition hover:border-[#14B8A6] ${
          open || count > 0 ? "border-[#14B8A6]" : "border-[#0A2A43]/15"
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-[#0D9488]" aria-hidden />
        Filters
        {count > 0 ? (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0A2A43] px-1 text-[10px] font-bold leading-none text-white">{count}</span>
        ) : null}
      </button>
      {open ? createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Complaint filters"
          style={style}
          className="overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(10,42,67,0.16)]"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#0A2A43]">Filters</p>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-[#0A2A43]" aria-label="Close filters">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <ThemedSelect
              label="Status"
              value={draft.status}
              options={statuses.map(([value, label]) => ({ value, label }))}
              onChange={(status) => setDraft((current) => ({ ...current, status }))}
            />
            <ThemedSelect
              label="Category"
              value={draft.category}
              options={categories.map(([value, label]) => ({ value, label }))}
              onChange={(category) => setDraft((current) => ({ ...current, category }))}
            />
            <ThemedSelect
              label="Priority"
              value={draft.priority}
              options={[...PRIORITY_FILTERS]}
              onChange={(priority) => setDraft((current) => ({ ...current, priority }))}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => apply({ status: "all", category: "all", priority: "all" })}
              className="text-[12.5px] font-semibold text-slate-500 hover:text-[#0A2A43]"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => apply(draft)}
              className="h-8 rounded-full bg-[#0A2A43] px-3.5 text-[12.5px] font-semibold text-white transition hover:bg-[#0D9488]"
            >
              Apply filters
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function formatSubmitted(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function isImageAttachment(file: { mime_type?: string | null; file_name: string }) {
  if (file.mime_type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(file.file_name);
}

function activityIcon(action: string) {
  if (action === "attachment") return Paperclip;
  if (action === "created") return FileText;
  if (action === "message" || action === "internal_note") return MessageSquare;
  if (action.includes("assign") || action === "accepted" || action === "declined") return UserRound;
  return CheckCircle2;
}

function ComplaintStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F7FB] text-[#1B4F8A]">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-slate-500">{label}</span>
        <span className="block text-[1.15rem] font-semibold tabular-nums leading-tight text-[#0A2A43]">{value}</span>
      </span>
    </div>
  );
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ComplaintRecord | null>(null);
  const [detailError, setDetailError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assignRow, setAssignRow] = useState<ComplaintRecord | null>(null);
  const [assignMode, setAssignMode] = useState<StaffAssignMode>("assign");
  const [assignOptions, setAssignOptions] = useState<NonNullable<ComplaintRecord["assignees"]>>([]);
  const [assignQuery, setAssignQuery] = useState("");
  const [assignChoice, setAssignChoice] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState("");

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
  const staffRevisionRef = useRef("");
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
      result.data.map((row) => `${row.id}:${row.status}:${row.workflow_status ?? ""}:${row.status_label}:${row.updated_at}:${row.assigned_to_user_id ?? ""}:${row.assigned_to_name ?? ""}`).join(","),
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
      const result = await fetchAdminComplaints({ search, status, category, priority, dateFrom, dateTo, page });
      if (requestId !== loadRequest.current) return;
      const staffRevision = result.meta.staff_revision ?? "";
      const staffChanged = staffRevisionRef.current !== "" && staffRevision !== staffRevisionRef.current;
      staffRevisionRef.current = staffRevision;
      const changed = applyList(result, silent);
      if (!silent) setError("");
      if (!changed && !staffChanged) return;
      if (changed) emitNotificationsRefresh();
      const openId = selectedIdRef.current;
      const openRow = openId ? result.data.find((row) => row.id === openId) : undefined;
      const currentDetail = detailRef.current;
      if (!openId || !openRow || busyRef.current) return;
      if (currentDetail?.id === openId && currentDetail.updated_at === openRow.updated_at && !staffChanged) return;
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
  }, [search, status, category, priority, dateFrom, dateTo, page, communityId, sessionEpoch, applyList]);

  useEffect(() => {
    signatureRef.current = "";
    staffRevisionRef.current = "";
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
    const openChat = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("chat") === "1";
    setChatOpen(openChat);
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

  const applyAssignment = (updated: ComplaintRecord) => {
    setDetail((current) => (current?.id === updated.id ? updated : current));
    setRows((current) => current.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
  };

  const saveAssignment = async (complaintId: number, userId: number, successMessage?: string) => {
    setBusy(true);
    try {
      const updated = await assignAdminComplaint(complaintId, userId);
      applyAssignment(updated);
      setAssignRow(null);
      toastSuccess(successMessage ?? (userId <= 0 ? "Assignment removed" : "Staff assigned"));
      await load();
    } catch (err) {
      toastError(apiError(err));
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const assign = async (userId: number) => {
    if (!detail) return;
    const removing = userId <= 0;
    const confirmed = await confirmAction({
      title: removing ? "Remove this assignment?" : detail.assigned_to_user_id ? "Change this assignment?" : "Assign this complaint?",
      text: removing
        ? "The complaint stays open and can be assigned again."
        : "The selected staff member will be notified.",
      confirmText: removing ? "Remove" : "Assign",
      color: removing ? "amber" : "blue",
    });
    if (!confirmed.isConfirmed) return;
    try {
      await saveAssignment(detail.id, removing ? 0 : userId);
    } catch {
      // The error toast is shown by saveAssignment.
    }
  };

  const openAssign = async (row: ComplaintRecord, mode: StaffAssignMode) => {
    setAssignMode(mode);
    setAssignRow(row);
    setAssignChoice("");
    setAssignQuery("");
    setAssignOptions([]);
    setAssignError("");
    setAssignLoading(true);
    try {
      setAssignOptions(await fetchAdminComplaintAssignees(row.id));
    } catch (err) {
      setAssignError(apiError(err));
    } finally {
      setAssignLoading(false);
    }
  };

  const confirmAssign = async () => {
    if (!assignRow || !assignChoice || busy) return;
    const userId = Number(assignChoice);
    if (!userId || userId === assignRow.assigned_to_user_id) return;
    const copy = STAFF_ASSIGN_COPY[assignMode];
    const confirmed = await confirmAction({
      title: copy.confirmTitle,
      text: copy.confirmText,
      confirmText: copy.confirmButton,
      color: copy.color,
    });
    if (!confirmed.isConfirmed) return;
    try {
      await saveAssignment(assignRow.id, userId, assignMode === "assign" ? "Staff assigned" : "Staff updated");
    } catch {
      // Keep the popup open so the admin can try another staff member.
    }
  };

  const cancelRequest = async (row: ComplaintRecord) => {
    const confirmed = await confirmAction({
      title: "Cancel this request?",
      text: "The assignment request will be withdrawn. The complaint returns to Open, and its history is kept.",
      confirmText: "Cancel request",
      color: "amber",
    });
    if (!confirmed.isConfirmed) return;
    try {
      await saveAssignment(row.id, 0, "Request cancelled");
    } catch {
      // The error toast is shown by saveAssignment.
    }
  };

  const communityActions = (row: ComplaintRecord) => {
    const view = { label: "View Details", icon: "view" as const, onClick: () => openComplaint(row.id) };
    if (row.type === "technical") return [view];
    const workflow = complaintWorkflow(row);
    if (workflow === "open" || workflow === "submitted") {
      return [view, { label: "Assign Staff", icon: "plus" as const, onClick: () => void openAssign(row, "assign") }];
    }
    if (workflow === "requested") {
      return [
        view,
        { label: "Change Staff", icon: "edit" as const, onClick: () => void openAssign(row, "change") },
        { label: "Cancel Request", icon: "ban" as const, tone: "danger" as const, onClick: () => void cancelRequest(row) },
      ];
    }
    if (workflow === "pending" || workflow === "in_review" || workflow === "not_resolved") {
      return [view, { label: "Reassign Staff", icon: "edit" as const, onClick: () => void openAssign(row, "reassign") }];
    }
    return [view];
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

  const openChat = async () => {
    if (!detail) return;
    setChatOpen(true);
    try {
      await markAdminComplaintRead(detail.id);
      setDetail((current) => (current?.id === detail.id ? { ...current, unread_count: 0 } : current));
      setRows((current) => current.map((row) => (row.id === detail.id ? { ...row, unread_count: 0 } : row)));
    } catch {
      // Opening the conversation still shows the messages if the read mark fails.
    }
  };

  const openCount = Number(counts.submitted ?? 0) + Number(counts.reopened ?? 0);
  const progressCount = Number(counts.in_progress ?? 0);
  const resolvedCount = Number(counts.resolved ?? 0);
  const statuses = [
    ["all", "All"],
    ["submitted", "Open"],
    ["in_review", "Pending"],
    ["in_progress", "In Progress"],
    ["waiting_on_resident", audience === "community" ? "Waiting" : "Waiting on Resident"],
    ["not_resolved", "Not Resolved"],
    ["resolved", "Resolved"],
    ["closed", "Closed"],
    ["reopened", "Reopened"],
    ["cancelled", "Cancelled"],
  ] as const;
  const applyFilters = (next: ComplaintFilterValue) => {
    setPage(1);
    setStatus(next.status);
    setCategory(next.category);
    setPriority(next.priority);
    setDateFrom("");
    setDateTo("");
  };
  const inlineFilters = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative shrink-0">
        <select aria-label="Status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="h-8 w-44 appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-9 text-[12.5px] font-medium text-slate-700 outline-none focus:border-blue-400">
          {statuses.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
      </div>
      <div className="relative shrink-0">
        <select aria-label="Category" value={category} onChange={(event) => { setPage(1); setCategory(event.target.value); }} className="h-8 w-40 appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-9 text-[12.5px] font-medium text-slate-700 outline-none focus:border-blue-400 sm:w-44">
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
      <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[12.5px] font-medium text-slate-700">
        <span className="text-slate-400">From</span>
        <input type="date" aria-label="From date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setPage(1); setDateFrom(event.target.value); }} className="bg-transparent text-[12.5px] font-medium text-slate-700 outline-none" />
      </label>
      <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[12.5px] font-medium text-slate-700">
        <span className="text-slate-400">To</span>
        <input type="date" aria-label="To date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setPage(1); setDateTo(event.target.value); }} className="bg-transparent text-[12.5px] font-medium text-slate-700 outline-none" />
      </label>
    </div>
  );

  const summary = (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <ComplaintStat icon={<ClipboardList className="h-4 w-4" />} label="Total" value={Number(counts.all ?? 0)} />
      <ComplaintStat icon={<CircleDot className="h-4 w-4" />} label="Open" value={openCount} />
      <ComplaintStat icon={<Clock className="h-4 w-4" />} label="In Progress" value={progressCount} />
      <ComplaintStat icon={<CheckCircle2 className="h-4 w-4" />} label="Resolved" value={resolvedCount} />
    </div>
  );

  return (
    <section className="space-y-4">
      {error ? <PageError message={error} onRetry={() => void load()} /> : null}
      <DataTable
        title={audience === "system" ? "Complaints & Support" : "Complaints"}
        titleCount={Number(counts.all ?? total)}
        intro={summary}
        stacked={audience === "community"}
        totalCount={total}
        search={search}
        onSearch={(value) => {
          setPage(1);
          setSearch(value);
        }}
        searchPlaceholder="Search complaints..."
        loading={loading}
        beforeSearch={audience === "system" ? inlineFilters : undefined}
        toolbar={audience === "community" ? (
          <ComplaintFiltersButton
            value={{ status, category, priority }}
            statuses={statuses}
            categories={categories}
            onApply={applyFilters}
          />
        ) : undefined}
        isEmpty={!loading && rows.length === 0}
        empty="No complaints match your filters."
      >
        <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
              {["Ticket", "Complaint", "Resident", "Unit", "Category", "Priority", "Assigned Staff", "Submitted", "Status", "Actions"].map((label) => (
                <th key={label} className={`sticky top-0 border-b border-slate-100 bg-white px-3 py-2.5 font-medium first:pl-4 last:pr-4 ${label === "Actions" ? "text-right" : ""}`}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="group transition-colors hover:bg-[#F8FAFC]">
                <td className="border-b border-slate-100 px-3 py-2.5 pl-4 align-middle">
                  <span className="font-mono text-[12px] font-medium tracking-wide text-[#1B4F8A]">{row.reference}</span>
                </td>
                <td className="border-b border-slate-100 px-3 py-2.5 align-middle">
                  <button type="button" onClick={() => openComplaint(row.id)} className="block max-w-[14rem] text-left">
                    <span className="block truncate text-[13px] font-semibold text-[#0A2A43]">{row.title}</span>
                  </button>
                </td>
                <td className="border-b border-slate-100 px-3 py-2.5 align-middle text-[13px] text-slate-600">{row.reporter_name}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 align-middle text-[13px] tabular-nums text-slate-600">{row.unit_number ?? "—"}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 align-middle text-[13px] text-slate-600">{row.category_label}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 align-middle">
                  <AdminBadge tone={PRIORITY_TONE[row.priority]}>
                    {row.priority.charAt(0).toUpperCase() + row.priority.slice(1)}
                  </AdminBadge>
                </td>
                <td className="border-b border-slate-100 px-3 py-2.5 align-middle">
                  {assignedStaffName(row) ? (
                    <span className="inline-flex max-w-[11rem] items-center gap-1.5 text-[13px] text-slate-700">
                      <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{assignedStaffName(row)}</span>
                    </span>
                  ) : (
                    <span className="text-[13px] text-slate-400">Unassigned</span>
                  )}
                </td>
                <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 align-middle text-[13px] text-slate-500">{formatDate(row.created_at)}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 align-middle">
                  <AdminBadge tone={complaintTone(row)}>{row.status_label}</AdminBadge>
                </td>
                <td className="border-b border-slate-100 px-3 py-2.5 pr-4 text-right align-middle">
                  <div className="inline-flex items-center justify-end gap-2">
                    {audience === "community" && row.type !== "technical" && complaintWorkflow(row) === "in_progress" ? (
                      <button
                        type="button"
                        title="Emergency reassignment. Use only if the assigned staff member cannot continue."
                        onClick={() => void openAssign(row, "emergency")}
                        className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100"
                      >
                        Emergency
                      </button>
                    ) : null}
                  <AdminActionsMenu
                    actions={audience === "community"
                      ? communityActions(row)
                      : [
                          { label: "View", icon: "view", onClick: () => openComplaint(row.id) },
                          ...(row.allowed_transitions ?? []).map((next) => ({
                            label: STATUS_ACTION[next] ?? next,
                            icon: next === "cancelled" ? "ban" as const : "check" as const,
                            tone: next === "cancelled" ? "danger" as const : "primary" as const,
                            onClick: () => void runStatus(row, next),
                          })),
                        ]}
                  />
                  </div>
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
          onOpenChat={() => void openChat()}
          onRetry={() => openComplaint(selectedId)}
          onAssign={(userId) => void assign(userId)}
          showAssignment={audience === "system"}
          allowStatusChanges={audience === "system"}
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
      {assignRow ? (
        <AssignStaffModal
          mode={assignMode}
          complaint={assignRow}
          options={assignOptions}
          query={assignQuery}
          choice={assignChoice}
          loading={assignLoading}
          error={assignError}
          busy={busy}
          onQuery={setAssignQuery}
          onChoice={setAssignChoice}
          onClose={() => {
            if (!busy) setAssignRow(null);
          }}
          onConfirm={() => void confirmAssign()}
        />
      ) : null}
    </section>
  );
}

function AttachmentThumb({
  complaintId,
  file,
  onOpen,
}: {
  complaintId: number;
  file: { id: number; file_name: string; mime_type?: string | null };
  onOpen: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    downloadAdminComplaintAttachment(complaintId, file.id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setUrl("");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [complaintId, file.id]);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={file.file_name}
      className="flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-[#F8FAFC] text-[#1B4F8A]"
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <Paperclip className="h-4 w-4" />}
    </button>
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
  showAssignment,
  allowStatusChanges,
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
  showAssignment: boolean;
  allowStatusChanges: boolean;
  onStatus: (next: ComplaintStatus) => void;
  onOpenFile: (fileId: number, name: string) => void;
}) {
  const staffChoices = [
    ...(detail?.assigned_to_user_id && detail.type !== "technical"
      ? [{ value: "remove", label: "Remove assignment" }]
      : []),
    ...(detail?.assignees ?? []).map((person) => ({
      value: String(person.id),
      label: person.matched ? `${person.label || person.name} · Suggested` : (person.label || person.name),
    })),
  ];
  const [pane, setPane] = useState<"details" | "history">("details");
  const detailKey = detail?.id ?? 0;
  const [seenDetail, setSeenDetail] = useState(detailKey);
  if (detailKey !== seenDetail) {
    setSeenDetail(detailKey);
    setPane("details");
  }
  const facts = detail
    ? [
        { label: "Resident", value: detail.reporter_name, icon: UserRound },
        { label: "Unit", value: detail.unit_number ?? "—", icon: Hash },
        { label: "Category", value: detail.category_label, icon: Tag },
        { label: "Priority", value: detail.priority.charAt(0).toUpperCase() + detail.priority.slice(1), icon: Flag },
        { label: "Assigned Staff", value: assignedStaffName(detail) || "Not assigned", icon: UserCheck },
        { label: "Submitted", value: formatSubmitted(detail.created_at) || formatDate(detail.created_at), icon: Calendar },
      ]
    : [];
  const images = (detail?.attachments ?? []).filter((file) => isImageAttachment(file));
  const documents = (detail?.attachments ?? []).filter((file) => !isImageAttachment(file));
  const events = detail?.events ?? [];
  const unread = detail?.unread_count ?? 0;

  return (
    <div className="nl-notice-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="nl-notice-modal"
        style={{ maxWidth: "68rem", background: "#fff", boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="complaint-view-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#E8F1FA] px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide text-[#1B4F8A]">
                {detail?.reference ?? "Complaint"}
              </span>
              {detail ? (
                <>
                  <AdminBadge tone={complaintTone(detail)}>{detail.status_label}</AdminBadge>
                  <AdminBadge tone={PRIORITY_TONE[detail.priority]}>
                    {detail.priority.charAt(0).toUpperCase() + detail.priority.slice(1)}
                  </AdminBadge>
                  <AdminBadge tone="slate">{detail.category_label}</AdminBadge>
                </>
              ) : null}
            </div>
            <h3 id="complaint-view-title" className="mt-2.5 break-words text-[1.35rem] font-semibold leading-tight tracking-[-0.02em] text-[#0A2A43]">
              {detail?.title ?? (error ? "Could not open complaint" : "Loading complaint")}
            </h3>
            {detail ? (
              <p className="mt-1.5 text-[13px] text-slate-500">
                Submitted by {detail.reporter_name}
                {detail.unit_number ? ` · Unit ${detail.unit_number}` : ""}
                {formatSubmitted(detail.created_at) ? ` · ${formatSubmitted(detail.created_at)}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {detail ? (
              <button
                type="button"
                onClick={onOpenChat}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[13px] font-semibold text-[#0A2A43] transition hover:border-[#1B4F8A]/30 hover:bg-[#F8FAFC]"
              >
                <MessageSquare className="h-4 w-4 text-[#1B4F8A]" />
                Chat
                {unread > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1B4F8A] px-1.5 text-[11px] font-bold leading-none text-white">{unread}</span>
                ) : null}
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="nl-notice-modal-close" aria-label="Close">
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        </header>

        <div className="nl-notice-modal-body">
          {error ? <PageError message={error} onRetry={onRetry} /> : null}
          {!detail && !error ? <p className="py-10 text-center text-sm text-slate-500">Loading complaint…</p> : null}
          {detail ? (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,19rem)]">
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-4 inline-flex rounded-xl bg-[#F4F7FB] p-1">
                  {(["details", "history"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPane(item)}
                      className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${pane === item ? "bg-white text-[#1B4F8A]" : "text-slate-500 hover:text-[#0A2A43]"}`}
                    >
                      {item === "details" ? "Details" : "History"}
                    </button>
                  ))}
                </div>
                {pane === "details" ? (
                  <div className="space-y-4">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {facts.map((fact) => {
                        const Icon = fact.icon;
                        return (
                          <div key={fact.label} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-100 bg-[#F8FAFC] px-2.5 py-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#1B4F8A]">
                              <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[10px] font-medium text-slate-400">{fact.label}</span>
                              <span className="mt-0.5 block break-words text-[13px] font-semibold leading-5 text-[#0A2A43]">{fact.value}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {detail.description ? (
                      <section>
                        <p className="text-[12px] font-semibold text-slate-500">Description</p>
                        <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-6 text-slate-700">{detail.description}</p>
                      </section>
                    ) : null}
                    <section>
                      <p className="text-[12px] font-semibold text-slate-500">Attachments ({(detail.attachments ?? []).length})</p>
                      {(detail.attachments ?? []).length === 0 ? <p className="mt-2 text-sm text-slate-400">No attachments.</p> : null}
                      {images.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {images.map((file) => (
                            <AttachmentThumb key={file.id} complaintId={detail.id} file={file} onOpen={() => onOpenFile(file.id, file.file_name)} />
                          ))}
                        </div>
                      ) : null}
                      {documents.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {documents.map((file) => (
                            <button
                              key={file.id}
                              type="button"
                              className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-[#1B4F8A] hover:bg-[#F8FAFC]"
                              onClick={() => onOpenFile(file.id, file.file_name)}
                            >
                              <Paperclip className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{file.file_name}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  </div>
                ) : (
                  <ol className="max-h-[28rem] space-y-3 overflow-y-auto overscroll-contain pr-1">
                    {events.length === 0 ? <li className="text-sm text-slate-400">No history yet.</li> : null}
                    {events.map((event) => (
                      <li key={event.id} className="rounded-xl border border-slate-100 bg-[#F8FAFC] px-3 py-2.5">
                        <p className="text-[13px] font-semibold text-[#0A2A43]">{activityTitle(event.action, event.to_status)}</p>
                        {event.from_status && event.to_status && event.from_status !== event.to_status ? (
                          <p className="mt-0.5 text-[12px] text-slate-500">{ACTIVITY_STATUS[event.from_status] ?? event.from_status} → {ACTIVITY_STATUS[event.to_status] ?? event.to_status}</p>
                        ) : null}
                        {event.note ? <p className="mt-0.5 text-[13px] leading-5 text-slate-600">{event.note}</p> : null}
                        {event.actor_name ? <p className="mt-0.5 text-[12px] text-slate-500">{event.actor_name}</p> : null}
                        <p className="mt-0.5 text-[11px] text-slate-400">{formatWhen(event.created_at)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <aside className="min-w-0 space-y-3">
                {showAssignment || (allowStatusChanges && (detail.allowed_transitions ?? []).length > 0) ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="nl-notice-view-section-title">Assignment</p>
                  {showAssignment ? (
                    <>
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    {detail.assigned_to_user_id ? "Change assignment" : "Assign staff"}
                  </p>
                  <SearchableSelect
                    id="assignee"
                    className="nl-picker-compact mt-1"
                    searchable
                    disabled={busy || detail.type === "technical" && (detail.assignees ?? []).length === 0}
                    value={detail.assigned_to_user_id ? String(detail.assigned_to_user_id) : ""}
                    valueLabel={detail.assigned_staff_label || detail.assigned_to_name || undefined}
                    placeholder={detail.type === "technical" ? "Choose a system admin" : "Choose staff"}
                    searchPlaceholder="Search name or specialization"
                    emptyMessage={detail.type === "technical" ? "No system admins found." : "No matching staff. Add staff from Staff Management."}
                    options={staffChoices}
                    onChange={(value) => {
                      if (value === "remove") {
                        onAssign(0);
                        return;
                      }
                      const userId = Number(value);
                      if (userId && userId !== detail.assigned_to_user_id) onAssign(userId);
                    }}
                  />
                    </>
                  ) : null}
                  {allowStatusChanges && (detail.allowed_transitions ?? []).length > 0 ? (
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
                  ) : null}
                </div>
                ) : null}

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-[13px] font-semibold text-[#0A2A43]">Activity</p>
                  {events.length === 0 ? <p className="text-sm text-slate-400">No activity yet.</p> : null}
                  <ol className="max-h-[28rem] space-y-0 overflow-y-auto overscroll-contain pr-1">
                    {events.map((event, index) => {
                      const Icon = activityIcon(event.action);
                      const last = index === events.length - 1;
                      return (
                        <li key={event.id} className="flex gap-3">
                          <span className="flex w-7 shrink-0 flex-col items-center">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E8F1FA] text-[#1B4F8A]">
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            {last ? null : <span className="my-1 w-px flex-1 bg-slate-200" />}
                          </span>
                          <span className={`min-w-0 flex-1 ${last ? "" : "pb-4"}`}>
                            <p className="text-[13px] font-semibold leading-5 text-[#0A2A43]">{activityTitle(event.action, event.to_status)}</p>
                            {event.note ? <p className="mt-0.5 break-all text-[12px] leading-5 text-slate-500">{event.note}</p> : null}
                            <p className="mt-0.5 text-[11px] text-slate-400">{formatWhen(event.created_at)}</p>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AssignStaffModal({
  mode,
  complaint,
  options,
  query,
  choice,
  loading,
  error,
  busy,
  onQuery,
  onChoice,
  onClose,
  onConfirm,
}: {
  mode: StaffAssignMode;
  complaint: ComplaintRecord;
  options: NonNullable<ComplaintRecord["assignees"]>;
  query: string;
  choice: string;
  loading: boolean;
  error: string;
  busy: boolean;
  onQuery: (value: string) => void;
  onChoice: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const copy = STAFF_ASSIGN_COPY[mode];
  const currentName = assignedStaffName(complaint);
  const needle = query.trim().toLowerCase();
  const visible = options.filter((person) => {
    if (!needle) return true;
    return `${person.name} ${person.label ?? ""}`.toLowerCase().includes(needle);
  });

  return (
    <div className="nl-notice-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="nl-notice-modal"
        style={{ maxWidth: "28rem" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-staff-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="nl-notice-modal-head">
          <div className="min-w-0 flex-1">
            <p className="nl-notice-modal-eyebrow">{complaint.reference}</p>
            <h3 id="assign-staff-title" className="nl-notice-modal-title mt-1">
              {copy.title}
            </h3>
            <p className="mt-1 truncate text-[13px] text-slate-500">{complaint.title}</p>
            {currentName ? <p className="mt-1 text-[12.5px] font-medium text-[#1B4F8A]">Currently {currentName}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="nl-notice-modal-close" aria-label="Close" disabled={busy}>
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </header>
        <div className="nl-notice-modal-body space-y-3">
          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search name or specialization"
            aria-label="Search staff"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0A2A43] outline-none placeholder:text-slate-400 focus:border-[#1B4F8A]"
          />
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading staff…</p> : null}
            {!loading && visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No matching staff. Add staff from Staff Management.</p>
            ) : null}
            {visible.map((person) => {
              const selected = choice === String(person.id);
              const current = person.id === complaint.assigned_to_user_id;
              return (
                <button
                  key={person.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onChoice(String(person.id))}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left ${
                    selected ? "border-[#1B4F8A] bg-[#E8F1FA]" : "border-slate-200 bg-white hover:border-[#1B4F8A]/30"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#0A2A43]">{person.name}</span>
                    <span className="block truncate text-xs text-slate-500">{person.label || person.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {person.matched ? <AdminBadge tone="blue">Suggested</AdminBadge> : null}
                    {current ? <AdminBadge tone="slate">Current</AdminBadge> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <footer className="nl-notice-modal-foot">
          <button type="button" onClick={onClose} className="nl-btn-ghost" disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="nl-btn-primary"
            disabled={busy || !choice || Number(choice) === complaint.assigned_to_user_id}
          >
            {busy ? "Saving…" : copy.confirmButton}
          </button>
        </footer>
      </div>
    </div>
  );
}
