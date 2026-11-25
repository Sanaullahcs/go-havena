"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { getManagedCommunityId, getUser, SESSION_PATCHED_EVENT } from "@/lib/auth/session";
import {
  Calendar,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  Flag,
  Hash,
  ImageIcon,
  Mail,
  MessageSquare,
  Paperclip,
  Phone,
  RotateCcw,
  ListFilter,
  Tag,
  UserCheck,
  UserRound,
  X,
  ZoomIn,
  ZoomOut,
  Download,
  Plus,
} from "lucide-react";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { ComplaintChatModal } from "@/components/admin/complaint-chat-modal";
import { CreateTechnicalComplaintModal } from "@/components/admin/create-technical-complaint-modal";
import { AdminBadge, DataTable, DtPagination, StatTile } from "@/components/admin/ui";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { isAdminSearchPending } from "@/lib/admin/table-loading";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedDatePicker } from "@/components/ui/themed-date-picker";
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
  fetchMyComplaints,
  isComplaintNotification,
  updateAdminComplaintStatus,
  type ComplaintList,
  type ComplaintRecord,
  type ComplaintStatus,
} from "@/lib/api/complaints";
import { emitNotificationsRefresh } from "@/lib/api/notifications";
import { subscribeForegroundNotification } from "@/lib/notifications/foreground-notification-events";
import { apiError } from "@/lib/api/client";
import {
  CATEGORY_HINTS,
  MAINTENANCE_CATEGORIES,
  TECHNICAL_CATEGORIES,
  TECHNICAL_CATEGORY_HINTS,
} from "@/lib/complaints/meta";

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

type StaffAssignMode = "assign" | "change" | "reassign";

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

const ALL_CATEGORIES_OPTION = ["all", "All categories"] as const;

type CommunityComplaintsTab = "queue" | "my_reports";

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
  if (action === "status_changed" && toStatus === "reopened") return "Complaint reopened";
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
  dateFrom?: string;
  dateTo?: string;
};

