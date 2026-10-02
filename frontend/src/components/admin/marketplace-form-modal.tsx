"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Listing, ListingFormData } from "@/lib/api/listings";
import { LISTING_CONDITIONS } from "@/lib/api/listings";
import { MAX_LISTING_PHOTOS, uploadListingImage } from "@/lib/api/listings";
import { apiError } from "@/lib/api/client";
import { toastError } from "@/lib/alert";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { validateListingForm } from "@/lib/admin/listing-form-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";

const MAX_PHOTOS = MAX_LISTING_PHOTOS;

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "for_sale", label: "Item for Sale" },
  { value: "service", label: "Service" },
];

const CATEGORY_SUGGESTIONS = [
  "Electronics",
  "Furniture",
  "Vehicles",
  "Clothing",
  "Home & Garden",
  "Services",
  "Other",
];

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initial?: Listing | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (values: ListingFormData) => Promise<void>;
};

type FormValues = {
  type: string;
  title: string;
  description: string;
  price: string;
  category: string;
  condition: string;
  location: string;
};

type PhotoDraft = {
  id: string;
  file: File;
  preview: string;
};

const EMPTY: FormValues = {
  type: "for_sale",
  title: "",
  description: "",
  price: "",
  category: "",
  condition: "Like New",
  location: "",
};

