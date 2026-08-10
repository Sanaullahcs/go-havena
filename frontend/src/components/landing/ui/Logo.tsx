import { HavenaMark } from "@/components/shared/havena-mark";

type Variant = "full" | "mark" | "wordmark";
type Tone = "light" | "brand" | "dark";

type Props = {
  variant?: Variant;
  className?: string;
  withWordmarkText?: boolean;
  tone?: Tone;
};

const toneTextClass: Record<Tone, string> = {
  light: "text-white",
  brand: "text-brand-deep",
  dark: "text-ink-primary",
};

export function Logo({
  variant = "full",
  className = "",
  withWordmarkText = true,
  tone = "dark",
}: Props) {
  if (variant === "mark") {
    return (
      <span className={`inline-flex ${className}`} aria-label="Havena">
        <HavenaMark size={36} />
      </span>
    );
  }

  if (variant === "wordmark") {
    return (
      <span className={`inline-flex items-center gap-2.5 ${toneTextClass[tone]} ${className}`}>
        <HavenaMark size={30} />
        <span className="text-[15px] font-bold tracking-[-0.02em]">Havena</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <HavenaMark size={34} />
      {withWordmarkText ? (
        <span
          className={`text-[17px] font-bold tracking-[-0.02em] transition-colors duration-300 ease-out ${toneTextClass[tone]}`}
        >
          Havena
        </span>
      ) : null}
    </span>
  );
}

export default Logo;
