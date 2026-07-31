"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, X } from "lucide-react";
import { MemberInviteResultModal } from "@/components/admin/member-invite-result-modal";
import { inviteMember, type MemberInviteResult } from "@/lib/api/members";
import { apiError } from "@/lib/api/client";
import { confirmSendMemberInvite } from "@/lib/admin/dashboard-confirmations";
import {
  validateInviteMemberForm,
  type InviteMemberForm,
} from "@/lib/admin/invite-member-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import { toastError, toastSuccess } from "@/lib/alert";

const EMPTY_FORM: InviteMemberForm = { name: "", email: "", unit: "" };

export function MemberInviteModal({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<InviteMemberForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof InviteMemberForm, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof InviteMemberForm, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<MemberInviteResult | null>(null);

  const liveErrors = useMemo(() => validateInviteMemberForm(form), [form]);
  const canSubmit = !hasFieldErrors(liveErrors);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setErrors({});
      setTouched({});
      setSubmitAttempted(false);
      setInviting(false);
      setInviteResult(null);
    }
  }, [open]);

  if (!open) return null;

  const showError = (field: keyof InviteMemberForm) =>
    Boolean((submitAttempted || touched[field]) && errors[field]);

  const touch = (field: keyof InviteMemberForm) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const clearFieldError = (field: keyof InviteMemberForm) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const focusFirstError = (nextErrors: Partial<Record<keyof InviteMemberForm, string>>) => {
    const firstKey = Object.keys(nextErrors)[0] as keyof InviteMemberForm | undefined;
    if (!firstKey || !formRef.current) return;
    formRef.current.querySelector<HTMLElement>(`[data-field="${firstKey}"]`)?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);

    const nextErrors = validateInviteMemberForm(form);
    setErrors(nextErrors);
    if (hasFieldErrors(nextErrors)) {
      focusFirstError(nextErrors);
      return;
    }

    const name = form.name.trim();
    const email = form.email.trim();
    const result = await confirmSendMemberInvite(name, email);
    if (!result.isConfirmed) return;

    setInviting(true);
    try {
      const res = await inviteMember({
        name,
        email,
        role: "Resident",
        unit_number: form.unit.trim() || undefined,
      });
      setInviteResult(res.data);
      toastSuccess("Invite sent");
      onSent?.();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setInviting(false);
    }
  };

  if (inviteResult) {
    return (
      <MemberInviteResultModal
        result={inviteResult}
        onClose={() => {
          setInviteResult(null);
          onClose();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 nl-modal-backdrop bg-slate-900/45 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-modal-in">
        <div className="flex items-start gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/25">
            <Mail className="h-5 w-5" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-900">Invite resident</h3>
            <p className="mt-0.5 text-sm text-slate-500">They&apos;ll receive an invite code for your community.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4 px-6 py-5">
          <Field label="Full name" required error={showError("name") ? errors.name : undefined}>
            <input
              data-field="name"
              className={inputClass(showError("name") ? errors.name : undefined)}
              value={form.name}
              maxLength={100}
              onBlur={() => {
                touch("name");
                const next = validateInviteMemberForm(form);
                setErrors((prev) => ({ ...prev, name: next.name }));
              }}
              onChange={(e) => {
                clearFieldError("name");
                setForm((f) => ({ ...f, name: e.target.value }));
              }}
              placeholder="Resident name"
            />
          </Field>

          <Field label="Email" required error={showError("email") ? errors.email : undefined}>
            <input
              data-field="email"
              type="email"
              className={inputClass(showError("email") ? errors.email : undefined)}
              value={form.email}
              maxLength={255}
              onBlur={() => {
                touch("email");
                const next = validateInviteMemberForm(form);
                setErrors((prev) => ({ ...prev, email: next.email }));
              }}
              onChange={(e) => {
                clearFieldError("email");
                setForm((f) => ({ ...f, email: e.target.value }));
              }}
              placeholder="email@example.com"
            />
          </Field>

          <Field label="Unit (optional)" error={showError("unit") ? errors.unit : undefined}>
            <input
              data-field="unit"
              className={inputClass(showError("unit") ? errors.unit : undefined)}
              value={form.unit}
              maxLength={50}
              onBlur={() => {
                touch("unit");
                const next = validateInviteMemberForm(form);
                setErrors((prev) => ({ ...prev, unit: next.unit }));
              }}
              onChange={(e) => {
                clearFieldError("unit");
                setForm((f) => ({ ...f, unit: e.target.value }));
              }}
              placeholder="e.g. 12B"
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" className="nl-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="nl-btn-primary disabled:opacity-60" disabled={inviting || !canSubmit}>
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  error,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {error ? <span className="block text-[11px] font-medium text-red-600">{error}</span> : null}
    </label>
  );
}
