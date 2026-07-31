import AuthLogo from "./auth-logo";

/** NeighborLink house mark — shared across splash, roles, and auth-adjacent screens. */
export default function NeighborLinkLogo({ size = 62, style, compact = false }) {
  return <AuthLogo size={size} style={style} compact={compact} />;
}
