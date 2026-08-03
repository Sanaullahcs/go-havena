import AuthLogo from "./auth-logo";

/** Havena house mark — shared across splash, roles, and auth-adjacent screens. */
export default function HavenaLogo({ size = 62, style, compact = false }) {
  return <AuthLogo size={size} style={style} compact={compact} />;
}
