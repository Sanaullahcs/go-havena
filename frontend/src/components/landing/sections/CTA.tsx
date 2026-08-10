"use client";

import { useState } from "react";
import { Icon, type IconName } from "../icons/Icon";
import { Container } from "../ui/Container";
import { site } from "@/lib/landing/site";
import { submitContact, type ContactRole } from "@/lib/api/contact";
import { apiError } from "@/lib/api/client";
import axios from "axios";

type Role = ContactRole;

const ROLES: { id: Role; label: string; icon: IconName }[] = [
  { id: "resident", label: "Resident", icon: "home" },
  { id: "admin", label: "Community admin", icon: "users" },
  { id: "other", label: "Other", icon: "message-circle" },
];

const CONTACT_POINTS = [
  {
    icon: "mail" as const,
    label: "Email",
    value: site.contactEmail,
    href: `mailto:${site.contactEmail}`,
  },
  {
    icon: "phone" as const,
    label: "Phone",
    value: site.contactPhone,
    href: `tel:${site.contactPhone.replace(/\D/g, "")}`,
  },
  {
    icon: "clock" as const,
    label: "Response",
    value: "Within 1 business day",
  },
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
      <div className="lp-contact__form lp-contact__form--success">
        <span className="lp-contact__success-icon">
          <Icon name="check-circle" className="h-7 w-7" />
        </span>
        <h3 className="lp-contact__success-title">Message sent</h3>
        <p className="lp-contact__success-body">
          Thanks {name.split(" ")[0]}, we&apos;ll reply at{" "}
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
          className="lp-contact__again"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="lp-contact__form">
      <p className="lp-contact__form-label">Send a message</p>

      <fieldset className="mt-5">
        <legend className="contact-field-label">I am a…</legend>
        <div className="lp-contact__roles mt-2">
          {ROLES.map((r) => {
            const selected = role === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                aria-pressed={selected}
                className={["lp-contact__role", selected ? "is-active" : ""].join(" ")}
              >
                <Icon name={r.icon} className="h-4 w-4 shrink-0" />
                {r.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
      </div>

      <label className="contact-field mt-4 block">
        <span className="contact-field-label">
          Community <span className="font-normal text-ink-muted">(optional)</span>
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

      <label className="contact-field mt-4 block">
        <span className="contact-field-label">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your community…"
          rows={4}
          className="contact-field-textarea"
        />
      </label>

      {error ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button type="submit" className="contact-form-submit mt-6 w-full" disabled={submitting}>
        <span>{submitting ? "Sending…" : "Send message"}</span>
        <Icon name="arrow-right" className="h-4 w-4" />
      </button>
    </form>
  );
}

export function CTA() {
  return (
    <section id="contact" className="lp-section lp-contact scroll-mt-28">
      <Container size="xl">
        <div className="lp-contact__grid">
          <div className="lp-contact__intro">
            <p className="lp-label">Contact</p>
            <h2 className="lp-title">Let&apos;s talk about your community</h2>
            <p className="lp-body mt-4">
              Whether you&apos;re a resident, board member, or property manager — we&apos;re here to
              help you get started with Havena.
            </p>

            <ul className="lp-contact__points">
              {CONTACT_POINTS.map((point) => (
                <li key={point.label}>
                  {point.href ? (
                    <a href={point.href} className="lp-contact__point">
                      <span className="lp-contact__point-icon">
                        <Icon name={point.icon} className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="lp-contact__point-label">{point.label}</span>
                        <span className="lp-contact__point-value">{point.value}</span>
                      </span>
                    </a>
                  ) : (
                    <div className="lp-contact__point">
                      <span className="lp-contact__point-icon">
                        <Icon name={point.icon} className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="lp-contact__point-label">{point.label}</span>
                        <span className="lp-contact__point-value">{point.value}</span>
                      </span>
                    </div>
                  )}
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
