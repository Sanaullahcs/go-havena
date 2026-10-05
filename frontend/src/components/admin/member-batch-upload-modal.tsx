"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { toastError } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  commitMemberBatch,
  downloadCsv,
  memberBatchTemplateCsv,
  previewMemberBatch,
  type MemberBatchPreview,
  type MemberBatchResult,
} from "@/lib/api/members";

type Step = "upload" | "preview" | "summary";

function countPhrase(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function rowIssues(row: { errors: string[]; issues?: { field: string; message: string }[] }) {
  if (row.issues && row.issues.length > 0) return row.issues;
  return row.errors.map((message) => ({ field: fieldForMessage(message), message }));
}

function fieldForMessage(message: string) {
  const text = message.toLowerCase();
  if (text.includes("email")) return "Email";
  if (text.includes("phone")) return "Phone Number";
  if (text.includes("unit") || text.includes("apartment")) return "Unit / Apartment";
  if (text.includes("residence")) return "Residence Type";
  if (text.includes("name")) return "Name";
  return "Record";
}

function isCsvFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".csv") || file.type === "text/csv" || file.type === "application/vnd.ms-excel";
}

function InvalidRecordList({
  rows,
}: {
  rows: { row: number; name: string; email: string; errors: string[]; issues?: { field: string; message: string }[] }[];
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.row} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          <p className="font-semibold">
            Row {row.row}, {row.name || "Unnamed"}
            {row.email ? <span className="font-medium text-red-800"> · {row.email}</span> : null}
          </p>
          <ul className="mt-1 space-y-0.5">
            {rowIssues(row).map((issue) => (
              <li key={`${row.row}-${issue.field}-${issue.message}`} className="text-[13px]">
                <span className="font-semibold">{issue.field}:</span> {issue.message}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function MemberBatchUploadModal({
  open,
  onClose,
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MemberBatchPreview | null>(null);
  const [result, setResult] = useState<MemberBatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setResult(null);
    setBusy(false);
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const close = () => {
    reset();
    onClose();
  };

  const acceptFile = (next: File | null | undefined) => {
    if (!next) return;
    if (!isCsvFile(next)) {
      toastError("Please choose a CSV file.");
      return;
    }
    setFile(next);
  };

  const validateFile = async () => {
    if (!file) {
      toastError("Choose a CSV file to upload.");
      return;
    }
    setBusy(true);
    try {
      const res = await previewMemberBatch(file);
      setPreview(res.data);
      setStep("preview");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const sendInvites = async () => {
    if (!file || !preview || preview.valid_count === 0) return;
    setBusy(true);
    try {
      const res = await commitMemberBatch(file);
      setResult(res.data);
      setStep("summary");
      onCompleted();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 nl-modal-backdrop bg-slate-900/45 backdrop-blur-sm"
        onClick={close}
        aria-label="Close dialog"
      />
      <div
        className="relative flex max-h-[min(92dvh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-modal-in"
        role="dialog"
        aria-labelledby="batch-upload-title"
        aria-modal="true"
      >
        <div className="flex items-start gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1B4F8A] to-[#0D9488] text-white shadow-sm shadow-teal-500/20">
            <FileSpreadsheet className="h-5 w-5" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="batch-upload-title" className="text-lg font-bold text-slate-900">
              Batch Upload Members
            </h3>
            <p className="mt-0.5 text-sm leading-snug text-slate-500">
              Download the template, add residents, then review entries before importing them into Members.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {step === "upload" ? (
            <>
              <section className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Step 1</p>
                <p className="mt-1 text-sm font-medium text-slate-800">Get the CSV template</p>
                <button
                  type="button"
                  className="nl-btn-secondary mt-3"
                  onClick={() => downloadCsv("havena-members-template.csv", memberBatchTemplateCsv())}
                >
                  <Download strokeWidth={2} aria-hidden />
                  Download CSV Template
                </button>
              </section>

              <section className="rounded-xl border border-slate-200/80 bg-white px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Step 2</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Prepare your file</p>
                <div className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-800">Required columns:</span> Full Name, Email Address,
                    Phone Number, Unit / Apartment, and Residence Type.
                  </p>
                  <ul className="list-disc space-y-1.5 pl-5">
                    <li>Valid rows will be added as residents. Invitations can be sent later from the Members list.</li>
                    <li>Residence Type must be either Homeowner or Tenant.</li>
                    <li>Include the country code in phone numbers (for example: +12025550123).</li>
                  </ul>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200/80 bg-white px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Step 3</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Upload your CSV</p>
                <div
                  className={[
                    "mt-3 flex flex-col gap-3 rounded-xl border-2 border-dashed px-4 py-5 transition sm:flex-row sm:items-center sm:justify-between",
                    dragOver
                      ? "border-teal-400 bg-teal-50/60"
                      : "border-teal-200/80 bg-[#F0FDFA]/50",
                  ].join(" ")}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setDragOver(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    acceptFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  <label className="nl-btn-primary inline-flex w-fit cursor-pointer focus-within:ring-2 focus-within:ring-teal-500/30">
                    <Upload strokeWidth={2} aria-hidden />
                    Choose CSV File
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      onChange={(event) => acceptFile(event.target.files?.[0])}
                    />
                  </label>
                  <div className="min-w-0 flex-1 text-sm">
                    {file ? (
                      <>
                        <p className="truncate font-semibold text-slate-900">{file.name}</p>
                        <p className="mt-0.5 text-slate-500">Ready to validate</p>
                      </>
                    ) : (
                      <p className="text-slate-500">No file selected</p>
                    )}
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {step === "preview" && preview ? (
            <>
              <section className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <h4 className="text-sm font-bold text-emerald-900">Valid records</h4>
                <p className="mt-1 text-sm text-emerald-800">
                  {countPhrase(preview.valid_count, "valid record", "valid records")}
                </p>
                <p className="mt-1 text-xs text-emerald-800">
                  {preview.valid_count > 0
                    ? "These records will be added to Members. Invitations are not sent until you select them."
                    : "No records can be added until the errors below are fixed."}
                </p>
              </section>
              <section className="rounded-xl border border-slate-200/80 bg-white px-4 py-4">
                <h4 className="text-sm font-bold text-slate-900">Records needing correction</h4>
                <p className="mt-1 text-sm text-slate-600">
                  {preview.invalid_count === 1
                    ? "1 record needs correction"
                    : `${preview.invalid_count} records need correction`}
                </p>
                {preview.invalid_count > 0 ? (
                  <div className="mt-3">
                    <InvalidRecordList rows={preview.rows.filter((row) => row.errors.length > 0)} />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">Every row in this file is valid.</p>
                )}
              </section>
            </>
          ) : null}

          {step === "summary" && result ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <p className="text-2xl font-bold text-emerald-800">{result.sent_count}</p>
                  <p className="text-sm text-emerald-800">residents added</p>
                </div>
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                  <p className="text-2xl font-bold text-red-800">{result.failed_count}</p>
                  <p className="text-sm text-red-800">records failed</p>
                </div>
              </div>
              {result.failed.length > 0 ? (
                <section className="rounded-xl border border-slate-200/80 bg-white px-4 py-4">
                  <h4 className="text-sm font-bold text-slate-900">Records not added</h4>
                  <div className="mt-3">
                    <InvalidRecordList rows={result.failed} />
                  </div>
                </section>
              ) : (
                <p className="text-sm text-slate-600">
                  Every valid row was added. Select them in Members to send invitations.
                </p>
              )}
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          {step === "upload" ? (
            <>
              <button type="button" className="nl-btn-secondary" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="nl-btn-primary disabled:opacity-60"
                onClick={() => void validateFile()}
                disabled={busy || !file}
              >
                {busy ? "Validating…" : "Validate File"}
              </button>
            </>
          ) : null}
          {step === "preview" ? (
            <>
              <button type="button" className="nl-btn-secondary" onClick={() => setStep("upload")} disabled={busy}>
                Back
              </button>
              <button
                type="button"
                className="nl-btn-primary disabled:opacity-60"
                onClick={() => void sendInvites()}
                disabled={busy || !preview || preview.valid_count === 0}
              >
                {busy ? "Adding…" : "Add residents"}
              </button>
            </>
          ) : null}
          {step === "summary" ? (
            <button type="button" className="nl-btn-primary" onClick={close}>
              Done
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
