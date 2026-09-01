"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck2, Check, CheckCircle2, ChevronDown, CircleAlert, Loader2, X } from "lucide-react";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { submitContact } from "@/lib/api/contact";
import { apiError } from "@/lib/api/client";
import {
  emptyPhoneField,
  type PhoneFieldState,
} from "@/lib/phone/format";

const COMMUNITY_SIZES = [
  { value: "", label: "Select community size" },
  { value: "1-50", label: "1–50 residents" },
  { value: "51-200", label: "51–200 residents" },
  { value: "201-500", label: "201–500 residents" },
  { value: "500+", label: "500+ residents" },
  { value: "not-sure", label: "Not sure yet" },
] as const;

const PREFERRED_TIMES = [
  { value: "", label: "Select preferred time" },
  { value: "morning", label: "Weekday morning" },
  { value: "afternoon", label: "Weekday afternoon" },
  { value: "evening", label: "Weekday evening" },
  { value: "flexible", label: "Flexible / anytime" },
] as const;

const INTEREST_ROLES = [
  { value: "admin" as const, label: "Community admin / manager" },
  { value: "other" as const, label: "Board member / other" },
];

type FieldKey =
  | "name"
  | "email"
  | "phone"
  | "community"
  | "size"
  | "preferredTime"
  | "role"
  | "message";

