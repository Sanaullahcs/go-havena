"use client";

import { useMemo, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { UtilityBillPreview } from "@/components/admin/utility-bill-preview";
import {
  updateCommunityAdmin,
  type CommunityAdminApplicant,
} from "@/lib/api/community-admins";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import {
  COMMUNITY_ADMIN_NAME_MAX,
  COMMUNITY_ADMIN_UNIT_MAX,
  applyCharacterLimit,
} from "@/lib/admin/community-admin-field-limits";
import { validateCommunityAdminEditForm } from "@/lib/admin/provision-user-validation";
import {
  UTILITY_BILL_ACCEPT,
  utilityBillFileError,
} from "@/lib/admin/complete-profile-validation";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { phoneFieldFromE164, type PhoneFieldState } from "@/lib/phone/format";
import { isPlaceholderEmail } from "@/lib/user/email-display";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import { NL } from "@/lib/design-tokens";

type EditCommunityAdminModalProps = {
  item: CommunityAdminApplicant | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: CommunityAdminApplicant) => void;
};

type EditFormState = {
  name: string;
  email: string;
  unitNumber: string;
  residenceType: "" | "homeowner" | "tenant";
};

type EditSnapshot = {
  name: string;
  email: string;
  unitNumber: string;
  residenceType: string;
  phoneE164: string;
};

function buildForm(item: CommunityAdminApplicant): EditFormState {
  const residence = item.profile?.residence_type;
  return {
    name: item.name?.trim() || "",
    email: isPlaceholderEmail(item.email) ? "" : String(item.email ?? "").trim(),
    unitNumber: item.profile?.unit_number?.trim() || "",
    residenceType: residence === "homeowner" || residence === "tenant" ? residence : "",
  };
}

function editSnapshot(form: EditFormState, phone: PhoneFieldState): EditSnapshot {
  return {
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    unitNumber: form.unitNumber.trim(),
    residenceType: form.residenceType,
    phoneE164: phone.e164,
  };
}

function snapshotsMatch(left: EditSnapshot, right: EditSnapshot): boolean {
  return (
    left.name === right.name
    && left.email === right.email
    && left.unitNumber === right.unitNumber
    && left.residenceType === right.residenceType
    && left.phoneE164 === right.phoneE164
  );
}

