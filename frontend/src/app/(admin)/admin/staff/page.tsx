"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ListFilter, Plus, Wrench, X } from "lucide-react";
import { AdminActionsMenu, type AdminMenuAction } from "@/components/admin/admin-actions-menu";
import { StaffFormModal } from "@/components/admin/staff-form-modal";
import { AdminBadge, DataTable, StatTile } from "@/components/admin/ui";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";
import { ThemedSelect } from "@/components/ui/themed-select";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  STAFF_SKILLS,
  cancelStaffInvitation,
  fetchStaff,
  fetchStaffMember,
  removeStaffMember,
  resendStaffInvite,
  STAFF_SYNC_MS,
  updateStaff,
  type StaffMember,
} from "@/lib/api/staff";
import { subscribeForegroundNotification } from "@/lib/notifications/foreground-notification-events";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { isAdminSearchPending } from "@/lib/admin/table-loading";

type StaffFilterValue = {
  specialization: string;
  status: string;
  availability: string;
};

const STAFF_STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

const STAFF_AVAILABILITY_FILTERS = [
  { value: "all", label: "Any availability" },
  { value: "available", label: "Available" },
  { value: "unavailable", label: "Unavailable" },
] as const;

function activeStaffFilterCount(value: StaffFilterValue) {
  return [value.specialization !== "all", value.status !== "all", value.availability !== "all"].filter(Boolean).length;
}

const SKILL_LABELS = Object.fromEntries(STAFF_SKILLS) as Record<string, string>;

function staffSkillLabels(row: StaffMember): string[] {
  const fromKeys = (row.specializations ?? [])
    .map((key) => SKILL_LABELS[key] ?? key)
    .filter(Boolean);
  if (fromKeys.length > 0) return fromKeys;
  if (!row.specialization_label?.trim()) return [];
  return row.specialization_label.split(",").map((part) => part.trim()).filter(Boolean);
}

