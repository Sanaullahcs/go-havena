"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../icons/Icon";
import { Container } from "../ui/Container";
import { actionLinks } from "@/lib/landing/site";
import { submitContact, type ContactRole } from "@/lib/api/contact";
import { apiError } from "@/lib/api/client";
import axios from "axios";

type Role = ContactRole;

const ROLES: { id: Role; label: string; icon: IconName }[] = [
  { id: "resident", label: "Resident", icon: "home" },
  { id: "admin", label: "Community admin", icon: "users" },
  { id: "other", label: "Other", icon: "message-circle" },
];

function ContactForm() {
  const [role, setRole] = useState<Role>("resident");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [community, setCommunity] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Please fill in your name, email, and message.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await submitContact({
        role,
        name: name.trim(),
        email: email.trim(),
        community: community.trim() || undefined,
        message: message.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 422) {
        const data = err.response.data as { errors?: Record<string, string[]> };
        const first = data.errors ? Object.values(data.errors)[0]?.[0] : undefined;
        setError(first ?? apiError(err));
      } else {
        setError(apiError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="contact-form-card relative overflow-hidden rounded-[28px] border border-border-card bg-white p-8 shadow-elevated sm:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl"
        />
        <div className="relative text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Icon name="check-circle" className="h-7 w-7" />
          </span>
          <h3 className="mt-5 text-[22px] font-bold text-ink-primary">Message sent!</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-body">
            Thanks {name.split(" ")[0]}, we&apos;ll get back to you at{" "}
            <span className="font-semibold text-brand-deep">{email}</span> soon.
          </p>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setName("");
              setEmail("");
              setCommunity("");
              setMessage("");
            }}
            className="mt-6 text-[13px] font-semibold text-brand-deep hover:underline"
          >
            Send another message
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="contact-form-card relative overflow-hidden rounded-[28px] border border-border-card bg-white p-6 shadow-elevated sm:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-brand-deep/5 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-indigo-400/10 blur-2xl"
      />

      <div className="relative">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-brand-deep">
            <Icon name="send" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-deep">Contact us</p>
            <h3 className="text-[18px] font-bold text-ink-primary">Tell us about your community</h3>
          </div>
        </div>

        <fieldset className="mt-6">
          <legend className="sr-only">I am a</legend>
          <p className="mb-2.5 text-[12px] font-semibold text-ink-muted">I am a…</p>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-semibold transition-all duration-200",
                  role === r.id
                    ? "border-brand-deep/30 bg-brand-soft text-brand-deep shadow-sm"
                    : "border-border-subtle bg-white text-ink-body hover:border-brand-deep/20",
                ].join(" ")}
              >
                <Icon name={r.icon} className="h-3.5 w-3.5" />
                {r.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 space-y-3.5">
          <label className="contact-field block">
            <span className="contact-field-label">Full name</span>
            <span className="contact-field-input-wrap">
              <Icon name="user" className="contact-field-icon h-4 w-4" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sarah Chen"
                autoComplete="name"
                className="contact-field-input"
              />
            </span>
          </label>

          <label className="contact-field block">
            <span className="contact-field-label">Email</span>
            <span className="contact-field-input-wrap">
              <Icon name="mail" className="contact-field-icon h-4 w-4" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@community.com"
                autoComplete="email"
                className="contact-field-input"
              />
            </span>
          </label>

          <label className="contact-field block">
            <span className="contact-field-label">
              Community / organization{" "}
              <span className="font-normal text-ink-muted">(optional)</span>
            </span>
            <span className="contact-field-input-wrap">
              <Icon name="map-pin" className="contact-field-icon h-4 w-4" />
              <input
                type="text"
                value={community}
                onChange={(e) => setCommunity(e.target.value)}
                placeholder="Greenwood HOA"
                className="contact-field-input"
              />
            </span>
          </label>

          <label className="contact-field block">
            <span className="contact-field-label">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can we help your neighborhood?"
              rows={3}
              className="contact-field-textarea"
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 text-[13px] font-medium text-rose-600" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="contact-form-submit mt-5 w-full" disabled={submitting}>
          <span>{submitting ? "Sending…" : "Send message"}</span>
          <Icon name="arrow-right" className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

export function CTA() {
  return (
    <section id="contact" className="relative scroll-mt-24 overflow-x-clip py-16 sm:py-20 lg:py-24">
      <div aria-hidden="true" className="soft-section absolute inset-0 -z-10" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-1/2 -z-10 h-80 w-80 -translate-y-1/2 rounded-full bg-[#14B8A6]/6 blur-3xl"
      />

      <Container size="xl">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <span className="section-label">Get in touch</span>
            <h2 className="section-title mt-4">
              Ready to build a stronger,{" "}
              <span className="gradient-text">connected community?</span>
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink-body sm:text-[16px]">
              Join neighborhoods already using Havena to stay informed, engaged, and connected without
              the noise.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button href={actionLinks.signUp} variant="primary" size="lg" iconTrailing="arrow-right">
                Get started free
              </Button>
              <Button href={actionLinks.login} variant="secondary" size="lg">
                Log in
              </Button>
            </div>

            <ul className="mt-10 space-y-3">
              {[
                { icon: "shield-check" as const, text: "Verified, private communities" },
                { icon: "phone" as const, text: "Mobile app + web dashboard" },
                { icon: "zap" as const, text: "Live in minutes, not months" },
              ].map((item) => (
                <li key={item.text} className="flex items-center gap-2.5 text-[14px] text-ink-body">
                  <Icon name={item.icon} className="h-4 w-4 shrink-0 text-brand-deep" />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          <ContactForm />
        </div>
      </Container>
    </section>
  );
}

export default CTA;
