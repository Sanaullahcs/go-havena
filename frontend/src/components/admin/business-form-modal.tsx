"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Business, BusinessFormData } from "@/lib/api/businesses";
import { uploadBusinessImage } from "@/lib/api/businesses";
import { apiError } from "@/lib/api/client";
import { toastError } from "@/lib/alert";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { BusinessHoursInput } from "@/components/admin/business-hours-input";
import type { PhoneFieldState } from "@/lib/phone/format";
import { phoneFieldFromE164 } from "@/lib/phone/format";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { validateBusinessForm } from "@/lib/admin/business-form-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initial?: Business | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (values: BusinessFormData) => Promise<void>;
};

const EMPTY: BusinessFormData = {
  name: "",
  category: "",
  description: "",
  address: "",
  phone: "",
  hours: "",
  amenities: "",
};

export default function BusinessFormModal({
  open,
  mode,
  initial,
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<BusinessFormData>(EMPTY);
  const [phoneField, setPhoneField] = useState<PhoneFieldState>(() => phoneFieldFromE164(""));
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name,
        category: initial.category ?? "",
        description: initial.description ?? "",
        address: initial.address ?? "",
        phone: initial.phone ?? "",
        hours: initial.hours ?? "",
        amenities: initial.amenities ?? "",
        image_url: initial.image_url,
      });
      setPhoneField(phoneFieldFromE164(initial.phone ?? ""));
      setImagePreview(initial.image_url);
    } else {
      setForm(EMPTY);
      setPhoneField(phoneFieldFromE164(""));
      setImagePreview(null);
    }
    resetTouched();
  }, [open, initial, resetTouched]);

  const liveErrors = useMemo(
    () =>
      validateBusinessForm(
        {
          name: form.name,
          category: form.category,
          description: form.description,
          address: form.address,
          hours: form.hours ?? "",
        },
        { phoneValid: phoneField.valid, phoneDigits: phoneField.digits },
      ),
    [form, phoneField],
  );

  const canSubmit = !hasFieldErrors(liveErrors);

  if (!open) return null;

  const handleImage = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadBusinessImage(file);
      setForm((f) => ({ ...f, image_url: url }));
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setUploading(false);
    }
  };

  const handlePhoneChange = (state: PhoneFieldState) => {
    setPhoneField(state);
    setForm((f) => ({ ...f, phone: state.e164 || state.digits }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateOnSubmit(liveErrors)) return;
    await onSubmit({
      ...form,
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      address: form.address.trim(),
      phone: phoneField.e164 || phoneField.digits,
      hours: form.hours.trim(),
      amenities: form.amenities?.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 border-b border-slate-100 bg-white px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">
            {mode === "create" ? "Add Business" : "Edit Business"}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {mode === "create"
              ? "Add a new local business to the marketplace"
              : "Update business details"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-800">Business Photo</label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500"
            >
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="" className="h-full w-full rounded-xl object-cover" />
              ) : (
                <>Upload image</>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImage(e.target.files?.[0] ?? null)}
            />
            {uploading ? <p className="mt-1 text-xs text-slate-400">Uploading…</p> : null}
          </div>

          {[
            { key: "name", label: "Business Name", required: true, placeholder: "e.g., The Daily Grind" },
            { key: "category", label: "Category", required: true, placeholder: "Coffee Shop" },
            { key: "address", label: "Address", required: true, placeholder: "123 Main Street" },
          ].map(({ key, label, required, placeholder }) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-semibold text-slate-800">
                {label} {required ? <span className="text-red-500">*</span> : null}
              </label>
              <input
                value={form[key as keyof BusinessFormData] ?? ""}
                onChange={(e) => {
                  setForm((f) => ({ ...f, [key]: e.target.value }));
                  touch(key);
                  clearError(key);
                }}
                placeholder={placeholder}
                className={inputClass(showError(key, liveErrors), "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-400")}
              />
              {showError(key, liveErrors) ? (
                <p className="mt-1 text-xs text-red-600">{showError(key, liveErrors)}</p>
              ) : null}
            </div>
          ))}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-800">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <AdminPhoneInput
              value={phoneField.e164 || form.phone}
              onChange={(state) => {
                handlePhoneChange(state);
                touch("phone");
                clearError("phone");
              }}
              required
              showError={Boolean(showError("phone", liveErrors))}
            />
            {showError("phone", liveErrors) ? (
              <p className="mt-1 text-xs text-red-600">{showError("phone", liveErrors)}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-800">
              Business Hours <span className="text-red-500">*</span>
            </label>
            <BusinessHoursInput
              value={form.hours ?? ""}
              onChange={(v) => {
                setForm((f) => ({ ...f, hours: v }));
                touch("hours");
                clearError("hours");
              }}
            />
            {showError("hours", liveErrors) ? (
              <p className="mt-1 text-xs text-red-600">{showError("hours", liveErrors)}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-800">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => {
                setForm((f) => ({ ...f, description: e.target.value.slice(0, 300) }));
                touch("description");
                clearError("description");
              }}
              rows={4}
              maxLength={300}
              placeholder="Describe the business…"
              className={inputClass(showError("description", liveErrors), "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-400 resize-none")}
            />
            <p className="mt-1 text-right text-xs text-slate-400">{form.description.length}/300</p>
            {showError("description", liveErrors) ? (
              <p className="mt-1 text-xs text-red-600">{showError("description", liveErrors)}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-800">Amenities (comma separated)</label>
            <input
              value={form.amenities ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, amenities: e.target.value }))}
              placeholder="WiFi, Outdoor Seating, Takeout"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="nl-btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploading || !canSubmit}
              className="nl-btn-primary flex-1 disabled:opacity-50"
            >
              {submitting ? "Saving…" : mode === "create" ? "Add Business" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