function StaffSpecializationCell({ row }: { row: StaffMember }) {
  const skills = staffSkillLabels(row);
  const isMulti = (row.specializations?.length ?? 0) > 1 || skills.length > 1;

  if (!isMulti) {
    return <span className="text-slate-700">{row.specialization_label}</span>;
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center rounded-md border border-[#B8D4F0] bg-[#E8F1FA] px-2 py-0.5 text-[12px] font-semibold leading-tight text-[#1B4F8A]">
        Multi-Skill
      </span>
      <span className="group/skilltip relative inline-flex shrink-0">
        <span
          tabIndex={0}
          className="inline-flex h-[18px] w-[18px] cursor-default items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold leading-none text-slate-500"
          aria-label="View all specializations"
        >
          i
        </span>
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-[60] hidden w-max max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-[#0A2A43] px-3 py-2 text-left text-[12px] font-medium leading-snug text-white shadow-[0_8px_24px_rgba(10,42,67,0.28)] group-hover/skilltip:block group-focus-within/skilltip:block"
        >
          {skills.join(", ")}
        </span>
      </span>
    </div>
  );
}

function StaffFiltersButton({
  value,
  onApply,
}: {
  value: StaffFilterValue;
  onApply: (next: StaffFilterValue) => void;
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
  const count = activeStaffFilterCount(value);
  const valueRef = useRef(value);
  valueRef.current = value;
  const specializationOptions = [{ value: "all", label: "All specializations" }, ...STAFF_SKILLS.map(([skillValue, label]) => ({ value: skillValue, label }))];

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

  const apply = (next: StaffFilterValue) => {
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
          aria-label="Staff filters"
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
              label="Specialization"
              value={draft.specialization}
              options={specializationOptions}
              onChange={(specialization) => setDraft((current) => ({ ...current, specialization }))}
            />
            <ThemedSelect
              label="Status"
              value={draft.status}
              options={[...STAFF_STATUS_FILTERS]}
              onChange={(status) => setDraft((current) => ({ ...current, status }))}
            />
            <ThemedSelect
              label="Availability"
              value={draft.availability}
              options={[...STAFF_AVAILABILITY_FILTERS]}
              onChange={(availability) => setDraft((current) => ({ ...current, availability }))}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => apply({ specialization: "all", status: "all", availability: "all" })}
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

function invitationAccepted(row: StaffMember) {
  return Boolean(row.activated_at) || row.invitation === "accepted";
}

function staffActions(row: StaffMember, handlers: {
  onDetails: (row: StaffMember) => void;
  onTasks: (row: StaffMember) => void;
  onEdit: (row: StaffMember) => void;
  onStatus: (row: StaffMember) => void;
  onResend: (row: StaffMember) => void;
  onCancel: (row: StaffMember) => void;
  onRemove: (row: StaffMember) => void;
}): AdminMenuAction[] {
  const details: AdminMenuAction = { label: "View Details", icon: "view", onClick: () => handlers.onDetails(row) };
  const tasks: AdminMenuAction = { label: "View Tasks", icon: "view", onClick: () => handlers.onTasks(row) };
  const edit: AdminMenuAction = { label: "Edit Staff", icon: "edit", onClick: () => handlers.onEdit(row) };
  const resend: AdminMenuAction = { label: "Resend Invitation", icon: "plus", onClick: () => handlers.onResend(row) };
  const cancel: AdminMenuAction = { label: "Cancel Invitation", icon: "ban", tone: "danger", onClick: () => handlers.onCancel(row) };
  const remove: AdminMenuAction = { label: "Remove Staff", icon: "delete", tone: "danger", onClick: () => handlers.onRemove(row) };

  if (!invitationAccepted(row)) {
    return row.invitation === "expired"
      ? [details, edit, resend]
      : [details, edit, resend, cancel];
  }

  const status: AdminMenuAction = row.status === "inactive"
    ? { label: "Activate", icon: "check", tone: "success", onClick: () => handlers.onStatus(row) }
    : { label: "Deactivate", icon: "ban", tone: "warning", onClick: () => handlers.onStatus(row) };

  return [details, tasks, edit, status, remove];
}

export default function StaffPage() {
  const [rows, setRows] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);
  const [skill, setSkill] = useState("all");
  const [status, setStatus] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [viewing, setViewing] = useState<StaffMember | null>(null);
  const [details, setDetails] = useState<StaffMember | null>(null);
  const [open, setOpen] = useState(false);
  const loadRequest = useRef(0);
  const signatureRef = useRef("");

  const load = useCallback(async (silent = false) => {
    const requestId = ++loadRequest.current;
    if (!silent) setLoading(true);
    try {
      const next = await fetchStaff({ search: debouncedSearch, specialization: skill, status, availability });
      if (requestId !== loadRequest.current) return;
      const signature = next
        .map((row) => [row.id, row.invitation, row.status, row.availability, row.open_complaints, row.delivery_error ?? "", row.name, row.specialization_label].join(":"))
        .join("|");
      if (silent && signature === signatureRef.current) return;
      signatureRef.current = signature;
      setRows(next);
    } catch (err) {
      if (!silent && requestId === loadRequest.current) toastError(apiError(err));
    } finally {
      if (!silent && requestId === loadRequest.current) setLoading(false);
    }
  }, [debouncedSearch, skill, status, availability]);

  useEffect(() => {
    signatureRef.current = "";
    void load(false);
  }, [load]);

  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      void load(true);
    };
    const timer = window.setInterval(sync, STAFF_SYNC_MS);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    const unsubscribe = subscribeForegroundNotification((payload) => {
      const link = (payload.link ?? "").toLowerCase();
      const title = (payload.title ?? "").toLowerCase();
      if (link.includes("/admin/staff") || title.includes("staff")) void load(true);
    });
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      unsubscribe();
    };
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (row: StaffMember) => {
    setEditing(row);
    setOpen(true);
  };

  const toggleStatus = async (row: StaffMember) => {
    const next = row.status === "active" ? "inactive" : "active";
    const confirmed = await confirmAction({
      title: next === "inactive" ? "Deactivate this staff member?" : "Activate Staff Member?",
      text: next === "inactive"
        ? "Open tasks will be unassigned and they will not receive new service requests. Completed task history stays."
        : "Are you sure you want to activate this staff member? Once activated, they can receive new service request assignments.",
      confirmText: next === "inactive" ? "Deactivate" : "Activate",
      color: next === "inactive" ? "amber" : "blue",
    });
    if (!confirmed.isConfirmed) return;
    try {
      await updateStaff(row.id, { status: next });
      toastSuccess(next === "inactive" ? "Staff member deactivated" : "Staff member activated");
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const showDetails = (row: StaffMember) => {
    void fetchStaffMember(row.id).then(setDetails).catch((err) => toastError(apiError(err)));
  };

  const showTasks = (row: StaffMember) => {
    void fetchStaffMember(row.id).then(setViewing).catch((err) => toastError(apiError(err)));
  };

  const resendInvite = async (row: StaffMember) => {
    try {
      const result = await resendStaffInvite(row.id);
      if (result.member.delivery_error) toastError(result.message);
      else toastSuccess(result.message || "Invitation sent");
      await load();
    } catch (err) {
      toastError(apiError(err));
      await load();
    }
  };

  const cancelInvite = async (row: StaffMember) => {
    const confirmed = await confirmAction({
      title: "Cancel this invitation?",
      text: "This pending invitation will be withdrawn. Their account stays, and they will not be able to accept it.",
      confirmText: "Cancel Invitation",
      color: "red",
    });
    if (!confirmed.isConfirmed) return;
    try {
      await cancelStaffInvitation(row.id);
      toastSuccess("Invitation cancelled");
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const removeMember = async (row: StaffMember) => {
    if (row.open_complaints > 0) {
      toastError(row.open_complaints === 1
        ? "Reassign the open task before removing this staff member."
        : `Reassign the ${row.open_complaints} open tasks before removing this staff member.`);
      return;
    }
    const confirmed = await confirmAction({
      title: "Remove this staff member?",
      text: "They will be removed from this community. Completed task history stays on service requests.",
      confirmText: "Remove Staff",
      color: "red",
    });
    if (!confirmed.isConfirmed) return;
    try {
      await removeStaffMember(row.id);
      toastSuccess("Staff member removed");
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const active = rows.filter((row) => row.status === "active").length;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Community</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Staff</h2>
          <p className="mt-1 text-sm text-slate-500">Manage community staff, assignments, and availability.</p>
        </div>
        <button type="button" className="nl-btn-primary" onClick={openCreate}>
          <Plus /> Add Staff
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Staff" value={rows.length} hint="Total staff members" icon={<Wrench />} tone="blue" />
        <StatTile label="Active" value={active} hint="Currently active staff" icon={<Wrench />} tone="green" />
        <StatTile label="Open Tasks" value={rows.reduce((sum, row) => sum + row.open_complaints, 0)} hint="Pending and ongoing tasks" icon={<Wrench />} tone="amber" />
      </div>
      <DataTable
        title="All Staff"
        search={searchInput}
        onSearch={setSearchInput}
        searching={isSearchPending}
        searchPlaceholder="Search staff"
        searchClassName="min-w-[12rem] sm:w-[17.5rem]"
        loading={loading}
        isEmpty={!loading && rows.length === 0}
        empty="No staff members yet."
        toolbar={
          <StaffFiltersButton
            value={{ specialization: skill, status, availability }}
            onApply={(next) => {
              setSkill(next.specialization);
              setStatus(next.status);
              setAvailability(next.availability);
            }}
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                {["Name", "Specialization", "Type", "Availability", "Invitation", "Open tasks", "Actions"].map((label) => (
                  <th key={label} className={`whitespace-nowrap px-4 py-3 font-medium ${label === "Actions" ? "w-24 text-center" : ""}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{row.name}</p>
                    <p className="text-xs text-slate-400">{row.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <StaffSpecializationCell row={row} />
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-700">{row.staff_type}</td>
                  <td className="px-4 py-3">
                    <AdminBadge tone={row.status === "active" && row.availability === "available" ? "green" : "slate"}>
                      {row.status === "inactive" ? "Inactive" : row.availability}
                    </AdminBadge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <p>{row.invitation === "accepted" ? "Accepted" : row.invitation === "pending" ? "Pending" : row.invitation === "expired" ? "Expired" : "Inactive"}</p>
                    {row.delivery_error ? <p className="mt-1 max-w-xs text-xs text-rose-600">{row.delivery_error}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.open_complaints}</td>
                  <td className="w-24 px-4 py-3 text-center align-middle">
                    <div className="flex justify-center">
                    <AdminActionsMenu actions={staffActions(row, {
                      onDetails: showDetails,
                      onTasks: showTasks,
                      onEdit: openEdit,
                      onStatus: (member) => void toggleStatus(member),
                      onResend: (member) => void resendInvite(member),
                      onCancel: (member) => void cancelInvite(member),
                      onRemove: (member) => void removeMember(member),
                    })} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataTable>

      <StaffFormModal
        open={open}
        member={editing}
        onClose={() => setOpen(false)}
        onSaved={() => { void load(); }}
      />

      {viewing ? (
        <div className="nl-notice-modal-backdrop" onClick={() => setViewing(null)}>
          <div className="nl-notice-modal" style={{ maxWidth: "36rem" }} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className="nl-notice-modal-head">
              <div>
                <p className="nl-notice-modal-eyebrow">Assigned service requests</p>
                <h3 className="nl-notice-modal-title">{viewing.name}</h3>
              </div>
            </header>
            <div className="nl-notice-modal-body">
              {(viewing.complaints ?? []).length === 0 ? <p className="text-sm text-slate-400">No service requests assigned.</p> : null}
              <ul className="space-y-2">
                {(viewing.complaints ?? []).map((item) => (
                  <li key={item.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <p className="font-semibold text-slate-900">{item.reference} · {item.title}</p>
                    <p className="text-xs capitalize text-slate-500">{item.category.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}</p>
                  </li>
                ))}
              </ul>
            </div>
            <footer className="flex justify-end border-t border-slate-100 px-5 py-4">
              <button type="button" className="nl-btn-secondary" onClick={() => setViewing(null)}>Close</button>
            </footer>
          </div>
        </div>
      ) : null}

      {details ? (
        <div className="nl-notice-modal-backdrop" onClick={() => setDetails(null)}>
          <div className="nl-notice-modal" style={{ maxWidth: "32rem" }} role="dialog" aria-modal="true" aria-labelledby="staff-details-title" onClick={(event) => event.stopPropagation()}>
            <header className="nl-notice-modal-head">
              <div>
                <p className="nl-notice-modal-eyebrow">Staff</p>
                <h3 id="staff-details-title" className="nl-notice-modal-title">{details.name}</h3>
              </div>
            </header>
            <div className="nl-notice-modal-body">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Email</dt>
                  <dd className="text-slate-800">{details.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Phone</dt>
                  <dd className="text-slate-800">{details.phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Type</dt>
                  <dd className="capitalize text-slate-800">{details.staff_type}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Specialization</dt>
                  <dd className="text-slate-800">{details.specialization_label}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Status</dt>
                  <dd className="capitalize text-slate-800">{invitationAccepted(details) ? details.status : details.invitation === "expired" ? "Invitation expired" : "Invitation pending"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Invitation</dt>
                  <dd className="capitalize text-slate-800">{details.invitation}</dd>
                </div>
              </dl>
            </div>
            <footer className="flex justify-end border-t border-slate-100 px-5 py-4">
              <button type="button" className="nl-btn-secondary" onClick={() => setDetails(null)}>Close</button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
