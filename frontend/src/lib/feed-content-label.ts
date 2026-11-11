export type FeedContentRef = {
  category?: string | null;
  poll?: unknown | null;
};

export function isPollFeedContent(content: FeedContentRef | null | undefined): boolean {
  if (!content) return false;
  return content.category === "poll" || content.poll != null;
}

export function feedContentKind(content: FeedContentRef | null | undefined): "post" | "poll" {
  return isPollFeedContent(content) ? "poll" : "post";
}

export function feedContentTitle(content: FeedContentRef | null | undefined): "Post" | "Poll" {
  return isPollFeedContent(content) ? "Poll" : "Post";
}
