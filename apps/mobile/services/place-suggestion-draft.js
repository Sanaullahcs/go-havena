let currentSuggestion = null;

export function setPlaceSuggestionDraft(suggestion) {
  currentSuggestion = suggestion ?? null;
}

export function getPlaceSuggestionDraft() {
  return currentSuggestion;
}
