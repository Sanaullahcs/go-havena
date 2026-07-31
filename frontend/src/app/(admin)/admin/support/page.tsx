"use client";

import { useMemo, useState } from "react";
import { toastSuccess } from "@/lib/alert";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { validateSupportForm } from "@/lib/admin/support-form-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";

/* ─── Data ─── */

const FAQS = [
  {
    q: "How do I approve or suspend a member?",
    a: "Go to Members in the sidebar. Use the action buttons on any member row — 'Approve' to activate their account or 'Suspend' to temporarily restrict access. Both actions require confirmation.",
  },
  {
    q: "How do I publish a community notice?",
    a: "Navigate to Notices, click 'Create Notice', fill in the title, category, and content, then click 'Publish Now'. Published notices are immediately visible to all residents.",
  },
  {
    q: "How do moderation reports work?",
    a: "Reports filed by residents appear in the Moderation tab. You can Resolve (close the report) or Escalate (flag for higher review). All actions are logged in Activity Logs.",
  },
  {
    q: "Where can I find system and user activity?",
    a: "The Activity Logs page (in the Logs section of the sidebar) records all user actions and system events. You can filter by type, severity, and search by user or action.",
  },
  {
    q: "How do I manage marketplace listings?",
    a: "Under Marketplace, you can approve or reject resident listings. Use 'Add Listing' to post an official listing. All pending listings are shown by default.",
  },
  {
    q: "How do I send a message to a resident?",
    a: "Use the Messages section to start or continue a conversation. Search by name or unit number to find the resident quickly.",
  },
];

const CONTACTS = [
  {
    label: "Technical Support",
    value: "support@neighborlink.app",
    note: "Response within 4 hours",
    icon: <IcoMail />,
    color: "blue",
  },
  {
    label: "Billing Inquiries",
    value: "billing@neighborlink.app",
    note: "Mon–Fri, 9 AM – 6 PM",
    icon: <IcoCard />,
    color: "violet",
  },
  {
    label: "Emergency Hotline",
    value: "+1 (800) 555-0199",
    note: "24/7 for critical issues",
    icon: <IcoPhone />,
    color: "rose",
  },
];

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", border: "border-violet-100" },
  rose: { bg: "bg-rose-50", text: "text-rose-600", border: "border-rose-100" },
};

/* ─── Component ─── */

export default function AdminSupportPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState({ subject: "", category: "general", message: "" });
  const [sending, setSending] = useState(false);
  const { touch, clearError, showError, validateOnSubmit } = useTouchedFieldErrors();

  const liveErrors = useMemo(() => validateSupportForm(form), [form]);
  const canSend = !hasFieldErrors(liveErrors);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateOnSubmit(liveErrors)) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 800));
    setSending(false);
    setForm({ subject: "", category: "general", message: "" });
    toastSuccess("Message sent — our team will reply within 4 hours.");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 lg:p-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 px-8 py-10 text-white shadow-lg">
        <div className="relative z-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold tracking-wide">
            <IcoSupport />
            Help Center
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">How can we help you?</h1>
          <p className="mt-2 max-w-lg text-[14px] text-blue-100">
            Browse frequently asked questions or send us a message. Our admin support team responds within 4 hours on business days.
          </p>
        </div>
        {/* Decorative circles */}
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" aria-hidden />
        <div className="absolute -bottom-14 right-20 h-64 w-64 rounded-full bg-white/5" aria-hidden />
      </div>

      {/* Contact cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CONTACTS.map((c) => {
          const cls = colorMap[c.color];
          return (
            <div
              key={c.label}
              className={`rounded-2xl border ${cls.border} ${cls.bg} p-5`}
            >
              <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ${cls.text}`}>
                {c.icon}
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</p>
              <p className="mt-0.5 text-[14px] font-semibold text-slate-900">{c.value}</p>
              <p className="mt-0.5 text-[12px] text-slate-500">{c.note}</p>
            </div>
          );
        })}
      </div>

      {/* Two-column: FAQ + Contact form */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* FAQ accordion */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[15px] font-bold text-slate-900">Frequently Asked Questions</h2>
          <div className="space-y-2">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} className="rounded-xl border border-slate-100 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[13px] font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    <span>{faq.q}</span>
                    <span
                      className="shrink-0 text-slate-400 transition-transform duration-200"
                      style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      <IcoChevron />
                    </span>
                  </button>
                  <div
                    style={{
                      maxHeight: isOpen ? "200px" : "0px",
                      overflow: "hidden",
                      transition: "max-height 260ms cubic-bezier(0.4,0,0.2,1)",
                    }}
                  >
                    <p className="px-4 pb-4 pt-1 text-[13px] leading-relaxed text-slate-500">
                      {faq.a}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contact form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-[15px] font-bold text-slate-900">Send a Message</h2>
          <p className="mb-5 text-[12px] text-slate-400">Can't find an answer? We'll get back to you shortly.</p>

          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="nl-label mb-1.5">Subject</label>
              <input
                className={inputClass(showError("subject", liveErrors), "nl-input w-full")}
                placeholder="Brief description of your issue"
                value={form.subject}
                onChange={(e) => {
                  clearError("subject");
                  setForm((f) => ({ ...f, subject: e.target.value }));
                }}
                onBlur={() => touch("subject")}
              />
              {showError("subject", liveErrors) ? (
                <p className="mt-1 text-xs text-red-600">{showError("subject", liveErrors)}</p>
              ) : null}
            </div>

            <div>
              <label className="nl-label mb-1.5">Category</label>
              <select
                className="nl-input nl-select w-full"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="general">General Inquiry</option>
                <option value="technical">Technical Issue</option>
                <option value="billing">Billing</option>
                <option value="members">Member Management</option>
                <option value="moderation">Moderation</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="nl-label mb-1.5">Message</label>
              <textarea
                className={inputClass(showError("message", liveErrors), "nl-input w-full resize-none")}
                rows={5}
                placeholder="Describe your issue in detail..."
                value={form.message}
                onChange={(e) => {
                  clearError("message");
                  setForm((f) => ({ ...f, message: e.target.value }));
                }}
                onBlur={() => touch("message")}
              />
              {showError("message", liveErrors) ? (
                <p className="mt-1 text-xs text-red-600">{showError("message", liveErrors)}</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={sending || !canSend}
              className="nl-btn-primary w-full justify-center disabled:opacity-60"
            >
              {sending ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Sending…
                </span>
              ) : (
                "Send Message"
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Status banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <p className="text-[13px] font-medium text-emerald-800">
          All systems operational — NeighborLink platform is running smoothly.
        </p>
        <a
          href="https://status.neighborlink.app"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto shrink-0 text-[12px] font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
        >
          Status page
        </a>
      </div>
    </div>
  );
}

/* ─── Icons ─── */

function IcoSupport() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 6.5a1.5 1.5 0 013 .5c0 1-1.5 1.5-1.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="12" r="0.65" fill="currentColor" />
    </svg>
  );
}

function IcoChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoMail() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 8l10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IcoCard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IcoPhone() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2a1 1 0 011.1-.2c1.2.5 2.5.7 3.8.7a1 1 0 011 1V20a1 1 0 01-1 1C9.6 21 3 14.4 3 6.3a1 1 0 011-1H7a1 1 0 011 1c0 1.4.2 2.7.7 3.8a1 1 0 01-.2 1.1l-1.9 1.6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