const PRIORITY_FILTERS = [
  { value: "all", label: "All" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

function activeFilterCount(value: ComplaintFilterValue) {
  return [
    value.status !== "all",
    value.category !== "all",
    value.priority !== "all",
    Boolean(value.dateFrom),
    Boolean(value.dateTo),
  ].filter(Boolean).length;
}

function ComplaintFiltersButton({
  value,
  statuses,
  categories,
  categoryHints,
  showDates = false,
  onApply,
}: {
  value: ComplaintFilterValue;
  statuses: readonly (readonly [string, string])[];
  categories: readonly (readonly [string, string])[];
  categoryHints: Record<string, string>;
  showDates?: boolean;
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
    maxHeight: showDates ? 560 : 460,
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
        className={[
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 text-[12.5px] font-semibold transition",
          open || count > 0
            ? "border-[#1B4F8A]/30 text-[#1B4F8A] shadow-sm"
            : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50",
        ].join(" ")}
      >
        <ListFilter className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        Filter
        {count > 0 ? (
          <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1B4F8A] px-1 text-[10px] font-bold leading-none text-white">
            {count}
          </span>
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
            <div className="nl-notice-field min-w-0 w-full">
              <label className="nl-notice-label">Category</label>
              <SearchableSelect
                searchable
                value={draft.category}
                searchPlaceholder="Search categories"
                options={categories.map(([value, label]) => ({ value, label, description: categoryHints[value], pinned: value === "all" }))}
                onChange={(category) => setDraft((current) => ({ ...current, category }))}
              />
            </div>
            <ThemedSelect
              label="Priority"
              value={draft.priority}
              options={[...PRIORITY_FILTERS]}
              onChange={(priority) => setDraft((current) => ({ ...current, priority }))}
            />
            {showDates ? (
              <>
                <ThemedDatePicker
                  compact
                  label="From"
                  placeholder="From date"
                  value={draft.dateFrom ?? ""}
                  max={draft.dateTo || undefined}
                  onChange={(dateFrom) => setDraft((current) => ({ ...current, dateFrom }))}
                />
                <ThemedDatePicker
                  compact
                  label="To"
                  placeholder="To date"
                  value={draft.dateTo ?? ""}
                  min={draft.dateFrom || undefined}
                  onChange={(dateTo) => setDraft((current) => ({ ...current, dateTo }))}
                />
              </>
            ) : null}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => apply({ status: "all", category: "all", priority: "all", dateFrom: "", dateTo: "" })}
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

type AttachmentKind = "image" | "pdf" | "file";

function attachmentKind(mime: string, fileName: string): AttachmentKind {
  const type = String(mime || "").toLowerCase();
  const name = String(fileName || "");
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (/\.(png|jpe?g|gif|webp|heic|heif)$/i.test(name)) return "image";
  return "file";
}

function displayAttachmentLabel(fileName: string, kind: AttachmentKind) {
  const raw = String(fileName || "Attachment").trim();
  if (/^reopen-\d+\.(jpe?g|png|webp)$/i.test(raw)) return "Supporting photo (reopen)";
  if (kind === "image" && /^[0-9A-F-]{20,}/i.test(raw)) return "Photo attachment";
  if (kind === "pdf" && (raw.length > 36 || /^[0-9A-F-]{8}-/i.test(raw))) return "PDF document";
  if (raw.length > 40) {
    const dot = raw.lastIndexOf(".");
    if (dot > 0 && dot < raw.length - 2) {
      return `${raw.slice(0, 24)}…${raw.slice(dot)}`;
    }
    return `${raw.slice(0, 28)}…`;
  }
  return raw;
}

function activityIcon(action: string, toStatus?: string | null) {
  if (action === "status_changed" && toStatus === "reopened") return RotateCcw;
  if (action === "attachment") return Paperclip;
  if (action === "created") return FileText;
  if (action === "message" || action === "internal_note") return MessageSquare;
  if (action.includes("assign") || action === "accepted" || action === "declined") return UserRound;
  return CheckCircle2;
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
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);
  const [status, setStatus] = useState("all");
  const [summaryFilter, setSummaryFilter] = useState("all");
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
  const [communityTab, setCommunityTab] = useState<CommunityComplaintsTab>("queue");
  const [createComplaintOpen, setCreateComplaintOpen] = useState(false);

  const categories = audience === "system"
    ? [ALL_CATEGORIES_OPTION, ...TECHNICAL_CATEGORIES]
    : communityTab === "my_reports"
      ? [ALL_CATEGORIES_OPTION, ...TECHNICAL_CATEGORIES]
      : [ALL_CATEGORIES_OPTION, ...MAINTENANCE_CATEGORIES];

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
      const usingMyReports = audience === "community" && communityTab === "my_reports";
      const result = usingMyReports
        ? await fetchMyComplaints({ search: debouncedSearch, status, category, priority, page })
        : await fetchAdminComplaints({ search: debouncedSearch, status, summary: summaryFilter, category, priority, dateFrom, dateTo, page });
      if (usingMyReports) {
        result.data = result.data.filter((row) => row.type === "technical");
      }
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
  }, [audience, communityTab, debouncedSearch, status, summaryFilter, category, priority, dateFrom, dateTo, page, communityId, sessionEpoch, applyList]);

  useEffect(() => {
    if (audience !== "community") return;
    setPage(1);
    setSummaryFilter("all");
    setCategory("all");
  }, [audience, communityTab]);

  useEffect(() => {
    signatureRef.current = "";
    staffRevisionRef.current = "";
    void load();
  }, [load]);

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
    const cancelling = next === "cancelled";
    const confirmed = await confirmAction({
      title: `${STATUS_ACTION[next] ?? "Update"}?`,
      text: `${row.reference} will move to ${next.replaceAll("_", " ")}.`,
      confirmText: cancelling ? "Cancel" : "Update",
      cancelText: cancelling ? "Keep" : "Cancel",
      color: cancelling ? "red" : "blue",
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

  const openReopenAssign = async (row: ComplaintRecord) => {
    let target = row;
    if (!row.previous_assigned_to_user_id) {
      try {
        target = await fetchAdminComplaint(row.id);
      } catch (err) {
        toastError(apiError(err));
        return;
      }
    }
    if (!target.previous_assigned_to_user_id) {
      toastError("No previous staff on record. Use Change Staff to assign someone.");
      return;
    }
    if (target.previous_assignee_available === false) {
      toastError("The previously assigned staff member is no longer available. Use Change Staff.");
      return;
    }
    const name = target.previous_assigned_to_name?.trim() || "the previous staff member";
    const confirmed = await confirmAction({
      title: "Confirm assignment",
      text: `Send a new assignment request to ${name}?`,
      confirmText: "Confirm Assignment",
      cancelText: "Cancel",
      color: "blue",
    });
    if (!confirmed.isConfirmed) return;
    try {
      await saveAssignment(target.id, target.previous_assigned_to_user_id, "Assignment request sent");
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
    const reopenStaffPick =
      assignMode === "change" && assignRow.status === "reopened" && !assignRow.assigned_to_user_id;
    const copy = reopenStaffPick
      ? {
          ...STAFF_ASSIGN_COPY.change,
          confirmTitle: "Assign staff?",
          confirmText: "The selected staff member will receive an assignment request.",
        }
      : STAFF_ASSIGN_COPY[assignMode];
    const confirmed = await confirmAction({
      title: copy.confirmTitle,
      text: copy.confirmText,
      confirmText: reopenStaffPick ? "Confirm Assignment" : copy.confirmButton,
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
      confirmText: "Cancel",
      cancelText: "Keep",
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
    if (workflow === "reopened") {
      return [
        view,
        { label: "Assign", icon: "plus" as const, onClick: () => void openReopenAssign(row) },
        { label: "Change Staff", icon: "edit" as const, onClick: () => void openAssign(row, "change") },
      ];
    }
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

  const openCount = Number(counts.open_queue ?? (Number(counts.submitted ?? 0) + Number(counts.in_review ?? 0) + Number(counts.reopened ?? 0) + Number(counts.waiting_on_resident ?? 0) + Number(counts.not_resolved ?? 0)));
  const progressCount = Number(counts.in_progress ?? 0);
  const resolvedCount = Number(counts.resolved ?? 0);
  const summaryActive = (key: "all" | "open" | "in_progress" | "resolved" | "closed" | "overdue") => (
    key === "open" || key === "overdue"
      ? summaryFilter === key && status === "all"
      : key === "all"
        ? summaryFilter === "all" && status === "all"
        : summaryFilter === "all" && status === key
  );
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
    setSummaryFilter("all");
    setStatus(next.status);
    setCategory(next.category);
    setPriority(next.priority);
    setDateFrom(next.dateFrom ?? "");
    setDateTo(next.dateTo ?? "");
  };
  const chooseSummary = (next: "all" | "open" | "in_progress" | "resolved" | "closed" | "overdue") => {
    setPage(1);
    const selected = next === "open" || next === "overdue"
      ? summaryFilter === next && status === "all"
      : next === "all"
        ? summaryFilter === "all" && status === "all"
        : summaryFilter === "all" && status === next;
    if (next !== "all" && selected) {
      setSummaryFilter("all");
      setStatus("all");
      return;
    }
    if (next === "open" || next === "overdue") {
      setSummaryFilter(next);
      setStatus("all");
      return;
    }
    setSummaryFilter("all");
    setStatus(next);
  };
  const summary = audience === "community" ? (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
      <StatTile label="Total Complaints" value={Number(counts.all ?? 0)} hint="All resident complaints" icon={<ClipboardList />} tone="violet" pressed={summaryActive("all")} onClick={() => chooseSummary("all")} />
      <StatTile label="Open" value={openCount} hint="Awaiting action" icon={<CircleDot />} tone="amber" pressed={summaryActive("open")} onClick={() => chooseSummary("open")} />
      <StatTile label="In Progress" value={progressCount} hint="Being worked on" icon={<Clock />} tone="blue" pressed={summaryActive("in_progress")} onClick={() => chooseSummary("in_progress")} />
      <StatTile label="Resolved" value={resolvedCount} hint="Resolved, not closed" icon={<CheckCircle2 />} tone="green" pressed={summaryActive("resolved")} onClick={() => chooseSummary("resolved")} />
    </div>
  ) : (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label="Total" value={Number(counts.all ?? 0)} hint="All support complaints" icon={<ClipboardList />} tone="violet" />
      <StatTile label="Open" value={Number(counts.submitted ?? 0) + Number(counts.reopened ?? 0)} hint="Submitted and reopened" icon={<CircleDot />} tone="amber" />
      <StatTile label="In Progress" value={progressCount} hint="Being worked on" icon={<Clock />} tone="blue" />
      <StatTile label="Resolved" value={resolvedCount} hint="Marked resolved" icon={<CheckCircle2 />} tone="green" />
    </div>
  );

  return (
    <section className="space-y-6">
      {error ? <PageError message={error} onRetry={() => void load()} /> : null}
      {audience === "community" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="nl-eyebrow">Community</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Complaints</h2>
            <p className="mt-1 text-sm text-slate-500">Manage, track, and resolve resident complaints efficiently.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() => setCreateComplaintOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4F8A] px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              Create Complaint
            </button>
          </div>
        </div>
      ) : null}
      {audience === "community" ? (
        <div className="nl-segment-control max-w-md">
          {(
            [
              ["queue", "Community complaints"],
              ["my_reports", "My technical reports"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setCommunityTab(key);
                setSearchInput("");
                setStatus("all");
              }}
              className={[
                "nl-segment-control-item",
                communityTab === key ? "nl-segment-control-item-active" : "nl-segment-control-item-idle",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {audience === "community" && communityTab === "my_reports" ? (
        <p className="text-sm leading-6 text-slate-500">
          Technical issues you send to System Admin. Resident maintenance stays in the community complaints queue.
        </p>
      ) : null}
      {audience === "system" || communityTab === "queue" ? summary : null}
      <DataTable
        title={
          audience === "system"
            ? "Complaints & Support"
            : communityTab === "my_reports"
              ? "My technical reports"
              : "All Complaints"
        }
        search={searchInput}
        onSearch={(value) => {
          setPage(1);
          setSearchInput(value);
        }}
        searching={isSearchPending}
        searchPlaceholder={communityTab === "my_reports" ? "Search your reports" : "Search complaints"}
        searchClassName="min-w-[12rem] sm:w-[17.5rem]"
        loading={loading}
        toolbar={(
          <ComplaintFiltersButton
            value={{ status, category, priority, dateFrom, dateTo }}
            statuses={statuses}
            categories={categories}
            categoryHints={audience === "system" || communityTab === "my_reports" ? TECHNICAL_CATEGORY_HINTS : CATEGORY_HINTS}
            showDates={audience === "system"}
            onApply={applyFilters}
          />
        )}
        isEmpty={!loading && rows.length === 0}
        empty={
          audience === "community" && communityTab === "my_reports"
            ? "You have not submitted any technical reports yet."
            : "No complaints match your filters."
        }
      >
        <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
              {["Ticket", "Complaint", "Resident", "Unit", "Category", "Priority", "Assigned Staff", "Submitted", "Status", "Actions"].map((label) => (
                <th key={label} className={`sticky top-0 whitespace-nowrap border-b border-slate-100 bg-white px-3 py-2.5 font-medium first:pl-4 last:pr-4 ${label === "Actions" ? "text-right" : ""}`}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => openComplaint(row.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openComplaint(row.id);
                  }
                }}
                className="group cursor-pointer transition-colors hover:bg-[#F1F5F9]"
              >
                <td className="border-b border-slate-100 px-3 py-2.5 pl-4 align-middle">
                  <span className="font-mono text-[12px] font-medium tracking-wide text-[#1B4F8A]">{row.reference}</span>
                </td>
                <td className="border-b border-slate-100 px-3 py-2.5 align-middle">
                  <span className="block max-w-[14rem] truncate text-[13px] font-semibold text-[#0A2A43]">{row.title}</span>
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
                  {row.type === "technical" ? (
                    <span className="inline-flex max-w-[11rem] items-center gap-1.5 text-[13px] text-slate-700">
                      <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{row.support_team ?? "System Admin"}</span>
                    </span>
                  ) : assignedStaffName(row) ? (
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
                <td
                  className="w-24 border-b border-slate-100 px-3 py-2.5 pr-4 text-right align-middle"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <div className="flex justify-end">
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
          showAssignment={
            audience === "system"
            || (audience === "community"
              && detail?.type === "maintenance"
              && ["open", "submitted", "reopened", "requested", "pending", "in_review", "not_resolved"].includes(
                complaintWorkflow(detail),
              )
              && !(detail?.status === "reopened" && !detail.assigned_to_user_id))
          }
          allowStatusChanges={audience === "system"}
          onStatus={(next) => {
            if (detail) void runStatus(detail, next);
          }}
        />
      ) : null}
      {chatOpen && detail ? (
        <ComplaintChatModal
          detail={detail}
          onBack={() => setChatOpen(false)}
          onSynced={(record) => setDetail((current) => (current?.id === record.id ? record : current))}
        />
      ) : null}
      {audience === "community" ? (
        <CreateTechnicalComplaintModal
          open={createComplaintOpen}
          onClose={() => setCreateComplaintOpen(false)}
          onCreated={(record) => {
            setCreateComplaintOpen(false);
            toastSuccess("Technical complaint submitted. System Admin has been notified.");
            setCommunityTab("my_reports");
            setPage(1);
            setSummaryFilter("all");
            setStatus("all");
            openComplaint(record.id);
            emitNotificationsRefresh();
            void load();
          }}
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

function useAttachmentBlob(complaintId: number, fileId: number, hintMime?: string | null) {
  const [blob, setBlob] = useState<{ url: string; mime: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setLoading(true);
    downloadAdminComplaintAttachment(complaintId, fileId)
      .then((data) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(data);
        const mime = String(data.type || hintMime || "").toLowerCase();
        setBlob({ url: objectUrl, mime });
      })
      .catch(() => {
        if (active) setBlob(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [complaintId, fileId, hintMime]);

  return { blob, loading };
}

function triggerAttachmentDownload(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
}

function residentInitials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function AttachmentListItem({
  complaintId,
  file,
  onPreview,
}: {
  complaintId: number;
  file: { id: number; file_name: string; mime_type?: string | null };
  onPreview: (payload: { url: string; name: string; kind: AttachmentKind; fileName: string }) => void;
}) {
  const { blob, loading } = useAttachmentBlob(complaintId, file.id, file.mime_type);
  const kind = blob ? attachmentKind(blob.mime, file.file_name) : attachmentKind(file.mime_type || "", file.file_name);
  const label = displayAttachmentLabel(file.file_name, kind);

  if (loading) {
    return (
      <div className="flex h-[4.75rem] w-full animate-pulse items-center justify-center rounded-xl bg-[#F4F7FB] ring-1 ring-slate-200/80">
        <ImageIcon className="h-5 w-5 text-slate-300" />
      </div>
    );
  }

  if (!blob) {
    return (
      <motionlessFileRow
        label={label}
        title={file.file_name}
        onDownload={null}
      />
    );
  }

  if (kind === "image") {
    return (
      <button
        type="button"
        onClick={() => onPreview({ url: blob.url, name: label, kind, fileName: file.file_name })}
        title={file.file_name}
        className="group relative block w-full overflow-hidden rounded-xl bg-[rgba(10,42,67,0.03)] text-left ring-1 ring-slate-200/90 transition duration-200 hover:ring-[#1B4F8A]/35"
      >
        <div className="aspect-[16/11] max-h-32 w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={blob.url}
            alt={label}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        </div>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0A2A43]/70 via-[#0A2A43]/10 to-transparent opacity-90 transition group-hover:opacity-100" />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2.5">
          <span className="inline-flex max-w-[85%] items-center gap-1.5 truncate rounded-full bg-white/95 px-2 py-1 text-[11px] font-semibold text-[#0A2A43] shadow-sm backdrop-blur-sm">
            <Eye className="h-3 w-3 shrink-0 text-[#1B4F8A]" />
            <span className="truncate">{label}</span>
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="flex w-full items-center gap-2 rounded-xl bg-[#F6F9FC] px-2.5 py-2 ring-1 ring-slate-100">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#1B4F8A] ring-1 ring-slate-200/80">
        {kind === "pdf" ? <FileText className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-[#0A2A43]" title={file.file_name}>
          {label}
        </p>
        <p className="text-[10px] font-medium text-slate-400">{kind === "pdf" ? "PDF" : "File"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onPreview({ url: blob.url, name: label, kind, fileName: file.file_name })}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#1B4F8A] transition hover:bg-[#EEF4FB]"
          aria-label={`Preview ${label}`}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => triggerAttachmentDownload(blob.url, file.file_name)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#1B4F8A] transition hover:bg-[#EEF4FB]"
          aria-label={`Download ${label}`}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function motionlessFileRow({
  label,
  title,
  onDownload,
}: {
  label: string;
  title: string;
  onDownload: (() => void) | null;
}) {
  return (
    <div className="flex w-full items-center gap-2 rounded-xl bg-[#F6F9FC] px-2.5 py-2 ring-1 ring-slate-100 opacity-70">
      <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-500" title={title}>
        {label}
      </span>
      {onDownload ? (
        <button type="button" onClick={onDownload} className="text-[11px] font-semibold text-[#1B4F8A]">
          Retry
        </button>
      ) : null}
    </div>
  );
}

function AttachmentPreviewModal({
  open,
  url,
  reference,
  title,
  kind,
  fileName,
  onClose,
}: {
  open: boolean;
  url: string;
  reference: string;
  title: string;
  kind: AttachmentKind;
  fileName: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (!open) setZoom(100);
  }, [open, url]);

  if (!open || !url) return null;

  const isImage = kind === "image";
  const isPdf = kind === "pdf";
  const HeaderIcon = isPdf ? FileText : ImageIcon;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 sm:p-8"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)]"
        role="dialog"
        aria-modal="true"
        aria-label="Attachment Preview"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8F1FA] text-[#1B4F8A]">
            <HeaderIcon className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="text-[15px] font-semibold text-[#0A2A43]">Attachment Preview</h4>
            <p className="mt-0.5 truncate text-[12px] text-slate-500">
              {reference}
              {title ? ` · ${title}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="nl-notice-modal-close"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#F4F7FB] p-4 sm:p-6">
          {isImage ? (
            <div
              className="origin-center transition-transform duration-150"
              style={{ transform: `scale(${zoom / 100})` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={title || "Attachment"}
                className="max-h-[58vh] max-w-full rounded-xl object-contain shadow-sm"
                draggable={false}
              />
            </div>
          ) : null}
          {isPdf ? (
            <iframe
              title={title || "PDF preview"}
              src={url}
              className="h-[58vh] w-full max-w-full rounded-xl border border-slate-200 bg-white shadow-sm"
            />
          ) : null}
          {!isImage && !isPdf ? (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <Paperclip className="h-10 w-10 text-[#1B4F8A]/50" />
              <p className="text-[13px] font-medium text-slate-600">Preview is not available for this file type.</p>
              <button
                type="button"
                onClick={() => triggerAttachmentDownload(url, fileName)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1B4F8A] px-4 py-2 text-[13px] font-semibold text-white"
              >
                <Download className="h-4 w-4" />
                Download file
              </button>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-3">
          {isImage ? (
            <>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(50, value - 25))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-[#1B4F8A] transition hover:bg-[#F8FAFC]"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-[3.5rem] text-center text-[13px] font-semibold tabular-nums text-[#0A2A43]">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(200, value + 25))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-[#1B4F8A] transition hover:bg-[#F8FAFC]"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => triggerAttachmentDownload(url, fileName)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-[#1B4F8A] transition hover:bg-[#F8FAFC]"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function ActivityTimeline({ events }: { events: NonNullable<ComplaintRecord["events"]> }) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-[#F8FAFC] px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-500">No activity yet</p>
        <p className="mt-1 text-[12px] text-slate-400">Updates will appear here as the complaint moves forward.</p>
      </div>
    );
  }

  return (
    <ol className="space-y-0">
      {events.map((event, index) => {
        const isReopen = event.action === "status_changed" && event.to_status === "reopened";
        const Icon = activityIcon(event.action, event.to_status);
        const last = index === events.length - 1;
        const detail =
          event.action === "attachment" && event.note
            ? displayAttachmentLabel(event.note, attachmentKind("", event.note))
            : event.note
          || (event.from_status && event.to_status && event.from_status !== event.to_status
            ? `${ACTIVITY_STATUS[event.from_status] ?? event.from_status} → ${ACTIVITY_STATUS[event.to_status] ?? event.to_status}`
            : null);
        return (
          <li key={event.id} className="flex gap-2.5">
            <span className="flex w-7 shrink-0 flex-col items-center">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ring-1 ${isReopen ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-[#E8F1FA] text-[#1B4F8A] ring-[#C9DBEE]"}`}>
                <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
              {last ? null : <span className="my-1 w-px flex-1 bg-[#D7E4F2]" />}
            </span>
            <span className={`min-w-0 flex-1 ${last ? "pb-0.5" : "pb-3.5"}`}>
              <p className="text-[12px] font-semibold leading-4 tracking-[-0.01em] text-[#0A2A43]">
                {activityTitle(event.action, event.to_status)}
              </p>
              {event.actor_name ? (
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">By {event.actor_name}</p>
              ) : null}
              {detail ? (
                <p className={`mt-0.5 break-words text-[11px] leading-4 ${isReopen ? "font-medium text-violet-800" : "text-slate-500"}`}>
                  {isReopen && event.note ? `Reason: ${event.note}` : detail}
                </p>
              ) : null}
              <p className="mt-1 text-[10px] font-medium tabular-nums text-slate-400">
                {formatWhen(event.created_at)}
              </p>
            </span>
          </li>
        );
      })}
    </ol>
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
  const [preview, setPreview] = useState<{
    url: string;
    name: string;
    kind: AttachmentKind;
    fileName: string;
  } | null>(null);
  const detailKey = detail?.id ?? 0;
  const [seenDetail, setSeenDetail] = useState(detailKey);
  if (detailKey !== seenDetail) {
    setSeenDetail(detailKey);
    setPane("details");
    setPreview(null);
  }

  const facts = detail
    ? [
        { label: "Unit", value: detail.unit_number ?? "—", icon: Hash },
        { label: "Category", value: detail.category_label, icon: Tag },
        {
          label: "Priority",
          value: detail.priority.charAt(0).toUpperCase() + detail.priority.slice(1),
          icon: Flag,
          badge: true as const,
        },
        { label: "Assigned Staff", value: assignedStaffName(detail) || "Not assigned", icon: UserCheck },
        {
          label: "Submitted",
          value: formatSubmitted(detail.created_at) || formatDate(detail.created_at),
          icon: Calendar,
        },
      ]
    : [];
  const attachments = detail?.attachments ?? [];
  const events = detail?.events ?? [];
  const unread = detail?.unread_count ?? 0;
  const phone = detail?.reporter_phone?.trim() || "";
  const email = detail?.reporter_email?.trim() || "";
  const attachmentCount = (detail?.attachments ?? []).length;

  const cardClass =
    "min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.4)]";

  return (
    <div className="nl-notice-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="nl-notice-modal overflow-hidden"
        style={{
          maxWidth: "68rem",
          background:
            "radial-gradient(120% 90% at 0% 0%, rgba(27,79,138,0.07) 0%, transparent 42%), #ffffff",
          boxShadow: "0 24px 60px -28px rgba(15, 23, 42, 0.4)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="complaint-view-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="relative border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="relative flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-[#1B4F8A]/10 px-2 py-0.5 font-mono text-[11px] font-bold tracking-[0.04em] text-[#1B4F8A] ring-1 ring-[#1B4F8A]/10">
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
              <h3
                id="complaint-view-title"
                className="mt-1.5 break-words text-[1.25rem] font-bold leading-tight tracking-[-0.02em] text-[#0A2A43]"
              >
                {detail?.title ?? (error ? "Could not open complaint" : "Loading complaint")}
              </h3>
              {detail ? (
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-slate-500">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                    <UserRound className="h-3 w-3 text-[#1B4F8A]/70" />
                    {detail.reporter_name}
                  </span>
                  {detail.unit_number ? (
                    <>
                      <span className="text-slate-300">·</span>
                      <span>Unit {detail.unit_number}</span>
                    </>
                  ) : null}
                  {formatSubmitted(detail.created_at) ? (
                    <>
                      <span className="text-slate-300">·</span>
                      <span>{formatSubmitted(detail.created_at)}</span>
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
            <div className="relative flex shrink-0 items-center gap-1.5">
              {detail ? (
                <button
                  type="button"
                  onClick={onOpenChat}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1B4F8A] px-3.5 text-[13px] font-semibold text-white transition hover:bg-[#163A66]"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Chat
                  {unread > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-[11px] font-bold leading-none">
                      {unread}
                    </span>
                  ) : null}
                </button>
              ) : null}
              <button type="button" onClick={onClose} className="nl-notice-modal-close" aria-label="Close">
                <X className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </header>

        <div
          className="nl-notice-modal-body"
          style={{
            background: "linear-gradient(180deg, #F5F8FC 0%, #F8FAFC 100%)",
            padding: "0.75rem 1rem 1rem",
          }}
        >
          {error ? <PageError message={error} onRetry={onRetry} /> : null}
          {!detail && !error ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading complaint…</p>
          ) : null}
          {detail ? (
            <div className="space-y-3">
              <div className="inline-flex rounded-full bg-white p-0.5 ring-1 ring-slate-200/80">
                {(["details", "history"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPane(item)}
                    className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition ${
                      pane === item
                        ? "bg-[#1B4F8A] text-white"
                        : "text-slate-500 hover:text-[#0A2A43]"
                    }`}
                  >
                    {item === "details" ? "Details" : "History"}
                  </button>
                ))}
              </div>

              {detail.status === "reopened" && (detail.reopen_reason || detail.reopened_at) ? (
                <section className="rounded-2xl bg-violet-50 px-3.5 py-3 ring-1 ring-violet-200">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-violet-700 ring-1 ring-violet-200">
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold tracking-[-0.01em] text-violet-950">
                        Reopened by {detail.reopened_by_name || detail.reporter_name || "resident"}
                      </p>
                      {detail.reopen_reason ? (
                        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-violet-900">
                          {detail.reopen_reason}
                        </p>
                      ) : null}
                      {detail.reopened_at ? (
                        <p className="mt-1 text-[11px] font-medium tabular-nums text-violet-700/80">
                          {formatWhen(detail.reopened_at)}
                        </p>
                      ) : null}
                      {!detail.assigned_to_user_id ? (
                        <p className="mt-1.5 text-[11px] font-semibold text-violet-800">
                          Assign the same or a new staff member to continue.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}

              {pane === "details" ? (
                <div className="grid items-start gap-3 xl:grid-cols-[1.05fr_1fr_0.92fr]">
                  <section className={cardClass}>
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="h-4 w-1 rounded-full bg-[#1B4F8A]" aria-hidden />
                      <p className="text-[12px] font-bold tracking-[-0.01em] text-[#0A2A43]">Complaint details</p>
                    </div>
                    <ul className="space-y-1.5">
                      {facts.map((fact) => {
                        const Icon = fact.icon;
                        return (
                          <li
                            key={fact.label}
                            className="flex items-center gap-2.5 rounded-xl bg-[#F6F9FC] px-2.5 py-1.5 ring-1 ring-slate-100"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#1B4F8A] ring-1 ring-slate-100">
                              <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                                {fact.label}
                              </span>
                              {"badge" in fact && fact.badge ? (
                                <span className="mt-0.5 inline-flex">
                                  <AdminBadge tone={PRIORITY_TONE[detail.priority]}>{fact.value}</AdminBadge>
                                </span>
                              ) : (
                                <span className="block break-words text-[13px] font-semibold leading-5 text-[#0A2A43]">
                                  {fact.value}
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="mt-2.5 rounded-xl bg-[#F6F9FC] p-2.5 ring-1 ring-slate-100">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#1B4F8A] ring-1 ring-slate-100">
                          <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                            Description
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-5 text-slate-700">
                            {detail.description?.trim() || "No description provided."}
                          </p>
                        </div>
                      </div>
                    </div>

                    {showAssignment || (allowStatusChanges && (detail.allowed_transitions ?? []).length > 0) ? (
                      <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                        {showAssignment ? (
                          <>
                            <p className="text-[11px] font-medium text-slate-400">
                              {detail.assigned_to_user_id ? "Change assignment" : "Assign staff"}
                            </p>
                            <SearchableSelect
                              id="assignee"
                              className="nl-picker-compact mt-1"
                              searchable
                              disabled={busy || (detail.type === "technical" && (detail.assignees ?? []).length === 0)}
                              value={detail.assigned_to_user_id ? String(detail.assigned_to_user_id) : ""}
                              valueLabel={detail.assigned_staff_label || detail.assigned_to_name || undefined}
                              placeholder={detail.type === "technical" ? "Choose a system admin" : "Choose staff"}
                              searchPlaceholder="Search name or specialization"
                              emptyMessage={
                                detail.type === "technical"
                                  ? "No system admins found."
                                  : "No matching staff. Add staff from Staff Management."
                              }
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
                          <div className={`${showAssignment ? "mt-2" : ""} flex flex-wrap gap-1.5`}>
                            {(detail.allowed_transitions ?? []).map((next) => (
                              <button
                                key={next}
                                type="button"
                                disabled={busy}
                                onClick={() => onStatus(next)}
                                className={`rounded-full border px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${
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
                  </section>

                  <div className="flex min-w-0 flex-col gap-3">
                    <section className={cardClass}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="h-4 w-1 rounded-full bg-[#1B4F8A]" aria-hidden />
                        <p className="text-[12px] font-bold tracking-[-0.01em] text-[#0A2A43]">Resident contact</p>
                      </div>
                      <div className="rounded-xl bg-[#F6F9FC] p-2.5 ring-1 ring-slate-100">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1B4F8A] to-[#163A66] text-[11px] font-bold tracking-wide text-white">
                              {residentInitials(detail.reporter_name)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-bold tracking-[-0.01em] text-[#0A2A43]">
                                {detail.reporter_name}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                {phone || "No phone on file"}
                              </p>
                              <p className="truncate text-[11px] text-slate-500">
                                {email || "No email on file"}
                              </p>
                            </div>
                          </div>
                          {(phone || email) ? (
                            <div className="flex shrink-0 flex-col gap-1">
                              {phone ? (
                                <a
                                  href={`tel:${phone}`}
                                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#1B4F8A] ring-1 ring-slate-200 transition hover:bg-[#EEF4FB]"
                                >
                                  <Phone className="h-3 w-3" />
                                  Call
                                </a>
                              ) : null}
                              {email ? (
                                <a
                                  href={`mailto:${email}`}
                                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#1B4F8A] ring-1 ring-slate-200 transition hover:bg-[#EEF4FB]"
                                >
                                  <Mail className="h-3 w-3" />
                                  Email
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </section>

                    <section className={cardClass}>
                      <div className="mb-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="h-4 w-1 rounded-full bg-[#1B4F8A]" aria-hidden />
                          <p className="text-[12px] font-bold tracking-[-0.01em] text-[#0A2A43]">
                            Attachment{attachmentCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span className="rounded-full bg-[#E8F1FA] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#1B4F8A]">
                          {attachmentCount}
                        </span>
                      </div>
                      {attachmentCount === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-[#F8FAFC] px-3 py-6 text-center">
                          <ImageIcon className="mx-auto h-6 w-6 text-slate-300" />
                          <p className="mt-1.5 text-[12px] font-medium text-slate-500">No attachments</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {attachments.map((file) => (
                            <AttachmentListItem
                              key={file.id}
                              complaintId={detail.id}
                              file={file}
                              onPreview={(payload) => setPreview(payload)}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  </div>

                  <aside className={cardClass}>
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="h-4 w-1 rounded-full bg-[#1B4F8A]" aria-hidden />
                      <p className="text-[12px] font-bold tracking-[-0.01em] text-[#0A2A43]">Activity</p>
                    </div>
                    <div className="max-h-[28rem] overflow-y-auto overscroll-contain pr-0.5">
                      <ActivityTimeline events={events} />
                    </div>
                  </aside>
                </div>
              ) : (
                <section className={cardClass}>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="h-4 w-1 rounded-full bg-[#1B4F8A]" aria-hidden />
                    <p className="text-[12px] font-bold tracking-[-0.01em] text-[#0A2A43]">History</p>
                  </div>
                  <div className="max-h-[28rem] overflow-y-auto overscroll-contain pr-0.5">
                    <ActivityTimeline events={events} />
                  </div>
                </section>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <AttachmentPreviewModal
        open={Boolean(preview)}
        url={preview?.url ?? ""}
        reference={detail?.reference ?? ""}
        title={preview?.name ?? detail?.title ?? ""}
        kind={preview?.kind ?? "file"}
        fileName={preview?.fileName ?? ""}
        onClose={() => setPreview(null)}
      />
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
