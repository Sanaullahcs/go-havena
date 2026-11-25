"use client";

import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import type { PhoneFieldState } from "@/lib/phone/format";
import { formatPhoneDisplay } from "@/lib/phone/format";
import { composePersonName } from "@/lib/admin/person-name";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SummaryRow({
  label,
  value,
  empty,
  clamp = false,
}: {
  label: string;
  value: string;
  empty: string;
  clamp?: boolean;
}) {
  const filled = value.trim().length > 0;
  const display = filled ? value : empty;
  return (
    <p className="grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] items-baseline gap-x-2 py-1 leading-snug">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <span
        className={[
          "min-w-0 text-[12px]",
          filled ? "font-medium text-slate-800" : "italic text-slate-400",
          clamp && filled ? "line-clamp-2 break-all [overflow-wrap:anywhere]" : filled ? "truncate" : "",
        ].join(" ")}
        title={filled ? value : undefined}
      >
        {display}
      </span>
    </p>
  );
}

function isPdfFile(file: File | string | null): boolean {
  if (!file) return false;
  if (typeof file === "string") {
    return file.toLowerCase().split("?")[0].endsWith(".pdf");
  }
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export type CompleteProfileLiveSummaryProps = {
  firstName: string;
  lastName: string;
  email: string;
  phone: PhoneFieldState;
  officeAddress: string;
  unitNumber: string;
  residenceType: string;
  utilityFile: File | null;
  existingUtilityBillUrl: string | null;
  utilityPreviewUrl: string | null;
  acceptedTerms: boolean;
  showOfficeAddress: boolean;
  showUnitNumber: boolean;
  showResidenceType: boolean;
  showUtilityBill: boolean;
  className?: string;
};

export function CompleteProfileLiveSummary({
  firstName,
  lastName,
  email,
  phone,
  officeAddress,
  unitNumber,
  residenceType,
  utilityFile,
  existingUtilityBillUrl,
  utilityPreviewUrl,
  acceptedTerms,
  showOfficeAddress,
  showUnitNumber,
  showResidenceType,
  showUtilityBill,
  className = "",
}: CompleteProfileLiveSummaryProps) {
  const fullName = composePersonName(firstName, lastName);
  const phoneDisplay = phone.e164 ? formatPhoneDisplay(phone.e164) : "";
  const residenceLabel =
    residenceType === "homeowner"
      ? "Homeowner"
      : residenceType === "tenant"
        ? "Tenant"
        : "";

  const hasUtility = Boolean(utilityFile || existingUtilityBillUrl);
  const utilityName = utilityFile?.name ?? (existingUtilityBillUrl ? "Document on file" : "");
  const utilitySize = utilityFile ? formatFileSize(utilityFile.size) : null;
  const utilityIsPdf = utilityFile
    ? isPdfFile(utilityFile)
    : existingUtilityBillUrl
      ? isPdfFile(existingUtilityBillUrl)
      : false;
  const utilityThumb =
    utilityFile && !utilityIsPdf && utilityPreviewUrl
      ? utilityPreviewUrl
      : existingUtilityBillUrl && !utilityIsPdf
        ? existingUtilityBillUrl
        : null;

  const showDetails = showOfficeAddress || showUnitNumber || showResidenceType;

  return (
    <aside
      className={`min-w-0 max-w-full ${className}`}
      aria-label="Live profile summary"
      aria-live="polite"
    >
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Live summary</p>
          <span className="text-[10px] font-medium text-slate-400">
            {acceptedTerms ? "Complete" : "In progress"}
          </span>
        </div>

        <div className="divide-y divide-slate-100 px-3 py-1">
          <SummaryGroup title="Contact">
            <SummaryRow label="Name" value={fullName} empty="—" />
            <SummaryRow label="Email" value={email} empty="—" />
            <SummaryRow label="Phone" value={phoneDisplay} empty="—" />
          </SummaryGroup>

          {showDetails ? (
            <SummaryGroup title="Details">
              {showOfficeAddress ? (
                <SummaryRow label="Office" value={officeAddress} empty="—" clamp />
              ) : null}
              {showUnitNumber ? <SummaryRow label="Unit" value={unitNumber} empty="—" /> : null}
              {showResidenceType ? <SummaryRow label="Type" value={residenceLabel} empty="—" /> : null}
            </SummaryGroup>
          ) : null}

          {showUtilityBill ? (
            <div className="py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">File</p>
              {hasUtility ? (
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                  {utilityThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={utilityThumb}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded border border-slate-200 object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-slate-500">
                      <FileText className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-slate-800" title={utilityName}>
                      {utilityName}
                    </p>
                    {utilitySize ? <p className="text-[10px] text-slate-500">{utilitySize}</p> : null}
                  </div>
                </div>
              ) : (
                <p className="text-[12px] italic text-slate-400">No file yet</p>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 py-2">
            <span className="text-[11px] font-medium text-slate-500">Terms</span>
            <span className="text-[11px] font-medium text-slate-700">
              {acceptedTerms ? "Accepted" : "Not accepted"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SummaryGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-2">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}