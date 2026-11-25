let session = {
  shouldRestore: false,
  category: "all",
  query: "",
};

export function markNearbySheetForRestore({ category, query } = {}) {
  session = {
    shouldRestore: true,
    category: category || "all",
    query: query ?? "",
  };
}

export function peekNearbySheetSession() {
  return { ...session };
}

export function consumeNearbySheetRestore() {
  if (!session.shouldRestore) return null;
  const next = { ...session };
  session = { ...session, shouldRestore: false };
  return next;
}

export function clearNearbySheetRestore() {
  session = {
    shouldRestore: false,
    category: "all",
    query: "",
  };
}
