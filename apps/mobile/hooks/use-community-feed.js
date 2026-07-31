import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchFeed } from "../services/feed-api";

const EMPTY_MESSAGES = {
  no_approved_membership:
    "Join your community during onboarding to see neighbor posts here.",
  no_posts: "No posts in your community yet. Be the first to share something!",
};

export function getFeedEmptyMessage(emptyReason) {
  return EMPTY_MESSAGES[emptyReason] ?? EMPTY_MESSAGES.no_posts;
}

export function useCommunityFeed({ perPage = 20, refreshOnFocus = true } = {}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [emptyReason, setEmptyReason] = useState(null);
  const [communityId, setCommunityIdState] = useState(null);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(
    async (silent = false) => {
      if (!hasLoadedOnce.current) {
        setLoading(true);
      } else if (!silent) {
        setRefreshing(true);
      }
      setError(null);

      try {
        const result = await fetchFeed({ perPage });
        setPosts(result.posts ?? []);
        setEmptyReason(result.emptyReason ?? null);
        setCommunityIdState(result.communityId ?? null);
      } catch (err) {
        setError(err);
        if (!silent) {
          setPosts([]);
        }
      } finally {
        hasLoadedOnce.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [perPage],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (refreshOnFocus || !hasLoadedOnce.current) {
        load(hasLoadedOnce.current);
      }
    }, [load, refreshOnFocus]),
  );

  return {
    posts,
    setPosts,
    loading,
    refreshing,
    error,
    emptyReason,
    communityId,
    load,
    onRefresh,
    emptyMessage: getFeedEmptyMessage(emptyReason),
  };
}
