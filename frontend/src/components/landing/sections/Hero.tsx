import { Icon } from "../icons/Icon";
import { Button } from "../ui/Button";
import { HeroPhone } from "../ui/HeroPhone";
import { LandingSectionButton } from "../ui/LandingSectionButton";
import { actionLinks, site } from "@/lib/landing/site";

const HERO_PHONES = [
  {
    src: "/landing/mobile-app-mockup.png",
    alt: "Havena community post with comments and engagement",
    label: "Community",
    position: "left" as const,
  },
  {
    src: "/landing/hero-home.png",
    alt: "Havena home screen with neighborhood updates and quick actions",
    label: "Havena",
    position: "center" as const,
  },
  {
    src: "/landing/hero-marketplace.png",
    alt: "Havena neighborhood marketplace with local deals and businesses",
    label: "Marketplace",
    position: "right" as const,
  },
];

export function Hero() {
  return (
    <section id="top" className="relative isolate overflow-hidden pb-16 pt-32 sm:pb-20 sm:pt-36 lg:pb-24 lg:pt-40">
      <div aria-hidden="true" className="brand-gradient-mesh absolute inset-0 -z-20" />
      <div
        aria-hidden="true"
        className="grid-mask-light pointer-events-none absolute inset-0 -z-10 opacity-50"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-16 -z-10 h-[480px] w-[480px] rounded-full bg-[#007BFF]/12 blur-3xl animate-aurora"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 top-24 -z-10 h-[400px] w-[400px] rounded-full bg-[#6366f1]/10 blur-3xl animate-pulse-soft"
      />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-6 xl:col-span-6">
            <div className="animate-fade-up">
              <span className="hero-eyebrow inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-brand-deep">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-deep text-white">
                  <Icon name="sparkles" className="h-3 w-3" />
                </span>
                {site.tagline}
              </span>
            </div>

            <h1 className="hero-title animate-fade-up delay-100 mt-7 max-w-[640px]">
              Build stronger neighborhoods with{" "}
              <span className="gradient-text">one connected platform.</span>
            </h1>

            <p className="animate-fade-up delay-200 mt-6 max-w-xl text-[16px] leading-[1.7] text-ink-body sm:text-[17px]">
              {site.description} Manage notices, events, wellness, marketplace, and community life, all in one place residents actually love using.
            </p>

            <div className="animate-fade-up delay-300 mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                href={actionLinks.signUp}
                variant="primary"
                size="lg"
                iconTrailing="arrow-right"
                className="w-full sm:w-auto"
              >
                Get started free
              </Button>
              <LandingSectionButton
                sectionId="features"
                variant="secondary"
                size="lg"
                icon="play-circle"
                className="w-full sm:w-auto"
              >
                Explore features
              </LandingSectionButton>
            </div>
          </div>

          <div className="relative lg:col-span-6 xl:col-span-6">
            <div className="hero-phones-wrap relative mx-auto w-full max-w-[620px]">
              <div className="hero-phones animate-fade-up delay-200">
                {HERO_PHONES.map((phone) => (
                  <HeroPhone
                    key={phone.label}
                    src={phone.src}
                    alt={phone.alt}
                    label={phone.label}
                    position={phone.position}
                  />
                ))}
              </div>

              <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-white/90 bg-white px-4 py-3 shadow-elevated lg:block animate-float-slow">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-white shadow-sm">
                    <Icon name="shield-check" className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[12px] font-bold text-ink-primary">Verified residents only</p>
                    <p className="text-[11px] text-ink-muted">Safe & trusted access</p>
                  </div>
                </div>
              </div>

              <div className="absolute -right-3 top-8 hidden rounded-2xl border border-white/90 bg-white/95 px-3 py-2 shadow-card lg:block animate-float-card">
                <div className="flex items-center gap-2">
                  <span className="flex -space-x-2">
                    {["#0052df", "#0179ff", "#6366f1"].map((color) => (
                      <span
                        key={color}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        NL
                      </span>
                    ))}
                  </span>
                  <p className="text-[11px] font-semibold text-ink-body">
                    <span className="text-ink-primary">2.4k</span> online now
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
