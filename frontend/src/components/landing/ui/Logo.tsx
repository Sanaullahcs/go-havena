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
  brand: "text-[#0A2A43]",
  dark: "text-[#0A2A43]",
};

export function Logo({
  variant = "full",
  className = "",
  withWordmarkText = true,
  tone = "dark",
}: Props) {
  if (variant === "mark") {
    return (
      <span className={`inline-flex shrink-0 ${className}`} aria-label="Havena">
        <HavenaMark size={34} />
      </span>
    );
  }

  if (variant === "wordmark") {
    return (
      <span className={`inline-flex items-center gap-2.5 ${toneTextClass[tone]} ${className}`}>
        <HavenaMark size={28} />
        <span className="font-[family-name:var(--font-brand)] text-[1.05rem] font-semibold tracking-[-0.03em]">
          Havena
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Havena">
      <HavenaMark size={32} className="shrink-0" />
      {withWordmarkText ? (
        <span
          className={`font-[family-name:var(--font-brand)] text-[1.15rem] font-semibold tracking-[-0.03em] transition-colors duration-300 ease-out ${toneTextClass[tone]}`}
        >
          Havena
        </span>
      ) : null}
    </span>
  );
}

export default Logo;
