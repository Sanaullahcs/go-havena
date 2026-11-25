"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";
import { ThemedSelect } from "@/components/ui/themed-select";
import { useRef, useState, type ReactNode } from "react";
import { Paperclip, X } from "lucide-react";
import { createComplaint, type ComplaintRecord } from "@/lib/api/complaints";
import { apiError } from "@/lib/api/client";
import { toastError } from "@/lib/alert";
import {
  COMPLAINT_PRIORITIES,
  DESCRIPTION_MAX,
  TECHNICAL_CATEGORIES,
  TECHNICAL_CATEGORY_HINTS,
  TITLE_MAX,
  complaintDescriptionError,
  complaintTitleError,
} from "@/lib/complaints/meta";
import { inputClass } from "@/lib/admin/form-validation-utils";

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="nl-notice-label">
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return <p className="nl-notice-field-error">{children}</p>;
}

const ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function CreateTechnicalComplaintModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (record: ComplaintRecord) => void;
}) {
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<ComplaintRecord["priority"]>("normal");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const titleMessage = touched.title ? complaintTitleError(title) : "";
  const descriptionMessage = touched.description ? complaintDescriptionError(description) : "";
  const categoryMessage = touched.category && !category ? "Choose a category." : "";
  const canSubmit =
    !busy
    && !complaintTitleError(title)
    && !complaintDescriptionError(description)
    && !!category
    && !!priority;

  const mark = (field: string) => setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

  const reset = () => {
    setCategory("");
    setPriority("normal");
    setTitle("");
    setDescription("");
    setFiles([]);
    setTouched({});
    if (fileRef.current) fileRef.current.value = "";
  };

  const close = () => {
    if (busy) return;
    onClose();
  };

  const pickFiles = (picked: FileList | null) => {
    if (!picked?.length) return;
    const next: File[] = [];
  for (const file of Array.from(picked)) {
      if (file.size > MAX_FILE_BYTES) {
        toastError("Each file must be 10 MB or smaller.");
        continue;
      }
      next.push(file);
    }
    setFiles((current) => [...current, ...next].slice(0, 5));
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    const nextTouched = { category: true, title: true, description: true, priority: true };
    setTouched(nextTouched);
    if (!canSubmit) return;
    setBusy(true);
    try {
      const created = await createComplaint(
        {
          type: "technical",
          category,
          priority,
          title: title.trim(),
          description: description.trim(),
        },
        files,
      );
      reset();
      onCreated(created);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const categoryOptions = TECHNICAL_CATEGORIES.map(([value, label]) => ({ value, label }));

  const priorityOptions = COMPLAINT_PRIORITIES.map(([value, label]) => ({ value, label }));

  return (
    <div className="nl-notice-modal-backdrop" role="presentation" onClick={close}>
      <div
        className="nl-notice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-tech-complaint-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="nl-notice-modal-head">
          <div className="min-w-0">
            <p className="nl-notice-modal-eyebrow">System support</p>
            <h3 id="create-tech-complaint-title" className="nl-notice-modal-title">
              Create Complaint
            </h3>
            <p className="nl-notice-schedule-hint mt-1">
              Technical issues are sent to System Admin for resolution. Use maintenance complaints for resident property issues.
            </p>
          </div>
          <button type="button" onClick={close} className="nl-notice-modal-close" aria-label="Close" disabled={busy}>
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className="nl-notice-modal-body">
          <div className="nl-notice-form-surface">
            <div className="nl-notice-form">
              <div className="nl-notice-field">
                <FieldLabel required>Title</FieldLabel>
                <ClearableInput
                  value={title}
                  maxLength={TITLE_MAX}
                  disabled={busy}
                  onBlur={() => mark("title")}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    mark("title");
                  }}
                  className={inputClass(titleMessage, "nl-input w-full")}
                  placeholder="Brief summary of the technical issue"
                />
                {titleMessage ? <FieldError>{titleMessage}</FieldError> : null}
              </div>

              <div className="nl-notice-field">
                <FieldLabel required>Technical issue category</FieldLabel>
                <ThemedSelect
                  value={category}
                  onChange={(value) => {
                    setCategory(value);
                    mark("category");
                  }}
                  disabled={busy}
                  placeholder="Choose a category"
                  options={categoryOptions}
                  error={categoryMessage}
                />
                {category && TECHNICAL_CATEGORY_HINTS[category] ? (
                  <p className="nl-notice-schedule-note">{TECHNICAL_CATEGORY_HINTS[category]}</p>
                ) : null}
                {categoryMessage ? <FieldError>{categoryMessage}</FieldError> : null}
              </div>

              <div className="nl-notice-field">
                <FieldLabel required>Description</FieldLabel>
                <ClearableTextarea
                  value={description}
                  maxLength={DESCRIPTION_MAX}
                  disabled={busy}
                  rows={4}
                  onBlur={() => mark("description")}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    mark("description");
                  }}
                  className={inputClass(descriptionMessage, "nl-input nl-notice-textarea w-full resize-none")}
                  placeholder="Describe what happened, when it started, and any steps to reproduce"
                />
                {descriptionMessage ? <FieldError>{descriptionMessage}</FieldError> : null}
              </div>

              <div className="nl-notice-field">
                <FieldLabel required>Priority</FieldLabel>
                <ThemedSelect
                  value={priority}
                  onChange={(value) => setPriority(value as ComplaintRecord["priority"])}
                  disabled={busy}
                  options={priorityOptions}
                />
              </div>

              <div className="nl-notice-field">
                <FieldLabel>Attachments</FieldLabel>
                <p className="nl-notice-schedule-note">Optional · PDF, Word, or images · Up to 5 files, 10 MB each</p>
                {files.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {files.map((file) => (
                      <button
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        type="button"
                        disabled={busy}
                        onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                      >
                        {file.name} ×
                      </button>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={busy || files.length >= 5}
                  onClick={() => fileRef.current?.click()}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[13px] font-semibold text-[#1B4F8A] hover:bg-slate-50 disabled:opacity-60"
                >
                  <Paperclip className="h-4 w-4" strokeWidth={2} />
                  Add attachment
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(event) => pickFiles(event.target.files)}
                />
              </div>
            </div>
          </div>
        </div>

        <footer className="nl-notice-modal-foot">
          <button type="button" onClick={close} disabled={busy} className="nl-btn-ghost">
            Cancel
          </button>
          <div className="nl-notice-modal-foot-actions">
            <button type="button" disabled={!canSubmit} onClick={() => void submit()} className="nl-btn-primary disabled:opacity-60">
              {busy ? "Submitting…" : "Submit"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}