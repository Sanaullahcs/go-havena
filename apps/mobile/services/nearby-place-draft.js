let currentPlace = null;

export function setNearbyPlaceDraft(place) {
  currentPlace = place ?? null;
}

export function getNearbyPlaceDraft() {
  return currentPlace;
}
