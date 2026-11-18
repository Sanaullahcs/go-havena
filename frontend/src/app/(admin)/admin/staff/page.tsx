"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Wrench } from "lucide-react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { StaffFormModal } from "@/components/admin/staff-form-modal";
import { AdminBadge, DataTable, StatTile } from "@/components/admin/ui";
import { ThemedSelect } from "@/components/ui/themed-select";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  STAFF_SKILLS,
  fetchStaff,
  fetchStaffMember,
  resendStaffInvite,
  STAFF_SYNC_MS,
  updateStaff,
  type StaffMember,
} from "@/lib/api/staff";
import { subscribeForegroundNotification } from "@/lib/notifications/foreground-notification-events";

export default function StaffPage() {
  const [rows, setRows] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [skill, setSkill] = useState("all");
  const [status, setStatus] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [viewing, setViewing] = useState<StaffMember | null>(null);
  const [open, setOpen] = useState(false);
  const loadRequest = useRef(0);
  const signatureRef = useRef("");

  const load = useCallback(async (silent = false) => {
    const requestId = ++loadRequest.current;
    if (!silent) setLoading(true);
    try {
      const next = await fetchStaff({ search, specialization: skill, status, availability });
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
  }, [search, skill, status, availability]);

  useEffect(() => {
    signatureRef.current = "";
    const handle = window.setTimeout(() => { void load(false); }, search ? 200 : 0);
    return () => window.clearTimeout(handle);
  }, [load, search]);

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
      title: next === "inactive" ? "Deactivate this staff member?" : "Activate this staff member?",
      text: next === "inactive"
        ? "They will lose access to assigned tasks until you activate them again."
        : "They can receive new complaint assignments.",
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

  const active = rows.filter((row) => row.status === "active").length;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Staff" value={rows.length} icon={<Wrench />} tone="blue" />
        <StatTile label="Active" value={active} icon={<Wrench />} tone="green" />
        <StatTile label="Open tasks" value={rows.reduce((sum, row) => sum + row.open_complaints, 0)} icon={<Wrench />} tone="amber" />
      </div>
      <DataTable
        title="Staff"
        totalCount={rows.length}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search name, email, or phone"
        loading={loading}
        isEmpty={!loading && rows.length === 0}
        empty="No staff members yet."
        toolbar={<button type="button" className="nl-btn-primary" onClick={openCreate}>Add staff</button>}
        beforeSearch={
          <div className="flex flex-wrap items-center gap-2">
            <div className="nl-picker-compact w-52 shrink-0">
              <ThemedSelect
                value={skill}
                onChange={setSkill}
                options={[["all", "All specializations"], ...STAFF_SKILLS].map(([value, label]) => ({ value, label }))}
              />
            </div>
            <div className="nl-picker-compact w-36 shrink-0">
              <ThemedSelect
                value={status}
                onChange={setStatus}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            </div>
            <div className="nl-picker-compact w-40 shrink-0">
              <ThemedSelect
                value={availability}
                onChange={setAvailability}
                options={[
                  { value: "all", label: "Any availability" },
                  { value: "available", label: "Available" },
                  { value: "unavailable", label: "Unavailable" },
                ]}
              />
            </div>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                {["Name", "Specialization", "Type", "Availability", "Invitation", "Open tasks", "Actions"].map((label) => (
                  <th key={label} className="px-4 py-3 font-medium">{label}</th>
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
                  <td className="px-4 py-3 text-slate-700">{row.specialization_label}</td>
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
                  <td className="px-4 py-3 text-right">
                    <AdminActionsMenu
                      actions={[
                        { label: "View tasks", icon: "view", onClick: () => void fetchStaffMember(row.id).then(setViewing).catch((err) => toastError(apiError(err))) },
                        { label: "Edit", icon: "edit", onClick: () => openEdit(row) },
                        { label: row.status === "active" ? "Deactivate" : "Activate", icon: "check", onClick: () => void toggleStatus(row) },
                        { label: "Resend invitation", icon: "edit", hidden: row.invitation !== "pending" && row.invitation !== "expired", onClick: () => void resendStaffInvite(row.id).then(() => { toastSuccess("Invitation sent"); void load(); }).catch((err) => { toastError(apiError(err)); void load(); }) },
                      ]}
                    />
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
                <p className="nl-notice-modal-eyebrow">Assigned complaints</p>
                <h3 className="nl-notice-modal-title">{viewing.name}</h3>
              </div>
            </header>
            <div className="nl-notice-modal-body">
              {(viewing.complaints ?? []).length === 0 ? <p className="text-sm text-slate-400">No complaints assigned.</p> : null}
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
    </section>
  );
}
