import AuthLogo from "./auth-logo";

/** Havena infinity mark — shared across splash, roles, and auth-adjacent screens. */
export default function HavenaLogo({ size = 62, style, compact = false, variant = "auth" }) {
  return (
    <AuthLogo
      size={size}
      style={style}
      compact={compact}
      variant={variant}
    />
  );
}
