"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BadgeCheck, CreditCard, ShieldCheck } from "lucide-react";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { PageLoader, PageError } from "@/components/shared/page-states";
import {
  AgreementSignaturePad,
  type SignaturePadHandle,
} from "@/components/agreements/signature-pad";
import {
  authorizeAgreementFee,
  categoryLabel,
  declineAgreement,
  fetchAgreement,
  signAgreement,
  type Agreement,
} from "@/lib/api/agreements";

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export default function ResidentAgreementDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [row, setRow] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [padEmpty, setPadEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const load = async () => {
    try {
      const data = await fetchAgreement(id);
      setRow(data);
      if (data.signer_name) setSignerName(data.signer_name);
      setError(null);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const authorize = async () => {
    setBusy(true);
    try {
      const res = await authorizeAgreementFee(id);
      setRow(res.data);
      toastSuccess(res.message || "Signature fee authorized.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const sign = async () => {
    if (padRef.current?.isEmpty() || padEmpty) {
      toastError("Draw your signature in the pad.");
      return;
    }
    if (signerName.trim().length < 3) {
      toastError("Type your legal name as it should appear on the certificate.");
      return;
    }
    if (!accepted) {
      toastError("Confirm that this electronic signature is legally binding.");
      return;
    }
    setBusy(true);
    try {
      const res = await signAgreement(id, {
        signer_name: signerName.trim(),
        signature: padRef.current?.toDataURL() ?? "",
        accepted_terms: true,
      });
      setRow(res.data);
      toastSuccess("Your digital signature is on file.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    const ok = await confirmAction({
      title: "Decline this agreement?",
      text: "Management will be able to see that you declined. You can contact the office if this was sent in error.",
      confirmText: "Decline",
      color: "red",
      icon: "warning",
    });
    if (!ok.isConfirmed) return;
    setBusy(true);
    try {
      const res = await declineAgreement(id, declineReason.trim() || undefined);
      setRow(res.data);
      toastSuccess("Agreement declined.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader skeleton />;
  if (error || !row) {
    return <PageError message={error ?? "Agreement not found."} onRetry={() => { setLoading(true); load(); }} />;
  }

  const signed = row.my_status === "signed";
  const declined = row.my_status === "declined";
  const closed = row.status === "closed";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/agreements" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-[#1B4F8A]">
        <ArrowLeft className="h-4 w-4" />
        Back to agreements
      </Link>

      <div>
        <p className="nl-eyebrow">{categoryLabel(row.category)}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{row.title}</h2>
        <p className={`mt-1 text-sm ${row.is_overdue ? "font-semibold text-rose-600" : "text-slate-500"}`}>
          {row.is_overdue ? "Overdue · was due " : row.is_due_soon ? "Due soon · " : "Due "}{formatDate(row.due_at)}
        </p>
        {row.is_required ? (
          <p className="mt-2 text-sm font-semibold text-violet-700">Required — this cannot be declined.</p>
        ) : null}
      </div>

      {row.cover_message ? (
        <div className="rounded-2xl border border-[#1B4F8A]/15 bg-[#E8F0F7] px-5 py-4 text-sm leading-6 text-[#1B4F8A]">
          {row.cover_message}
        </div>
      ) : null}

      <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-[#F8FAFC] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          Community agreement
        </div>
        <div className="px-5 py-6 sm:px-8">
          <p className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700">{row.body}</p>
        </div>
      </article>

      {signed ? (
        <section className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
              <BadgeCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-slate-900">Digital signature certificate</h3>
              <p className="mt-1 text-sm text-slate-600">
                Signed by <span className="font-semibold">{row.signer_name}</span> on {formatDate(row.signed_at, true)}.
              </p>
              {row.certificate_id ? (
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(row.certificate_id ?? "");
                    toastSuccess("Certificate ID copied.");
                  }}
                  className="mt-3 font-mono text-[12px] text-[#1B4F8A] hover:underline"
                >
                  ID {row.certificate_id}
                </button>
              ) : null}
              {row.content_hash ? (
                <p className="mt-1 break-all font-mono text-[11px] text-slate-400">SHA-256 {row.content_hash}</p>
              ) : null}
              {row.signature_url ? (
                <img
                  src={row.signature_url}
                  alt="Your signature"
                  className="mt-4 h-20 w-48 rounded-xl border border-white bg-white object-contain shadow-sm"
                />
              ) : null}
            </div>
          </div>
        </section>
      ) : declined ? (
        <section className="rounded-3xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          You declined this agreement. Contact the management office if you need it reopened.
        </section>
      ) : closed ? (
        <section className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
          This agreement is closed and can no longer be signed.
        </section>
      ) : (
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F0F7] text-[#1B4F8A]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Paid digital signature</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Your drawn signature, legal name, and a SHA-256 certificate are stored with the community file.
                {row.requires_payment
                  ? ` A ${row.signature_fee_label} certificate fee is authorized in-app before you can sign.`
                  : " There is no extra fee for this agreement."}
              </p>
            </div>
          </div>

          {row.needs_payment ? (
            <button type="button" disabled={busy} onClick={authorize} className="nl-btn-primary w-full justify-center">
              <CreditCard className="h-4 w-4" />
              Authorize {row.signature_fee_label} certificate fee
            </button>
          ) : null}

          {row.can_sign ? (
            <>
              <AgreementSignaturePad padRef={padRef} disabled={busy} onChange={setPadEmpty} />
              <label className="block text-sm font-medium text-slate-700">
                Legal name
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Name as it should appear on the certificate"
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1B4F8A]"
                />
              </label>
              <label className="flex items-start gap-2 text-sm leading-6 text-slate-600">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-1"
                />
                I am the named resident and this electronic signature is legally binding for community records.
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={sign} className="nl-btn-primary">
                  Apply digital signature
                </button>
                {row.can_decline ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={decline}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    Decline
                  </button>
                ) : null}
              </div>
              {row.can_decline ? (
                <input
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Optional reason if you decline"
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1B4F8A]"
                />
              ) : (
                <p className="text-xs text-slate-400">Management marked this as required, so it stays in your inbox until you sign.</p>
              )}
            </>
          ) : row.needs_payment ? (
            <p className="text-sm text-slate-500">Authorize the certificate fee to unlock the signature pad.</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
