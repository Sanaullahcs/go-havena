"use client";

import { useEffect, useState } from "react";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { AdminBadge } from "@/components/admin/ui";
import { assignCommunityAdmin } from "@/lib/api/communities";
import { apiError } from "@/lib/api/client";
import { isSystemAdminUser } from "@/lib/auth/session";
import { toastError, toastSuccess } from "@/lib/alert";
import { emptyPhoneField, type PhoneFieldState } from "@/lib/phone/format";

export type AssignAdminTarget = {
  communityId: number;
  communityName: string;
  region?: string | null;
  previousAdminName?: string;
  mode?: "assign" | "reassign";
};

export function AssignCommunityAdminModal({
  target,
  open,
  onClose,
  onAssigned,
}: {
  target: AssignAdminTarget | null;
  open: boolean;
  onClose: () => void;
  onAssigned?: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "" });
  const [phone, setPhone] = useState<PhoneFieldState>(emptyPhoneField());
  const [submitting, setSubmitting] = useState(false);
  const [formTouched, setFormTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm({ name: "", email: "" });
      setPhone(emptyPhoneField());
      setSubmitting(false);
      setFormTouched(false);
    }
  }, [open]);

  if (!open || !target) return null;

  const isReassign = target.mode === "reassign" || Boolean(target.previousAdminName);
  const canSubmitNew = form.email.trim().length > 0 && phone.valid;

  const handleAssignSelf = async () => {
    setSubmitting(true);
    try {
      const res = await assignCommunityAdmin(target.communityId, { assign_self: true });
      toastSuccess(res.message);
      onAssigned?.();
      onClose();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignNew = async () => {
    setFormTouched(true);
    if (!canSubmitNew) {
      toastError("Enter a valid email and complete phone number.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await assignCommunityAdmin(target.communityId, {
        name: form.name.trim() || undefined,
        email: form.email.trim(),
        phone: phone.e164,
      });
      toastSuccess(res.message);
      onAssigned?.();
      onClose();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                  {isReassign ? "Reassign community admin" : "Assign community admin"}
                </p>
                {isReassign ? <AdminBadge tone="amber">Needs replacement</AdminBadge> : null}
              </div>
              <h3 className="mt-1 text-xl font-bold text-slate-900">{target.communityName}</h3>
              {target.region ? <p className="mt-0.5 text-sm text-slate-500">{target.region}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {target.previousAdminName ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold">Previous admin suspended</p>
              <p className="mt-0.5 text-[13px] text-amber-900">
                <span className="font-medium">{target.previousAdminName}</span> no longer has access.
                Assign yourself or invite a new admin to restore community management.
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-5 px-6 py-5">
          {isSystemAdminUser() ? (
            <button
              type="button"
              disabled={submitting}
              onClick={handleAssignSelf}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
                <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Assign myself as admin
            </button>
          ) : null}

          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-[11px] font-semibold uppercase tracking-wide">
              <span className="bg-white px-3 text-slate-400">Or create new admin</span>
            </div>
          </div>

          <div className="space-y-4">
            <Field label="Full name" hint="Optional — shown in the admin directory">
              <input
                className="nl-input w-full"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ahmed Hassan"
              />
            </Field>
            <Field label="Email address" required>
              <input
                type="email"
                className="nl-input w-full"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="admin@example.com"
              />
            </Field>
            <Field label="Phone number" required hint="One phone number can only manage one community">
              <AdminPhoneInput
                resetKey={open ? "open" : "closed"}
                required
                showError={formTouched}
                onChange={setPhone}
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !canSubmitNew}
            onClick={handleAssignNew}
            className="nl-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving…" : isReassign ? "Confirm reassignment" : "Assign admin"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function AdminAccountStatusBadge({
  accountStatus,
  applicationStatus,
  needsReassign,
  reassignReason,
}: {
  accountStatus: string;
  applicationStatus: string;
  needsReassign?: boolean;
  reassignReason?: "previous_admin_suspended" | "missing_admin";
}) {
  if (reassignReason === "missing_admin") {
    return <AdminBadge tone="amber">No admin assigned</AdminBadge>;
  }
  if (needsReassign) {
    return <AdminBadge tone="amber">Needs reassignment</AdminBadge>;
  }
  if (accountStatus === "suspended") {
    return <AdminBadge tone="red">Suspended</AdminBadge>;
  }
  if (applicationStatus === "approved" && accountStatus === "active") {
    return <AdminBadge tone="green">Active</AdminBadge>;
  }
  if (applicationStatus === "pending") {
    return <AdminBadge tone="amber">Pending review</AdminBadge>;
  }
  if (applicationStatus === "rejected") {
    return <AdminBadge tone="slate">Rejected</AdminBadge>;
  }
  return <AdminBadge tone="slate">{applicationStatus}</AdminBadge>;
}
