/**
 * React Native 0.86 deprecates shadow* / textShadow* in favor of boxShadow / textShadow.
 */

function colorWithOpacity(color, opacity) {
  const value = String(color ?? "#000000").trim();
  if (/^rgba?\(|^hsla?\(/i.test(value)) return value;
  let hex = value.replace("#", "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  if (hex.length < 6) return value;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const alpha = Number.isFinite(Number(opacity)) ? Number(opacity) : 1;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function rnShadow({
  color = "#000000",
  offset = { width: 0, height: 2 },
  opacity = 0.08,
  radius = 8,
  elevation,
} = {}) {
  const x = offset?.width ?? 0;
  const y = offset?.height ?? 0;
  const style = {
    boxShadow: `${x}px ${y}px ${radius}px ${colorWithOpacity(color, opacity)}`,
  };
  if (elevation != null) style.elevation = elevation;
  return style;
}

export function rnTextShadow({
  color = "rgba(0,0,0,0.7)",
  offset = { width: 0, height: 1 },
  radius = 4,
} = {}) {
  const x = offset?.width ?? 0;
  const y = offset?.height ?? 0;
  return {
    textShadow: `${x}px ${y}px ${radius}px ${color}`,
  };
}