export function EditCommunityAdminModal({
  item,
  open,
  onClose,
  onSaved,
}: EditCommunityAdminModalProps) {
  const [form, setForm] = useState<EditFormState>(() =>
    item ? buildForm(item) : { name: "", email: "", unitNumber: "", residenceType: "" },
  );
  const [phone, setPhone] = useState<PhoneFieldState>(() => phoneFieldFromE164(item?.phone ?? ""));
  const [baseline, setBaseline] = useState<EditSnapshot | null>(null);
  const [phoneResetKey, setPhoneResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [utilityFile, setUtilityFile] = useState<File | null>(null);
  const [utilityError, setUtilityError] = useState<string | null>(null);
  const [utilityPreviewUrl, setUtilityPreviewUrl] = useState<string | null>(null);
  const utilityInputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<string | null>(null);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();

  // Sync before paint so a reopened form is clean on the first frame.
  // Later updates for the same admin id must not wipe in-progress edits.
  const session = open && item?.id ? String(item.id) : null;
  if (sessionRef.current !== session) {
    sessionRef.current = session;
    if (item && session) {
      const nextForm = buildForm(item);
      const nextPhone = phoneFieldFromE164(item.phone ?? "");
      setForm(nextForm);
      setPhone(nextPhone);
      setBaseline(editSnapshot(nextForm, nextPhone));
      setPhoneResetKey((key) => key + 1);
      setUtilityFile(null);
      setUtilityError(null);
      setUtilityPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      resetTouched();
    }
  }

  const liveErrors = useMemo(
    () => validateCommunityAdminEditForm(form.name, phone, form.unitNumber, form.residenceType),
    [form, phone],
  );

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    return !snapshotsMatch(editSnapshot(form, phone), baseline);
  }, [baseline, form, phone]);

  if (!open || !item?.id) return null;

  const hasUtilityChange = Boolean(utilityFile) && !utilityError;
  const canSave =
    (isDirty || hasUtilityChange)
    && !hasFieldErrors(liveErrors)
    && !utilityError
    && !submitting;

  const selectUtilityFile = (file: File | null) => {
    const error = utilityBillFileError(file);
    setUtilityPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file && !error ? URL.createObjectURL(file) : null;
    });
    setUtilityFile(file);
    setUtilityError(error);
  };

  const handleSubmit = async () => {
    if (!canSave || !validateOnSubmit(liveErrors) || utilityError) return;

    setSubmitting(true);
    try {
      const res = await updateCommunityAdmin(item.id, {
        name: form.name.trim(),
        phone: phone.e164,
        unit_number: form.unitNumber.trim(),
        residence_type: form.residenceType,
      }, utilityFile);
      toastSuccess(res.message || "Community admin updated");
      onSaved(res.data);
      onClose();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <h3 className="text-[15px] font-bold text-slate-900">Edit community admin</h3>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              Update contact and profile details for {item.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="nl-label">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              maxLength={form.name.length > COMMUNITY_ADMIN_NAME_MAX ? undefined : COMMUNITY_ADMIN_NAME_MAX}
              onChange={(e) => {
                clearError("name");
                setForm((current) => ({
                  ...current,
                  name: applyCharacterLimit(current.name, e.target.value, COMMUNITY_ADMIN_NAME_MAX),
                }));
              }}
              onBlur={() => touch("name")}
              className={inputClass(showError("name", liveErrors), "nl-input mt-1.5")}
              placeholder="e.g. Sarah Mitchell"
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              {showError("name", liveErrors) ? (
                <p className="text-xs text-red-600">{showError("name", liveErrors)}</p>
              ) : (
                <span />
              )}
              <p className={`shrink-0 text-xs tabular-nums ${form.name.length > COMMUNITY_ADMIN_NAME_MAX ? "text-red-600" : "text-slate-400"}`}>
                {form.name.length} / {COMMUNITY_ADMIN_NAME_MAX}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="nl-label">Email address</label>
              <span className="text-[11px] font-medium" style={{ color: NL.textMuted }}>
                Read only
              </span>
            </div>
            <input
              type="email"
              value={form.email}
              className="nl-input mt-1.5 w-full cursor-not-allowed"
              style={{
                background: NL.surfaceMuted,
                color: NL.textSecondary,
                borderColor: NL.borderCard,
                WebkitTextFillColor: NL.textSecondary,
              }}
              placeholder="Phone sign-in — no email on file"
              disabled
              readOnly
              aria-readonly="true"
              tabIndex={-1}
            />
          </div>

          <div>
            <label className="nl-label">
              Phone number <span className="text-red-500">*</span>
            </label>
            <div className="mt-1.5">
              <AdminPhoneInput
                value={item.phone ?? ""}
                resetKey={`${item.id}-${phoneResetKey}`}
                required
                showError={Boolean(showError("phone", liveErrors))}
                onChange={(state) => {
                  clearError("phone");
                  setPhone(state);
                }}
                onBlur={() => touch("phone")}
              />
            </div>
            {showError("phone", liveErrors) ? (
              <p className="mt-1 text-xs text-red-600">{showError("phone", liveErrors)}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="nl-label">
                Unit / apartment <span className="text-red-500">*</span>
              </label>
              <input
                value={form.unitNumber}
                maxLength={form.unitNumber.length > COMMUNITY_ADMIN_UNIT_MAX ? undefined : COMMUNITY_ADMIN_UNIT_MAX}
                onChange={(e) => {
                  clearError("unitNumber");
                  setForm((current) => ({
                    ...current,
                    unitNumber: applyCharacterLimit(current.unitNumber, e.target.value, COMMUNITY_ADMIN_UNIT_MAX),
                  }));
                }}
                onBlur={() => touch("unitNumber")}
                className={inputClass(showError("unitNumber", liveErrors), "nl-input mt-1.5")}
                placeholder="e.g. B-12"
              />
              <div className="mt-1 flex items-start justify-between gap-3">
                {showError("unitNumber", liveErrors) ? (
                  <p className="text-xs text-red-600">{showError("unitNumber", liveErrors)}</p>
                ) : (
                  <span />
                )}
                <p className={`shrink-0 text-xs tabular-nums ${form.unitNumber.length > COMMUNITY_ADMIN_UNIT_MAX ? "text-red-600" : "text-slate-400"}`}>
                  {form.unitNumber.length} / {COMMUNITY_ADMIN_UNIT_MAX}
                </p>
              </div>
            </div>
            <div>
              <label className="nl-label">
                Residence type <span className="text-red-500">*</span>
              </label>
              <select
                value={form.residenceType}
                onChange={(e) => {
                  clearError("residenceType");
                  setForm((current) => ({
                    ...current,
                    residenceType: e.target.value as "" | "homeowner" | "tenant",
                  }));
                }}
                onBlur={() => touch("residenceType")}
                className={inputClass(showError("residenceType", liveErrors), "nl-input nl-select mt-1.5")}
              >
                <option value="" disabled>
                  Select residence type
                </option>
                <option value="homeowner">Homeowner</option>
                <option value="tenant">Tenant</option>
              </select>
              {showError("residenceType", liveErrors) ? (
                <p className="mt-1 text-xs text-red-600">{showError("residenceType", liveErrors)}</p>
              ) : null}
            </div>
          </div>

          <div>
            <label className="nl-label">Utility Bill / Lease</label>
            <p className="mt-1 text-[12px] text-slate-500">
              Upload or replace the document used to verify the community administrator’s residence.
            </p>
            <div className="mt-3">
              <UtilityBillPreview
                url={item.profile?.utility_bill_url}
                reviewStatus={item.profile?.utility_bill_review_status}
                label="Current document"
              />
            </div>
            <input
              ref={utilityInputRef}
              type="file"
              accept={UTILITY_BILL_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                selectUtilityFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => utilityInputRef.current?.click()}
              className="nl-btn-secondary mt-3"
            >
              <Upload className="h-4 w-4" strokeWidth={2} />
              {item.profile?.utility_bill_url ? "Replace document" : "Upload document"}
            </button>
            <p className="mt-1.5 text-[11px] text-slate-400">JPG, PNG, HEIC, or PDF — 10 MB max</p>
            {utilityFile ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[12px] font-medium text-slate-700">{utilityFile.name}</p>
                  <button
                    type="button"
                    className="shrink-0 text-[12px] font-semibold text-slate-500 hover:text-slate-800"
                    onClick={() => selectUtilityFile(null)}
                  >
                    Remove
                  </button>
                </div>
                {utilityPreviewUrl ? (
                  <a
                    href={utilityPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex text-[12px] font-semibold text-blue-700 hover:underline"
                  >
                    View selected file
                  </a>
                ) : null}
              </div>
            ) : null}
            {utilityError ? (
              <p className="mt-1 text-xs text-red-600" role="alert">{utilityError}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="nl-btn-primary"
            disabled={!canSave}
          >
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
