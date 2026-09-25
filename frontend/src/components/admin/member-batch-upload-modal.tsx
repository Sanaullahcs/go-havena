"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";
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

  if (!open) return null;

  const reset = () => {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setResult(null);
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[min(92dvh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Batch upload members</h3>
            <p className="mt-1 text-sm text-slate-500">Download the template, add residents, then review before they are added to Members.</p>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {step === "upload" ? (
            <>
              <button
                type="button"
                className="nl-btn-secondary"
                onClick={() => downloadCsv("havena-members-template.csv", memberBatchTemplateCsv())}
              >
                Download template
              </button>
              <p className="text-sm text-slate-600">
                Columns: Name, Email, Phone Number, Unit / Apartment, Residence Type. Valid rows are added as residents. Invitations are sent later from the Members list.
                Residence Type must be Homeowner or Tenant. Phone numbers should include the country code, for example +12025550123.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="nl-btn-primary cursor-pointer focus-within:ring-2 focus-within:ring-[#1B4F8A]/30">
                  <Upload strokeWidth={2} aria-hidden />
                  Choose CSV File
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <p className={`min-w-0 text-sm ${file ? "font-medium text-slate-800" : "text-slate-500"}`}>
                  {file ? file.name : "No file chosen"}
                </p>
              </div>
            </>
          ) : null}

          {step === "preview" && preview ? (
            <>
              <section className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <h4 className="text-sm font-bold text-emerald-900">Valid Records</h4>
                <p className="mt-1 text-sm text-emerald-800">
                  {countPhrase(preview.valid_count, "valid record", "valid records")}
                </p>
                <p className="mt-1 text-xs text-emerald-800">
                  {preview.valid_count > 0
                    ? "These records will be added to Members. Invitations are not sent until you select them."
                    : "No records can be added until the errors below are fixed."}
                </p>
              </section>
              <section>
                <h4 className="text-sm font-bold text-slate-900">Records Needing Correction</h4>
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
                <>
                  <h4 className="text-sm font-bold text-slate-900">Records not added</h4>
                  <InvalidRecordList rows={result.failed} />
                </>
              ) : (
                <p className="text-sm text-slate-600">Every valid row was added. Select them in Members to send invitations.</p>
              )}
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          {step === "upload" ? (
            <>
              <button type="button" className="nl-btn-secondary" onClick={close} disabled={busy}>Cancel</button>
              <button type="button" className="nl-btn-primary disabled:opacity-60" onClick={() => void validateFile()} disabled={busy || !file}>
                {busy ? "Checking…" : "Validate"}
              </button>
            </>
          ) : null}
          {step === "preview" ? (
            <>
              <button type="button" className="nl-btn-secondary" onClick={() => setStep("upload")} disabled={busy}>Back</button>
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
            <button type="button" className="nl-btn-primary" onClick={close}>Done</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
