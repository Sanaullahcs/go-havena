"use client";

import type { ReactNode } from "react";
import { Building2, Check, FileText, Mail, Phone, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  icon: Icon,
  wrap = false,
}: {
  label: string;
  value: string;
  empty: string;
  icon: LucideIcon;
  wrap?: boolean;
}) {
  const filled = value.trim().length > 0;
  const display = filled ? value : empty;
  return (
    <div className="flex min-w-0 items-start gap-2.5 py-1.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F4F8FC] text-[#1B4F8A]">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
        <p
          className={[
            "mt-0.5 text-[13px] leading-snug",
            filled ? "font-medium text-slate-800" : "text-slate-400",
            wrap ? "whitespace-normal [overflow-wrap:break-word]" : "truncate",
          ].join(" ")}
          title={filled ? value : undefined}
        >
          {display}
        </p>
      </div>
    </div>
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
      <div className="overflow-hidden rounded-2xl border border-[#E3ECF6] bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-[#E3ECF6] bg-[#F7FAFE] px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1B4F8A]">Live summary</p>
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              acceptedTerms ? "bg-[#E7F6F2] text-[#0D9488]" : "bg-slate-100 text-slate-500",
            ].join(" ")}
          >
            {acceptedTerms ? "Complete" : "In progress"}
          </span>
        </div>

        <div className="space-y-3 px-3.5 py-3">
          <SummaryGroup title="Contact">
            <SummaryRow label="Name" value={fullName} empty="Not added" icon={UserRound} />
            <SummaryRow label="Email" value={email} empty="Not added" icon={Mail} wrap />
            <SummaryRow label="Phone" value={phoneDisplay} empty="Not added" icon={Phone} />
          </SummaryGroup>

          {showDetails ? (
            <SummaryGroup title="Details">
              {showOfficeAddress ? (
                <SummaryRow label="Office" value={officeAddress} empty="Not added" icon={Building2} wrap />
              ) : null}
              {showUnitNumber ? <SummaryRow label="Unit" value={unitNumber} empty="Not added" icon={Building2} /> : null}
              {showResidenceType ? <SummaryRow label="Type" value={residenceLabel} empty="Not added" icon={UserRound} /> : null}
            </SummaryGroup>
          ) : null}

          {showUtilityBill ? (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">File</p>
              {hasUtility ? (
                <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[#E3ECF6] bg-[#F7FAFE] px-2.5 py-2">
                  {utilityThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={utilityThumb}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#1B4F8A]">
                      <FileText className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-800" title={utilityName}>
                      {utilityName}
                    </p>
                    {utilitySize ? <p className="text-[11px] text-slate-500">{utilitySize}</p> : null}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-[#D5E3F2] bg-[#F7FAFE] px-3 py-2.5 text-[12px] text-slate-500">
                  No file yet
                </p>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Terms</span>
            <span
              className={[
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                acceptedTerms ? "bg-[#E7F6F2] text-[#0D9488]" : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              {acceptedTerms ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
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