export default function MarketplaceFormModal({
  open,
  mode,
  initial,
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormValues>(EMPTY);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        type: initial.type ?? "for_sale",
        title: initial.title ?? "",
        description: initial.description ?? "",
        price: initial.price != null ? String(initial.price) : "",
        category: initial.category ?? "",
        condition: initial.condition ?? "Like New",
        location: initial.location ?? "",
      });
      setExistingImages(initial.images ?? []);
    } else {
      setForm(EMPTY);
      setExistingImages([]);
    }
    setPhotos([]);
    setLocalError(null);
    resetTouched();
  }, [open, initial, resetTouched]);

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
    };
  }, [photos]);

  const totalPhotos = photos.length + existingImages.length;

  const liveErrors = useMemo(
    () => validateListingForm(form, { photoCount: totalPhotos }),
    [form, totalPhotos],
  );

  const canSubmit = !hasFieldErrors(liveErrors);

  if (!open) return null;

  const busy = submitting || uploading;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(String(key));
    setLocalError(null);
  };

  const handlePhotoPick = (files: FileList | File[] | null) => {
    if (!files?.length) return;

    const remaining = MAX_PHOTOS - (photos.length + existingImages.length);
    if (remaining <= 0) {
      setLocalError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const picked = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, remaining);

    if (!picked.length) {
      setLocalError("Please choose image files only.");
      return;
    }

    setPhotos((prev) => [
      ...prev,
      ...picked.map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
    setLocalError(null);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const removeExistingImage = (url: string) => {
    setExistingImages((prev) => prev.filter((img) => img !== url));
  };

  const handleSubmit = async () => {
    if (!validateOnSubmit(liveErrors)) return;
    setLocalError(null);
    setUploading(true);
    setUploadProgress(photos.length ? { done: 0, total: photos.length } : null);

    try {
      const uploaded: string[] = [];
      let done = 0;

      for (const photo of photos) {
        try {
          uploaded.push(await uploadListingImage(photo.file));
          done += 1;
          setUploadProgress({ done, total: photos.length });
        } catch (err) {
          const message = apiError(err);
          setLocalError(message);
          toastError(message);
          return;
        }
      }

      await onSubmit({
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        category: form.category.trim(),
        condition: form.type === "for_sale" ? form.condition : null,
        location: form.location.trim() || null,
        images: [...existingImages, ...uploaded],
      });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                {mode === "create" ? "New listing" : "Edit listing"}
              </p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">
                {mode === "create" ? "Add Listing" : "Update Listing"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Publish an item or service to your community marketplace.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <IcoX />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-[13px] font-medium text-slate-700">Photos</label>
                <span className="text-[12px] font-medium text-slate-500">
                  {totalPhotos}/{MAX_PHOTOS}
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {existingImages.map((url) => (
                  <div key={url} className="relative h-[95px] w-[95px] overflow-hidden rounded-xl">
                    <img src={url} alt="" className="h-full w-full object-cover ring-1 ring-slate-200" />
                    <button
                      type="button"
                      onClick={() => removeExistingImage(url)}
                      className="absolute right-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-black/55 text-sm text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {photos.map((photo) => (
                  <div key={photo.id} className="relative h-[95px] w-[95px] overflow-hidden rounded-xl">
                    <img src={photo.preview} alt="" className="h-full w-full object-cover ring-1 ring-slate-200" />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="absolute right-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-black/55 text-sm text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {totalPhotos < MAX_PHOTOS ? (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className={[
                      "flex h-[95px] w-[95px] items-center justify-center rounded-xl border-2 border-dashed transition",
                      totalPhotos === 0
                        ? "border-blue-200 bg-blue-50/80 hover:bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:border-blue-200 hover:bg-blue-50/40",
                    ].join(" ")}
                  >
                    <IcoImage />
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-[12px] text-slate-500">
                {totalPhotos >= MAX_PHOTOS
                  ? "Maximum photos added"
                  : `Add up to ${MAX_PHOTOS} photos (select multiple at once)`}
              </p>
              <ClearableInput
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handlePhotoPick(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-medium text-slate-700">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((t) => {
                  const active = form.type === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => set("type", t.value)}
                      className={[
                        "rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition",
                        active
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Title <span className="text-rose-500">*</span>
              </label>
              <ClearableInput
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                onBlur={() => touch("title")}
                className={inputClass(showError("title", liveErrors), "nl-input")}
                placeholder="e.g. Vintage Dining Table"
              />
              {showError("title", liveErrors) ? (
                <p className="mt-1 text-xs text-red-600">{showError("title", liveErrors)}</p>
              ) : null}
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Description <span className="text-rose-500">*</span>
              </label>
              <ClearableTextarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                onBlur={() => touch("description")}
                rows={4}
                className={inputClass(showError("description", liveErrors), "nl-input resize-none")}
                placeholder="Describe the item, its condition, dimensions, etc."
              />
              {showError("description", liveErrors) ? (
                <p className="mt-1 text-xs text-red-600">{showError("description", liveErrors)}</p>
              ) : null}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Price (USD) <span className="text-rose-500">*</span>
                </label>
                <ClearableInput
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                  onBlur={() => touch("price")}
                  className={inputClass(showError("price", liveErrors), "nl-input")}
                  placeholder="$ 0.00"
                  inputMode="decimal"
                />
                {showError("price", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("price", liveErrors)}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Category <span className="text-rose-500">*</span>
                </label>
                <ClearableInput
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  onBlur={() => touch("category")}
                  className={inputClass(showError("category", liveErrors), "nl-input")}
                  placeholder="e.g. Electronics"
                  list="listing-category-suggestions"
                />
                <datalist id="listing-category-suggestions">
                  {CATEGORY_SUGGESTIONS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                {showError("category", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("category", liveErrors)}</p>
                ) : null}
              </div>
            </div>

            {form.type === "for_sale" ? (
              <div>
                <label className="mb-2 block text-[13px] font-medium text-slate-700">
                  Condition <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {LISTING_CONDITIONS.map((option) => {
                    const active = form.condition === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          set("condition", option);
                          touch("condition");
                        }}
                        className={[
                          "rounded-full border px-3.5 py-2 text-[13px] font-semibold transition",
                          active
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                {showError("condition", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("condition", liveErrors)}</p>
                ) : null}
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Location (optional)</label>
              <ClearableInput
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                onBlur={() => touch("location")}
                className={inputClass(showError("location", liveErrors), "nl-input")}
                placeholder="e.g. Building A, Unit 304"
              />
              {showError("location", liveErrors) ? (
                <p className="mt-1 text-xs text-red-600">{showError("location", liveErrors)}</p>
              ) : null}
            </div>

            {localError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-700">
                {localError}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy} className="nl-btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={handleSubmit}
            className="nl-btn-primary disabled:opacity-60"
          >
            <IcoPlus />
            {uploadProgress
              ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
              : busy
                ? "Saving…"
                : mode === "create"
                  ? "Publish listing"
                  : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IcoX() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IcoPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IcoImage() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-blue-500">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
