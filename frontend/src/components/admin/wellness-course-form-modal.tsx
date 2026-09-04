"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { CategoryImageField, FormField } from "@/components/admin/wellness-form-fields";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedSelect } from "@/components/ui/themed-select";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { validateWellnessCourseForm } from "@/lib/admin/wellness-form-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import type { WellnessCategory, WellnessCourse } from "@/lib/api/admin-wellness";

type CourseFormState = {
  category_id: number | null;
  title: string;
  description: string;
  status: WellnessCourse["status"];
  imageFile: File | null;
  imagePreview: string | null;
};

const EMPTY_FORM: CourseFormState = {
  category_id: null,
  title: "",
  description: "",
  status: "published",
  imageFile: null,
  imagePreview: null,
};

const STATUS_OPTIONS = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

export function WellnessCourseFormModal({
  open,
  submitting,
  categories,
  defaultCategoryId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting?: boolean;
  categories: WellnessCategory[];
  defaultCategoryId?: number | null;
  onClose: () => void;
  onSubmit: (payload: CourseFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<CourseFormState>(EMPTY_FORM);
  const validation = useTouchedFieldErrors();

  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY_FORM,
      category_id: defaultCategoryId ?? null,
    });
    validation.resetTouched();
  }, [open, defaultCategoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveErrors = useMemo(() => validateWellnessCourseForm(form), [form]);
  const canSubmit = !hasFieldErrors(liveErrors) && !submitting;
  const fieldsEnabled = Boolean(form.category_id);

  const categoryOptions = useMemo(
    () =>
      categories.map((cat) => ({
        value: String(cat.id),
        label: cat.title,
        description: cat.subtitle ?? `${cat.course_count} courses`,
        color: cat.color,
      })),
    [categories],
  );

  if (!open) return null;

  const handleSubmit = async () => {
    if (!validation.validateOnSubmit(liveErrors)) return;
    await onSubmit({
      category_id: form.category_id,
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      imageFile: form.imageFile,
      imagePreview: form.imagePreview,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <BookOpen className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Add course</h3>
              <p className="text-xs text-slate-500">Choose a category, then enter course details.</p>
            </div>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <FormField
            label="Category"
            required
            error={validation.showError("category_id", liveErrors)}
            hint="Select the wellness pillar for this course."
          >
            <SearchableSelect
              value={form.category_id ? String(form.category_id) : ""}
              onChange={(value) => {
                validation.clearError("category_id");
                setForm((f) => ({ ...f, category_id: Number(value) }));
              }}
              options={categoryOptions}
              placeholder="Select category…"
              emptyMessage="No categories available."
              error={validation.showError("category_id", liveErrors)}
            />
          </FormField>

          <FormField
            label="Course title"
            required
            error={fieldsEnabled ? validation.showError("title", liveErrors) : null}
          >
            <input
              className={inputClass(
                fieldsEnabled ? validation.showError("title", liveErrors) : null,
                "nl-input w-full",
              )}
              placeholder="e.g. Morning Mindfulness"
              value={form.title}
              disabled={!fieldsEnabled}
              onChange={(e) => {
                validation.clearError("title");
                setForm((f) => ({ ...f, title: e.target.value }));
              }}
              onBlur={() => validation.touch("title")}
            />
          </FormField>

          <div className={fieldsEnabled ? "" : "pointer-events-none opacity-50"}>
            <CategoryImageField
              inputId="create-course-image"
              previewUrl={form.imagePreview}
              onPick={(file) => {
                if (form.imagePreview?.startsWith("blob:")) URL.revokeObjectURL(form.imagePreview);
                setForm((f) => ({
                  ...f,
                  imageFile: file,
                  imagePreview: URL.createObjectURL(file),
                }));
              }}
              onRemove={() => {
                if (form.imagePreview?.startsWith("blob:")) URL.revokeObjectURL(form.imagePreview);
                setForm((f) => ({ ...f, imageFile: null, imagePreview: null }));
              }}
            />
          </div>

          <FormField
            label="Course description"
            required
            error={fieldsEnabled ? validation.showError("description", liveErrors) : null}
            hint={
              fieldsEnabled
                ? "Shown on the course card and used as fallback when a lesson has no description."
                : "Select a category to continue."
            }
          >
            <textarea
              className={inputClass(
                fieldsEnabled ? validation.showError("description", liveErrors) : null,
                "nl-input min-h-[100px] w-full resize-y",
              )}
              placeholder="Describe what residents will learn…"
              value={form.description}
              disabled={!fieldsEnabled}
              onChange={(e) => {
                validation.clearError("description");
                setForm((f) => ({ ...f, description: e.target.value }));
              }}
              onBlur={() => validation.touch("description")}
            />
          </FormField>

          <FormField label="Status">
            <ThemedSelect
              value={form.status}
              onChange={(value) =>
                setForm((f) => ({
                  ...f,
                  status: value as WellnessCourse["status"],
                }))
              }
              options={STATUS_OPTIONS}
              placeholder="Select status…"
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" className="nl-btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="nl-btn-primary disabled:opacity-60"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? "Saving…" : "Add Course"}
          </button>
        </div>
      </div>
    </div>
  );
}
