"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toastSuccess, toastError } from "@/lib/alert";
import type { MemberInviteResult } from "@/lib/api/members";

type Props = {
  result: MemberInviteResult;
  onClose: () => void;
};

function IcoCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IcoDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" />
      <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
    </svg>
  );
}

export function MemberInviteResultModal({ result, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(result.invite_qr_value || result.invite_code, {
      width: 200,
      margin: 2,
      color: { dark: "#1B4F8A", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [result.invite_code, result.invite_qr_value]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(result.invite_code);
      toastSuccess("Invite code copied");
    } catch {
      toastError("Could not copy code");
    }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `havena-invite-${result.invite_code}.png`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/45 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
        <div className="my-auto flex w-full max-w-md max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-8rem)]">
          {/* Header */}
          <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 to-white px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <IcoCheck />
              </div>
              <div className="min-w-0 pt-0.5">
                <h3 className="text-[16px] font-bold text-slate-900">Invitation sent</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                  Share this invite code and QR with{" "}
                  <span className="font-medium text-slate-700">{result.member_name ?? "the resident"}</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6 sm:px-7 sm:py-7">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-5 py-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Invite code</p>
              <p className="mt-2 font-mono text-xl font-bold tracking-[0.12em] text-slate-900">{result.invite_code}</p>
              <button
                type="button"
                onClick={copyCode}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-blue-600 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <IcoCopy />
                Copy code
              </button>
            </div>

            <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-5">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code for invite ${result.invite_code}`}
                  className="h-[200px] w-[200px] rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
                />
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-[12px] text-slate-400">
                  Generating QR…
                </div>
              )}
              <button
                type="button"
                disabled={!qrDataUrl}
                onClick={downloadQr}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 transition hover:text-blue-700 disabled:opacity-50"
              >
                <IcoDownload />
                Download QR image
              </button>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-4 text-[12.5px] leading-relaxed text-slate-700">
              <p>
                The resident can open <strong>Havena → Enter Invite Code</strong>{" "}
                (<strong className="font-mono">{result.invite_code}</strong>) manually or scan this QR code.
              </p>
              {result.community_name ? (
                <p className="mt-2.5 text-slate-600">
                  <span className="font-medium text-slate-700">Community:</span> {result.community_name}
                </p>
              ) : null}
              {result.temp_password ? (
                <p className="mt-2.5 text-slate-600">
                  <span className="font-medium text-slate-700">Temporary password (if needed):</span>{" "}
                  <span className="font-mono text-[12px]">{result.temp_password}</span>
                </p>
              ) : null}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-100 bg-slate-50/50 px-6 py-5 sm:px-7 sm:py-6">
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="nl-btn-primary min-w-[100px]">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
