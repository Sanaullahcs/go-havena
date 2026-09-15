"use client";



import { useEffect, useMemo, useState } from "react";

import { X } from "lucide-react";

import { AdminPhoneInput } from "@/components/admin/phone-input";

import {

  updateCommunityAdmin,

  type CommunityAdminApplicant,

} from "@/lib/api/community-admins";

import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";

import { validateCommunityAdminEditForm } from "@/lib/admin/provision-user-validation";

import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";

import { type PhoneFieldState } from "@/lib/phone/format";

import { isPlaceholderEmail } from "@/lib/user/email-display";

import { apiError } from "@/lib/api/client";

import { toastError, toastSuccess } from "@/lib/alert";



type EditCommunityAdminModalProps = {

  item: CommunityAdminApplicant | null;

  open: boolean;

  onClose: () => void;

  onSaved: (updated: CommunityAdminApplicant) => void;

};



function buildForm(item: CommunityAdminApplicant) {

  return {

    name: item.name?.trim() || "",

    email: isPlaceholderEmail(item.email) ? "" : String(item.email ?? "").trim(),

    unitNumber: item.profile?.unit_number?.trim() || "",

    residenceType: (item.profile?.residence_type ?? "") as "" | "homeowner" | "tenant",

  };

}



export function EditCommunityAdminModal({

  item,

  open,

  onClose,

  onSaved,

}: EditCommunityAdminModalProps) {

  const [form, setForm] = useState(() => (item ? buildForm(item) : buildForm({ id: 0, name: "", role: "community_admin", community_admin_status: "approved", status: "active" })));

  const [phone, setPhone] = useState<PhoneFieldState>({ digits: "", country: "US", valid: false, e164: "" });

  const [phoneResetKey, setPhoneResetKey] = useState(0);

  const [submitting, setSubmitting] = useState(false);

  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();



  useEffect(() => {

    if (!open || !item) return;

    setForm(buildForm(item));

    setPhoneResetKey((key) => key + 1);

    resetTouched();

  }, [open, item, resetTouched]);



  const liveErrors = useMemo(

    () =>

      validateCommunityAdminEditForm(

        form.name,

        form.email,

        phone,

        form.unitNumber,

        form.residenceType,

      ),

    [form, phone],

  );



  if (!open || !item?.id) return null;



  const handleSubmit = async () => {

    if (submitting || !validateOnSubmit(liveErrors)) return;



    setSubmitting(true);

    try {

      const res = await updateCommunityAdmin(item.id, {

        name: form.name.trim(),

        email: form.email.trim(),

        phone: phone.e164,

        unit_number: form.unitNumber.trim(),

        residence_type: form.residenceType,

      });

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

              maxLength={100}

              onChange={(e) => {

                clearError("name");

                setForm((current) => ({ ...current, name: e.target.value }));

              }}

              onBlur={() => touch("name")}

              className={inputClass(showError("name", liveErrors), "nl-input mt-1.5")}

              placeholder="e.g. Sarah Mitchell"

            />

            {showError("name", liveErrors) ? (

              <p className="mt-1 text-xs text-red-600">{showError("name", liveErrors)}</p>

            ) : null}

          </div>



          <div>

            <label className="nl-label">

              Email address <span className="text-red-500">*</span>

            </label>

            <input

              type="email"

              value={form.email}

              maxLength={255}

              onChange={(e) => {

                clearError("email");

                setForm((current) => ({ ...current, email: e.target.value }));

              }}

              onBlur={() => touch("email")}

              className={inputClass(showError("email", liveErrors), "nl-input mt-1.5")}

              placeholder="admin@example.com"

            />

            {showError("email", liveErrors) ? (

              <p className="mt-1 text-xs text-red-600">{showError("email", liveErrors)}</p>

            ) : null}

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

                maxLength={50}

                onChange={(e) => {

                  clearError("unitNumber");

                  setForm((current) => ({ ...current, unitNumber: e.target.value }));

                }}

                onBlur={() => touch("unitNumber")}

                className={inputClass(showError("unitNumber", liveErrors), "nl-input mt-1.5")}

                placeholder="e.g. B-12"

              />

              {showError("unitNumber", liveErrors) ? (

                <p className="mt-1 text-xs text-red-600">{showError("unitNumber", liveErrors)}</p>

              ) : null}

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

        </div>



        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">

          <button type="button" onClick={onClose} className="nl-btn-secondary" disabled={submitting}>

            Cancel

          </button>

          <button

            type="button"

            onClick={handleSubmit}

            className="nl-btn-primary"

            disabled={submitting || hasFieldErrors(liveErrors)}

          >

            {submitting ? "Saving…" : "Save changes"}

          </button>

        </div>

      </div>

    </div>

  );

}

