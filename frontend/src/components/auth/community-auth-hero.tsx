import type { LucideIcon } from "lucide-react";
import { CreditCard, Smartphone, Users } from "lucide-react";
import { HavenaMark } from "@/components/shared/havena-mark";
import { landingImages } from "@/lib/landing/site";

const DEFAULT_POINTS: Array<{ icon: LucideIcon; text: string }> = [
  { icon: Smartphone, text: "Phone OTP — no password to manage" },
  { icon: Users, text: "Plans from 50 to 500 resident seats" },
  { icon: CreditCard, text: "Billing unlocks invites after signup" },
];

export function CommunityAuthHero({
  eyebrow,
  title,
  subtitle,
  body,
  points = DEFAULT_POINTS,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  body?: string;
  points?: Array<{ icon: LucideIcon; text: string }>;
}) {
  return (
    <aside className="nl-login-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={landingImages.hero} alt="" className="nl-login-hero__photo" aria-hidden />
      <div className="nl-login-hero__veil" aria-hidden />

      <div className="relative z-10 flex flex-1 flex-col justify-between gap-6 p-6 sm:p-8 lg:p-10 xl:p-14">
        <div className="nl-login-brand nl-login-brand--hero">
          <span className="nl-login-brand__mark">
            <HavenaMark size={28} />
          </span>
          <span className="text-[15px] font-bold text-white">Havena</span>
        </div>

        <div className="nl-login-hero__copy">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-200/90">{eyebrow}</p>
          <h2 className="mt-2 font-[family-name:var(--font-brand)] text-[1.85rem] font-bold leading-[1.08] tracking-tight text-white sm:text-[2.2rem] xl:text-[2.75rem]">
            {title}
            <span className="mt-2 block font-[family-name:var(--font-display)] text-[1.05rem] font-semibold text-teal-200 sm:text-[1.25rem] xl:text-[1.45rem]">
              {subtitle}
            </span>
          </h2>
          {body ? (
            <p className="nl-login-hero__body mt-4 max-w-md text-[14px] leading-relaxed text-white/70 sm:text-[15px]">
              {body}
            </p>
          ) : null}
          <ul className="nl-login-hero__points mt-5 space-y-2.5">
            {points.map((item) => (
              <li key={item.text} className="flex items-center gap-2.5 text-[13px] leading-none text-white/80">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/12 text-teal-100">
                  <item.icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                </span>
                <span className="leading-snug">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="nl-login-hero__legal text-[12px] text-white/40">© Havena · Community operator access</p>
      </div>
    </aside>
  );
}