type FieldErrors = Partial<Record<FieldKey, string>>;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function capitalizeName(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function nameFieldError(value: string): string | undefined {
  const nameValue = value.trim();
  if (!nameValue) return "Enter your full name.";
  if (nameValue.length < 2) return "Name looks too short.";
  if (!/^[a-zA-Z][a-zA-Z\s'.-]*$/.test(nameValue)) {
    return "Use letters only. Spaces and hyphens are fine.";
  }
  return undefined;
}

function emailFieldError(value: string): string | undefined {
  const emailValue = value.trim();
  if (!emailValue) return "Enter your work email.";
  if (!isValidEmail(emailValue)) return "That email doesn't look right.";
  return undefined;
}

function communityFieldError(value: string): string | undefined {
  const communityValue = value.trim();
  if (!communityValue) return "Add your community or organization.";
  if (communityValue.length < 2) return "Community name looks too short.";
  return undefined;
}

function phoneFieldError(field: PhoneFieldState): string | undefined {
  if (field.digits && !field.valid) {
    return "Enter a complete phone number, or clear the field.";
  }
  return undefined;
}

function messageFieldError(value: string): string | undefined {
  const messageValue = value.trim();
  if (!messageValue) return "Tell us what you'd like to see in the demo.";
  if (messageValue.length < 10) return "Add a little more detail (at least 10 characters).";
  if (messageValue.length > 2000) return "Keep your note under 2000 characters.";
  return undefined;
}

function FieldLabel({
  children,
  required,
  htmlFor,
}: {
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label className="lp-demo__label" htmlFor={htmlFor}>
      {children}
      {required ? (
        <abbr className="lp-demo__req" title="Required">
          *
        </abbr>
      ) : (
        <em className="lp-demo__optional">optional</em>
      )}
    </label>
  );
}

function SmoothSelect({
  id,
  label,
  required,
  value,
  options,
  error,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  options: readonly { value: string; label: string }[];
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((item) => item.value === value);
  const display = selected?.value ? selected.label : options[0]?.label ?? "Select";

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        onBlur?.();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        onBlur?.();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onBlur]);

  return (
    <div className={`lp-demo__field ${error ? "has-error" : ""}`} ref={rootRef}>
      <FieldLabel required={required} htmlFor={id}>
        {label}
      </FieldLabel>
      <div className={`lp-demo__select ${open ? "is-open" : ""} ${error ? "is-invalid" : ""}`}>
        <button
          id={id}
          type="button"
          className="lp-demo__select-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={error ? true : undefined}
          onClick={() => setOpen((prev) => !prev)}
          onBlur={() => {
            // Delay so option click still registers
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                setOpen(false);
                onBlur?.();
              }
            }, 120);
          }}
        >
          <span className={value ? undefined : "is-placeholder"}>{display}</span>
          <ChevronDown className="lp-demo__select-chevron" aria-hidden />
        </button>

        <div
          id={listId}
          className="lp-demo__select-menu"
          role="listbox"
          aria-hidden={!open}
          hidden={!open}
        >
          {options
            .filter((item) => item.value !== "")
            .map((item) => {
              const active = item.value === value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`lp-demo__select-option ${active ? "is-active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                    onBlur?.();
                  }}
                >
                  <span>{item.label}</span>
                  {active ? <Check className="h-4 w-4" aria-hidden /> : null}
                </button>
              );
            })}
        </div>
      </div>
      {error ? (
        <p className="lp-demo__field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function buildDemoMessage(input: {
  phoneDisplay: string;
  size: string;
  preferredTime: string;
  message: string;
}) {
  const sizeLabel = COMMUNITY_SIZES.find((item) => item.value === input.size)?.label ?? input.size;
  const timeLabel =
    PREFERRED_TIMES.find((item) => item.value === input.preferredTime)?.label ?? input.preferredTime;

  const lines = [
    "[Demo request]",
    input.phoneDisplay ? `Phone: ${input.phoneDisplay}` : null,
    `Community size: ${sizeLabel}`,
    `Preferred time: ${timeLabel}`,
    "",
    input.message.trim(),
  ];

  return lines.filter((line) => line !== null).join("\n");
}

export function DemoRequestForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<PhoneFieldState>(() => emptyPhoneField());
  const [community, setCommunity] = useState("");
  const [size, setSize] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [role, setRole] = useState<"admin" | "other" | "">("admin");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitted, setSubmitted] = useState<{ name: string; email: string } | null>(null);
  const phoneRef = useRef(phone);
  const sizeRef = useRef(size);
  const preferredTimeRef = useRef(preferredTime);
  phoneRef.current = phone;
  sizeRef.current = size;
  preferredTimeRef.current = preferredTime;

  const nameId = useId();
  const emailId = useId();
  const phoneId = useId();
  const communityId = useId();
  const messageId = useId();
  const sizeId = useId();
  const timeId = useId();

  function patchError(key: FieldKey, message?: string) {
    setErrors((prev) => {
      const current = prev[key];
      if (!message && !current) return prev;
      if (message && current === message) return prev;
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  function clearError(key: FieldKey) {
    patchError(key, undefined);
  }

  function validateAll(): FieldErrors {
    const next: FieldErrors = {};
    const nameError = nameFieldError(name);
    const emailError = emailFieldError(email);
    const communityError = communityFieldError(community);
    const phoneError = phoneFieldError(phone);
    const messageError = messageFieldError(message);

    if (nameError) next.name = nameError;
    if (emailError) next.email = emailError;
    if (communityError) next.community = communityError;
    if (phoneError) next.phone = phoneError;
    if (!size) next.size = "Choose an approximate community size.";
    if (!preferredTime) next.preferredTime = "Choose a preferred time for the demo.";
    if (!role) next.role = "Select how you are involved.";
    if (messageError) next.message = messageError;
    return next;
  }

  function markAllTouched() {
    return validateAll();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = markAllTouched();
    setErrors(nextErrors);
    setFormError(null);

    if (Object.keys(nextErrors).length > 0) {
      const count = Object.keys(nextErrors).length;
      setFormError(
        count === 1
          ? "One field still needs attention before we can send your demo request."
          : `${count} fields still need attention before we can send your demo request.`,
      );
      return;
    }

    setSubmitting(true);

    try {
      await submitContact({
        role: role || "admin",
        name: name.trim(),
        email: email.trim(),
        community: community.trim(),
        message: buildDemoMessage({
          phoneDisplay: phone.valid ? phone.e164 : "",
          size,
          preferredTime,
          message,
        }),
      });
      setSubmitted({ name: name.trim(), email: email.trim() });
      setDone(true);
    } catch (err) {
      setFormError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!done) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [done]);

  const firstName = capitalizeName(submitted?.name.split(/\s+/)[0] ?? "");

  return (
    <>
    <form className="lp-demo__form" onSubmit={onSubmit} noValidate aria-hidden={done || undefined}>
      <div className="lp-demo__grid">
        <div className={`lp-demo__field ${errors.name ? "has-error" : ""}`}>
          <FieldLabel required htmlFor={nameId}>
            Full name
          </FieldLabel>
          <input
            id={nameId}
            type="text"
            name="name"
            autoComplete="name"
            placeholder="Jordan Hale"
            value={name}
            aria-invalid={errors.name ? true : undefined}
            onChange={(e) => {
              const value = e.target.value;
              setName(value);
              setFormError(null);
              clearError("name");
            }}
            onBlur={(e) => {
              patchError("name", nameFieldError(e.target.value));
            }}
          />
          {errors.name ? (
            <p className="lp-demo__field-error" role="alert">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div className={`lp-demo__field ${errors.email ? "has-error" : ""}`}>
          <FieldLabel required htmlFor={emailId}>
            Work email
          </FieldLabel>
          <input
            id={emailId}
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@community.org"
            value={email}
            aria-invalid={errors.email ? true : undefined}
            onChange={(e) => {
              const value = e.target.value;
              setEmail(value);
              setFormError(null);
              clearError("email");
            }}
            onBlur={(e) => {
              patchError("email", emailFieldError(e.target.value));
            }}
          />
          {errors.email ? (
            <p className="lp-demo__field-error" role="alert">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div className={`lp-demo__field lp-demo__field--full ${errors.community ? "has-error" : ""}`}>
          <FieldLabel required htmlFor={communityId}>
            Community / organization
          </FieldLabel>
          <input
            id={communityId}
            type="text"
            name="community"
            autoComplete="organization"
            placeholder="Phoenix Tower HOA"
            value={community}
            aria-invalid={errors.community ? true : undefined}
            onChange={(e) => {
              const value = e.target.value;
              setCommunity(value);
              setFormError(null);
              clearError("community");
            }}
            onBlur={(e) => {
              patchError("community", communityFieldError(e.target.value));
            }}
          />
          {errors.community ? (
            <p className="lp-demo__field-error" role="alert">
              {errors.community}
            </p>
          ) : null}
        </div>

        <div className={`lp-demo__field lp-demo__field--full ${errors.phone ? "has-error" : ""}`}>
          <FieldLabel htmlFor={phoneId}>Phone</FieldLabel>
          <AdminPhoneInput
            id={phoneId}
            value={phone.e164}
            showError={Boolean(errors.phone)}
            onChange={(next) => {
              phoneRef.current = next;
              setPhone(next);
              setFormError(null);
              clearError("phone");
            }}
            onBlur={() => {
              patchError("phone", phoneFieldError(phoneRef.current));
            }}
            hint=""
            className="lp-demo__phone"
          />
          {errors.phone ? (
            <p className="lp-demo__field-error" role="alert">
              {errors.phone}
            </p>
          ) : null}
        </div>

        <SmoothSelect
          id={sizeId}
          label="Approximate size"
          required
          value={size}
          options={COMMUNITY_SIZES}
          error={errors.size}
          onChange={(value) => {
            sizeRef.current = value;
            setSize(value);
            setFormError(null);
            patchError("size", value ? undefined : "Choose an approximate community size.");
          }}
          onBlur={() => {
            patchError(
              "size",
              sizeRef.current ? undefined : "Choose an approximate community size.",
            );
          }}
        />

        <SmoothSelect
          id={timeId}
          label="Preferred time"
          required
          value={preferredTime}
          options={PREFERRED_TIMES}
          error={errors.preferredTime}
          onChange={(value) => {
            preferredTimeRef.current = value;
            setPreferredTime(value);
            setFormError(null);
            patchError(
              "preferredTime",
              value ? undefined : "Choose a preferred time for the demo.",
            );
          }}
          onBlur={() => {
            patchError(
              "preferredTime",
              preferredTimeRef.current ? undefined : "Choose a preferred time for the demo.",
            );
          }}
        />
      </div>

      <fieldset className={`lp-demo__role ${errors.role ? "has-error" : ""}`}>
        <legend>
          I am a
          <abbr className="lp-demo__req" title="Required">
            *
          </abbr>
        </legend>
        <div className="lp-demo__role-options">
          {INTEREST_ROLES.map((item) => (
            <label key={item.value} className={role === item.value ? "is-active" : undefined}>
              <input
                type="radio"
                name="role"
                value={item.value}
                checked={role === item.value}
                onChange={() => {
                  setRole(item.value);
                  setFormError(null);
                  clearError("role");
                }}
              />
              {item.label}
            </label>
          ))}
        </div>
        {errors.role ? (
          <p className="lp-demo__field-error" role="alert">
            {errors.role}
          </p>
        ) : null}
      </fieldset>

      <div className={`lp-demo__field lp-demo__field--full ${errors.message ? "has-error" : ""}`}>
        <FieldLabel required htmlFor={messageId}>
          What would you like to see in the demo?
        </FieldLabel>
        <textarea
          id={messageId}
          name="message"
          rows={4}
          placeholder="Tell us about your community, current tools, and what you want to improve…"
          value={message}
          aria-invalid={errors.message ? true : undefined}
          onChange={(e) => {
            const value = e.target.value;
            setMessage(value);
            setFormError(null);
            clearError("message");
          }}
          onBlur={(e) => {
            patchError("message", messageFieldError(e.target.value));
          }}
        />
        <div className="lp-demo__field-meta">
          {errors.message ? (
            <p className="lp-demo__field-error" role="alert">
              {errors.message}
            </p>
          ) : (
            <span />
          )}
          <span className="lp-demo__counter">{message.trim().length}/2000</span>
        </div>
      </div>

      {formError ? (
        <div className="lp-demo__error" role="alert">
          <CircleAlert className="lp-demo__error-icon" aria-hidden />
          <div>
            <strong>Almost there</strong>
            <p>{formError}</p>
          </div>
        </div>
      ) : null}

      <div className="lp-demo__actions">
        <button type="submit" className="lp-btn-primary lp-demo__submit" disabled={submitting || done}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            <>
              <CalendarCheck2 className="h-4 w-4" aria-hidden />
              Request demo
            </>
          )}
        </button>
        <p className="lp-demo__note">
          Already ready to start?{" "}
          <Link href="/register">Create a community admin account</Link>
        </p>
      </div>
    </form>

    {done && submitted ? (
      <div className="lp-demo__modal" role="presentation">
        <button
          type="button"
          className="lp-demo__modal-backdrop"
          aria-label="Close"
          onClick={() => setDone(false)}
        />
        <div
          className="lp-demo__modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-success-title"
          aria-describedby="demo-success-copy"
        >
          <button
            type="button"
            className="lp-demo__modal-close"
            aria-label="Close"
            onClick={() => setDone(false)}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>

          <div className="lp-demo__modal-hero">
            <span className="lp-demo__success-icon" aria-hidden>
              <CheckCircle2 className="h-8 w-8" strokeWidth={2} />
            </span>
            <p className="lp-demo__modal-eyebrow">Request received</p>
            <h2 id="demo-success-title">We&apos;ll be in touch soon</h2>
          </div>

          <p id="demo-success-copy" className="lp-demo__modal-copy">
            Thanks{firstName ? `, ${firstName}` : ""}. Your Havena demo request is confirmed.
          </p>

          <div className="lp-demo__modal-email">
            <span>We&apos;ll email</span>
            <strong>{submitted.email}</strong>
            <span>within one business day</span>
          </div>

          <ul className="lp-demo__modal-points">
            <li>Watch your inbox and spam folder for our reply</li>
            <li>Have a few community details ready for the call</li>
            <li>No commitment required. This is just a walkthrough</li>
          </ul>

          <div className="lp-demo__success-actions">
            <Link href="/" className="lp-btn-primary">
              Back to home
            </Link>
            <Link href="/register" className="lp-btn-secondary">
              Or create an account
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
