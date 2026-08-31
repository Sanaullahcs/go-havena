type Props = {
  className?: string;
};

/** Standalone “Havena” wordmark — Quicksand matches the logo reference. */
export function HavenaWordmark({ className = "" }: Props) {
  return (
    <span className={`font-[family-name:var(--font-wordmark)] font-semibold tracking-tight ${className}`}>
      Havena
    </span>
  );
}
