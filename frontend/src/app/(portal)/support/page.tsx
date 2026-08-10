"use client";

import { useState } from "react";
import { toastSuccess } from "@/lib/alert";

/* ─── Data ─── */

const FAQS = [
  {
    q: "How do I submit a maintenance request?",
    a: "Go to Property in the sidebar, then click the 'Book Now' button on any bookable amenity, or contact the admin through the Messages section for urgent maintenance needs.",
  },
  {
    q: "How do I renew my lease?",
    a: "Contact the property management office directly via the Messages section or call the hotline below. You'll receive a reminder notification 60 days before your lease expires.",
  },
  {
    q: "How do I post in the Community Feed?",
    a: "Navigate to Community Feed in the sidebar. Use the post composer at the top to share text, images, or event announcements. All posts are reviewed by moderators.",
  },
  {
    q: "How do I list an item in the Marketplace?",
    a: "Open the Marketplace page and click 'Post a Listing'. Fill in your item details including type, price, and description. Your listing will be visible to all community residents.",
  },
  {
    q: "How do I update my profile information?",
    a: "Click your avatar in the top-right corner and select 'My Profile'. From there you can update your display name, contact details, and profile photo.",
  },
  {
    q: "How do I report a community issue?",
    a: "Use the Community Feed to post a concern (visible to all) or send a direct message to the admin team via the Messages section for private matters.",
  },
];

const CONTACTS = [
  {
    label: "Resident Support",
    value: "residents@havena.app",
    note: "Response within 24 hours",
    icon: <IcoMail />,
    color: "emerald",
  },
  {
    label: "Maintenance Line",
    value: "+1 (800) 555-0188",
    note: "Mon–Fri, 8 AM – 8 PM",
    icon: <IcoWrench />,
    color: "amber",
  },
  {
    label: "Emergency Contact",
    value: "+1 (800) 555-0199",
    note: "24/7 for urgent issues",
    icon: <IcoPhone />,
    color: "rose",
  },
];

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-100" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-100" },
  rose: { bg: "bg-rose-50", text: "text-rose-600", border: "border-rose-100" },
};

/* ─── Component ─── */

export default function PortalSupportPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState({ subject: "", category: "general", message: "" });
  const [sending, setSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 800));
    setSending(false);
    setForm({ subject: "", category: "general", message: "" });
    toastSuccess("Message sent — we'll get back to you within 24 hours.");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 lg:p-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 px-8 py-10 text-white shadow-lg">
        <div className="relative z-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold tracking-wide">
            <IcoSupport />
            Help Center
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">How can we help you?</h1>
          <p className="mt-2 max-w-lg text-[14px] text-emerald-100">
            Browse answers to common questions or reach out to our resident support team. We're here to make your living experience seamless.
          </p>
        </div>
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" aria-hidden />
        <div className="absolute -bottom-14 right-20 h-64 w-64 rounded-full bg-white/5" aria-hidden />
      </div>

      {/* Contact cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CONTACTS.map((c) => {
          const cls = colorMap[c.color];
          return (
            <div key={c.label} className={`rounded-2xl border ${cls.border} ${cls.bg} p-5`}>
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
          <p className="mb-5 text-[12px] text-slate-400">Can't find an answer? We'll get back to you within 24 hours.</p>

          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="nl-label mb-1.5">Subject</label>
              <input
                className="nl-input w-full"
                placeholder="Brief description of your issue"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="nl-label mb-1.5">Category</label>
              <select
                className="nl-input nl-select w-full"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="general">General Inquiry</option>
                <option value="maintenance">Maintenance Request</option>
                <option value="lease">Lease & Payments</option>
                <option value="noise">Noise / Dispute</option>
                <option value="amenities">Amenities & Bookings</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="nl-label mb-1.5">Message</label>
              <textarea
                className="nl-input w-full resize-none"
                rows={5}
                placeholder="Describe your issue or question in detail..."
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                required
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white shadow-sm transition"
              style={{ background: "#1B4F8A" }}
            >
              {sending ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Sending…
                </>
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
          Community portal is online — Sunflower Heights Estate services are running normally.
        </p>
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

function IcoWrench() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3-3a6 6 0 01-7.5 7.5l-4.3 4.3a1.5 1.5 0 01-2.1-2.1l4.3-4.3a6 6 0 017.5-7.5l-3 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
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
