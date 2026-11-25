import React from "react";
import {
  Droplets,
  Dumbbell,
  DoorOpen,
  BriefcaseBusiness,
  UtensilsCrossed,
  Trophy,
  Baby,
  Trees,
  Sparkles,
  BookOpen,
  Car,
  Building2,
  Shirt,
  Clapperboard,
  Bike,
  Flower2,
  Scissors,
  CalendarDays,
  Package,
} from "lucide-react-native";
import { getAmenityVisual } from "../../utils/amenity-display";

const LUCIDE_BY_KEY = {
  gym: Dumbbell,
  yoga: Flower2,
  pool: Droplets,
  laundry: Shirt,
  car_wash: Car,
  barber: Scissors,
  cleaning: Sparkles,
  sports: Trophy,
  events: CalendarDays,
  package: Package,
  lounge: DoorOpen,
  hall: DoorOpen,
  meeting: BriefcaseBusiness,
  dining: UtensilsCrossed,
  bbq: UtensilsCrossed,
  tennis: Trophy,
  playground: Baby,
  terrace: Trees,
  spa: Sparkles,
  library: BookOpen,
  parking: Car,
  cinema: Clapperboard,
  bike: Bike,
  building: Building2,
};

/**
 * Minimal Lucide amenity glyph. Prefer iconKey from API; falls back to name matching.
 */
export default function AmenityIcon({
  iconKey,
  name = "",
  size = 22,
  color,
  strokeWidth = 1.75,
}) {
  const visual = getAmenityVisual(name, iconKey || null);
  const Icon = LUCIDE_BY_KEY[visual.key] || Building2;
  return (
    <Icon
      size={size}
      color={color || visual.tint}
      strokeWidth={strokeWidth}
    />
  );
}
