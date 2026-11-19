"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Mail, X } from "lucide-react";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { MemberInviteResultModal } from "@/components/admin/member-invite-result-modal";
import { ResidentInviteProfileNotice } from "@/components/admin/resident-invite-profile-notice";
import { inviteMember, type MemberInviteResult } from "@/lib/api/members";
import { apiError, apiFieldErrors } from "@/lib/api/client";
import { confirmSendMemberInvite } from "@/lib/admin/dashboard-confirmations";
import {
  collectInviteUnitNumbers,
  inviteMemberNameLiveError,
  validateInviteMemberForm,
  type InviteMemberForm,
} from "@/lib/admin/invite-member-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import { useResidentInviteEmailStep } from "@/lib/admin/use-resident-invite-email-step";
import { emptyPhoneField, type PhoneFieldState } from "@/lib/phone/format";
import { toastError, toastSuccess } from "@/lib/alert";
import { UnitPickerField } from "@/components/admin/unit-picker-field";
import {
  createAdminUnit,
  fetchAdminUnits,
} from "@/lib/api/property-services";
import { inviteMemberUnitFieldError } from "@/lib/admin/invite-member-validation";

const EMPTY_FORM: InviteMemberForm = { name: "", email: "", unit: "", units: [] };

type InviteField = keyof InviteMemberForm | "phone";

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
  const [phone, setPhone] = useState<PhoneFieldState>(emptyPhoneField());
  const [phoneE164, setPhoneE164] = useState("");
  const [phoneResetKey, setPhoneResetKey] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<InviteField, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<InviteField, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<MemberInviteResult | null>(null);
  const [emailStepError, setEmailStepError] = useState<string | null>(null);

  const {
    step,
    setStep,
    lookupLoading,
    profileLocked,
    lookupNotice,
    resetInviteSteps,
    continueWithEmail,
  } = useResidentInviteEmailStep();

  const liveErrors = useMemo(() => validateInviteMemberForm(form, phone), [form, phone]);
  const canSubmit = !hasFieldErrors(liveErrors);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setPhone(emptyPhoneField());
      setPhoneE164("");
      setPhoneResetKey((k) => k + 1);
      setErrors({});
      setTouched({});
      setSubmitAttempted(false);
      setInviting(false);
      setInviteResult(null);
      setEmailStepError(null);
      resetInviteSteps();
    }
  }, [open, resetInviteSteps]);

  if (!open) return null;

  const showError = (field: InviteField) =>
    Boolean((submitAttempted || touched[field]) && errors[field]);

  const touch = (field: InviteField) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const clearFieldError = (field: InviteField) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const focusFirstError = (nextErrors: Partial<Record<InviteField, string>>) => {
    const firstKey = Object.keys(nextErrors)[0] as InviteField | undefined;
    if (!firstKey || !formRef.current) return;
    formRef.current.querySelector<HTMLElement>(`[data-field="${firstKey}"]`)?.focus();
  };

  const handleEmailContinue = async () => {
    setEmailStepError(null);
    const result = await continueWithEmail(form.email.trim());
    if (!result.ok) {
      setEmailStepError(result.error);
      return;
    }

    setForm((f) => ({
      ...EMPTY_FORM,
      email: f.email.trim(),
      name: result.name,
      unit: "",
      units: [],
    }));
    setPhone(result.phone);
    setPhoneE164(result.phone.e164);
    setPhoneResetKey((k) => k + 1);
    setErrors({});
    setTouched({});
    setSubmitAttempted(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);

    const nextErrors = validateInviteMemberForm(form, phone);
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
      const units = collectInviteUnitNumbers(form);
      const res = await inviteMember({
        name,
        email,
        phone: phone.e164,
        role: "Resident",
        units,
        unit_number: units[0],
      });
      setInviteResult(res.data);
      toastSuccess("Invite sent");
      onSent?.();
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      if (fieldErrors.phone || fieldErrors.email) {
        setErrors((prev) => ({
          ...prev,
          ...(fieldErrors.email ? { email: fieldErrors.email } : {}),
          ...(fieldErrors.phone ? { phone: fieldErrors.phone } : {}),
        }));
        setTouched((prev) => ({ ...prev, email: true, phone: true }));
      }
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
            <p className="mt-0.5 text-sm text-slate-500">
              {step === "email"
                ? "Start with their email address."
                : "Complete the invitation details."}
            </p>
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

        {step === "email" ? (
          <div className="space-y-4 px-6 py-5">
            <Field label="Email address" required error={emailStepError ?? undefined}>
              <ClearableInput
                data-field="email"
                type="email"
                autoFocus
                className={inputClass(emailStepError ?? undefined)}
                value={form.email}
                maxLength={255}
                onChange={(e) => {
                  setEmailStepError(null);
                  setForm((f) => ({ ...f, email: e.target.value }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleEmailContinue();
                  }
                }}
                placeholder="email@example.com"
              />
            </Field>
            <p className="text-[12px] leading-relaxed text-slate-500">
              If this person is already a resident in another community, we&apos;ll load their name and phone automatically.
            </p>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" className="nl-btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="nl-btn-primary disabled:opacity-60"
                disabled={lookupLoading || !form.email.trim()}
                onClick={() => void handleEmailContinue()}
              >
                {lookupLoading ? "Checking…" : "Continue"}
              </button>
            </div>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4 px-6 py-5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900"
                onClick={() => {
                  setStep("email");
                  setEmailStepError(null);
                  setSubmitAttempted(false);
                }}
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
                Change email
              </button>
              <span className="truncate text-[12px] text-slate-500">{form.email}</span>
            </div>

            {lookupNotice && profileLocked ? <ResidentInviteProfileNotice message={lookupNotice} /> : null}
            {lookupNotice && !profileLocked ? (
              <p className="text-[12px] text-slate-600">{lookupNotice}</p>
            ) : null}

            <Field label="Full name" required error={inviteMemberNameLiveError(form.name) || (showError("name") ? errors.name : undefined)}>
              <ClearableInput
                data-field="name"
                readOnly={profileLocked}
                className={inputClass(inviteMemberNameLiveError(form.name) || (showError("name") ? errors.name : undefined))}
                value={form.name}
                onBlur={() => {
                  touch("name");
                  const next = validateInviteMemberForm(form, phone);
                  setErrors((prev) => ({ ...prev, name: next.name }));
                }}
                onChange={(e) => {
                  if (profileLocked) return;
                  clearFieldError("name");
                  setForm((f) => ({ ...f, name: e.target.value }));
                }}
                placeholder="Resident name"
              />
            </Field>

            <Field label="Phone number" required>
              <AdminPhoneInput
                resetKey={phoneResetKey}
                value={phoneE164}
                required
                disabled={profileLocked}
                showError={showError("phone")}
                onChange={(state) => {
                  if (profileLocked) return;
                  clearFieldError("phone");
                  setPhone(state);
                  setPhoneE164(state.e164);
                }}
                onBlur={() => {
                  touch("phone");
                  const next = validateInviteMemberForm(form, phone);
                  setErrors((prev) => ({ ...prev, phone: next.phone }));
                }}
              />
            </Field>

            <Field
              label="Units"
              required
              error={showError("unit") ? errors.unit : undefined}
            >
              <UnitPickerField
                multiple
                dataField="unit"
                values={collectInviteUnitNumbers(form)}
                placeholder="Select one or more units"
                unitMax={20}
                error={showError("unit") ? errors.unit : undefined}
                validateNewUnit={(unit) => inviteMemberUnitFieldError(unit)}
                loadUnits={async () => {
                  const rows = await fetchAdminUnits();
                  return rows
                    .filter((row) => row.kind !== "office")
                    .map((row) => ({
                      id: row.id,
                      unit_number: row.unit_number,
                      resident_count: row.resident_count ?? 0,
                    }));
                }}
                createUnit={async (unitNumber) => {
                  const created = await createAdminUnit({ unit_number: unitNumber });
                  return {
                    id: created.id,
                    unit_number: created.unit_number,
                    resident_count: created.resident_count ?? 0,
                  };
                }}
                onBlur={() => {
                  touch("unit");
                  const next = validateInviteMemberForm(form, phone);
                  setErrors((prev) => ({ ...prev, unit: next.unit }));
                }}
                onChange={(units) => {
                  clearFieldError("unit");
                  setForm((f) => ({
                    ...f,
                    units,
                    unit: units[0] ?? "",
                  }));
                }}
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
        )}
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
