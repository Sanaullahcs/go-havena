import { getAmenityIcon, getAmenityVisual } from "@/lib/admin/amenity-display";

export function AmenityIcon({
  iconKey,
  name = "",
  size = 18,
  className,
}: {
  iconKey?: string | null;
  name?: string;
  size?: number;
  className?: string;
}) {
  const visual = getAmenityVisual(name, iconKey);
  const Icon = getAmenityIcon(iconKey, name);

  return (
    <Icon
      size={size}
      color={visual.tint}
      strokeWidth={1.75}
      className={className}
      aria-hidden
    />
  );
}
