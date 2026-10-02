"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { useEffect, useMemo, useState } from "react";
import { FileUp, GraduationCap, Link2, Loader2, X } from "lucide-react";
import {
  FormField,
  KeyTakeawaysEditor,
} from "@/components/admin/wellness-form-fields";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ThemedSelect } from "@/components/ui/themed-select";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { validateWellnessLessonForm } from "@/lib/admin/wellness-form-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import type { WellnessCourse, WellnessLesson } from "@/lib/api/admin-wellness";

type LessonFormState = {
  course_id: number | null;
  title: string;
  description: string;
  link_url: string;
  key_takeaways: string[];
  status: WellnessLesson["status"];
  file: File | null;
};

const EMPTY_FORM: LessonFormState = {
  course_id: null,
  title: "",
  description: "",
  link_url: "",
  key_takeaways: [],
  status: "published",
  file: null,
};

const STATUS_OPTIONS = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

export function WellnessLessonFormModal({
  open,
  submitting,
  courses,
  coursesLoading,
  defaultCourseId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting?: boolean;
  courses: WellnessCourse[];
  coursesLoading?: boolean;
  defaultCourseId?: number | null;
  onClose: () => void;
  onSubmit: (payload: LessonFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<LessonFormState>(EMPTY_FORM);
  const validation = useTouchedFieldErrors();

  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY_FORM,
      course_id: defaultCourseId ?? null,
    });
    validation.resetTouched();
  }, [open, defaultCourseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveErrors = useMemo(
    () =>
      validateWellnessLessonForm({
        course_id: form.course_id,
        title: form.title,
        link_url: form.link_url,
        hasFile: Boolean(form.file),
      }),
    [form],
  );

  const canSubmit = !hasFieldErrors(liveErrors) && !submitting && !coursesLoading;
  const fieldsEnabled = Boolean(form.course_id);

  const courseOptions = useMemo(
    () =>
      courses.map((course) => ({
        value: String(course.id),
        label: course.title,
        description: [course.category_title, `${course.lesson_count} lessons`, course.status]
          .filter(Boolean)
          .join(" · "),
      })),
    [courses],
  );

  if (!open) return null;

  const handleSubmit = async () => {
    if (!validation.validateOnSubmit(liveErrors)) return;
    await onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <GraduationCap className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Add lesson</h3>
              <p className="text-xs text-slate-500">Choose a course, then add lesson content.</p>
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
            label="Course"
            required
            error={validation.showError("course_id", liveErrors)}
            hint="Select the course this lesson belongs to."
          >
            {coursesLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading courses…
              </div>
            ) : (
              <SearchableSelect
                value={form.course_id ? String(form.course_id) : ""}
                onChange={(value) => {
                  validation.clearError("course_id");
                  setForm((f) => ({ ...f, course_id: Number(value) }));
                }}
                options={courseOptions}
                placeholder="Select course…"
                emptyMessage={
                  courses.length === 0 ? "No courses yet — create a course first." : "No courses available."
                }
                error={validation.showError("course_id", liveErrors)}
              />
            )}
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_11rem]">
            <FormField
              label="Lesson title"
              required
              error={fieldsEnabled ? validation.showError("title", liveErrors) : null}
            >
              <ClearableInput
                className={inputClass(
                  fieldsEnabled ? validation.showError("title", liveErrors) : null,
                  "nl-input w-full",
                )}
                placeholder="e.g. Box Breathing Technique"
                value={form.title}
                disabled={!fieldsEnabled}
                onChange={(e) => {
                  validation.clearError("title");
                  setForm((f) => ({ ...f, title: e.target.value }));
                }}
                onBlur={() => validation.touch("title")}
              />
            </FormField>

            <FormField label="Status">
              <ThemedSelect
                value={form.status}
                onChange={(value) =>
                  setForm((f) => ({
                    ...f,
                    status: value as WellnessLesson["status"],
                  }))
                }
                options={STATUS_OPTIONS}
                placeholder="Select status…"
              />
            </FormField>
          </div>

          <div className={fieldsEnabled ? "" : "pointer-events-none opacity-50"}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Lesson media <span className="text-red-500">*</span>
            </p>
            <p className="mb-3 text-xs text-slate-400">
              Add a link or upload a file — at least one is required.
            </p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Link2 className="h-4 w-4 text-blue-600" />
                  Video / resource link
                </div>
                <ClearableInput
                  className={inputClass(
                    validation.showError("link_url", liveErrors),
                    "nl-input w-full",
                  )}
                  placeholder="https://…"
                  value={form.link_url}
                  disabled={!fieldsEnabled}
                  onChange={(e) => {
                    validation.clearError("link_url");
                    validation.clearError("content");
                    setForm((f) => ({ ...f, link_url: e.target.value }));
                  }}
                  onBlur={() => validation.touch("link_url")}
                />
                {validation.showError("link_url", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">
                    {validation.showError("link_url", liveErrors)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">YouTube, direct MP4, or any https URL</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <FileUp className="h-4 w-4 text-blue-600" />
                  Upload file
                </div>
                <ClearableInput
                  type="file"
                  accept="video/*,.pdf,.doc,.docx"
                  disabled={!fieldsEnabled}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-60"
                  onChange={(e) => {
                    validation.clearError("content");
                    setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }));
                  }}
                />
                {form.file ? (
                  <p className="mt-2 truncate text-xs font-medium text-emerald-600">
                    Selected: {form.file.name}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">MP4, MOV, PDF, or document — max 50MB</p>
                )}
              </div>
            </div>
            {validation.showError("content", liveErrors) ? (
              <p className="mt-2 text-xs text-red-600">
                {validation.showError("content", liveErrors)}
              </p>
            ) : null}
          </div>

          <FormField
            label="Lesson description"
            hint={
              fieldsEnabled
                ? "Optional. Falls back to the course description on mobile if empty."
                : "Select a course to continue."
            }
          >
            <ClearableTextarea
              className="nl-input min-h-[72px] w-full resize-y"
              placeholder="What will residents learn in this lesson?"
              value={form.description}
              disabled={!fieldsEnabled}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>

          <div className={fieldsEnabled ? "" : "pointer-events-none opacity-50"}>
            <KeyTakeawaysEditor
              value={form.key_takeaways}
              onChange={(items) => setForm((f) => ({ ...f, key_takeaways: items }))}
            />
          </div>
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
            {submitting ? "Saving…" : "Add Lesson"}
          </button>
        </div>
      </div>
    </div>
  );
}
