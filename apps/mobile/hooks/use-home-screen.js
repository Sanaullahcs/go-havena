import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  fetchNotices,
  pickNeighborhoodCarousel,
  pickUpcomingEvents,
} from "../services/notices-api";
import { fetchFeed, pickHomeFeedPosts, areFeedPostsUnchanged } from "../services/feed-api";
import { fetchDeals, pickActiveDealsForHome } from "../services/deals-api";
import { fetchWellnessHub, subscribeWellnessHub } from "../services/wellness-api";
import {
  fetchAmenities,
  pickLatestApprovedAmenities,
} from "../services/amenity-api";
import { HOME_SECTION_CARD_LIMIT } from "../constants/home-sections";
import {
  isAccountRestrictedError,
  resolveLoadRestriction,
} from "../utils/account-access-sync";
import { useLocationScope } from "../providers/location-scope-provider";
import { fetchMe } from "../services/auth-api";
import { subscribeSessionUser } from "../services/auth-session";

export function useHomeScreen() {
  const { revision } = useLocationScope();
  const [notices, setNotices] = useState([]);
  const [noticesLoaded, setNoticesLoaded] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [posts, setPosts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [wellnessCategories, setWellnessCategories] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restrictionError, setRestrictionError] = useState(null);
  const hasLoadedRef = useRef(false);

  const clearHomeData = useCallback(() => {
    setNotices([]);
    setNoticesLoaded(false);
    setUpcomingEvents([]);
    setPosts([]);
    setDeals([]);
    setWellnessCategories([]);
    setAmenities([]);
  }, []);

  const load = useCallback(async ({ silent = false, refresh = false } = {}) => {
    if (refresh) {
      setRefreshing(true);
    } else if (!silent) {
      setLoading(true);
    }

    try {
      await fetchMe().catch(() => null);
      const preBlocked = await resolveLoadRestriction("feed");
      if (preBlocked) {
        setRestrictionError(preBlocked);
        clearHomeData();
        return;
      }

      const criticalPromise = Promise.allSettled([
        fetchNotices({ perPage: 24 }),
        fetchFeed({ perPage: HOME_SECTION_CARD_LIMIT }),
      ]);

      const secondaryPromise = Promise.allSettled([
        fetchDeals({ perPage: HOME_SECTION_CARD_LIMIT }),
        fetchWellnessHub(),
        fetchAmenities(),
      ]);

      const [noticesResult, feedResult] = await criticalPromise;

      for (const result of [noticesResult, feedResult]) {
        if (result.status === "rejected" && isAccountRestrictedError(result.reason)) {
          const restricted = await resolveLoadRestriction("feed", result.reason);
          if (restricted) {
            setRestrictionError(restricted);
            clearHomeData();
            return;
          }
        }
      }

      setRestrictionError(null);

      if (noticesResult.status === "fulfilled") {
        const allNotices = noticesResult.value.notices ?? [];
        setNotices(allNotices);
        setUpcomingEvents(pickUpcomingEvents(allNotices));
        setNoticesLoaded(true);
      } else {
        setNoticesLoaded(false);
      }

      if (feedResult.status === "fulfilled") {
        const nextPosts = pickHomeFeedPosts(feedResult.value.posts ?? []);
        setPosts((prev) => (areFeedPostsUnchanged(prev, nextPosts) ? prev : nextPosts));
      }

      if (!silent && !refresh) {
        setLoading(false);
      }

      const [dealsResult, wellnessResult, amenitiesResult] = await secondaryPromise;

      // Secondary sections are best-effort — never wipe notices/feed if they fail.
      if (dealsResult.status === "fulfilled") {
        setDeals(pickActiveDealsForHome(dealsResult.value.deals ?? []));
      }

      if (wellnessResult.status === "fulfilled") {
        setWellnessCategories(wellnessResult.value.categories ?? []);
      }

      if (amenitiesResult.status === "fulfilled") {
        setAmenities(pickLatestApprovedAmenities(amenitiesResult.value ?? []));
      }
    } catch {
      // keep previous data on failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clearHomeData, revision]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let signature = null;
    return subscribeSessionUser((user) => {
      const next = JSON.stringify(user?.resident_features ?? null);
      if (signature !== null && signature !== next) {
        load({ silent: true });
      }
      signature = next;
    });
  }, [load]);

  useEffect(() => {
    return subscribeWellnessHub((hub) => {
      setWellnessCategories(hub?.categories ?? []);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
      } else {
        load({ silent: true });
      }
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") load({ silent: true });
      });
      return () => sub.remove();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    load({ silent: true, refresh: true });
  }, [load]);

  const carouselNotices = useMemo(
    () => pickNeighborhoodCarousel(notices, 7),
    [notices],
  );

  return {
    notices,
    noticesLoaded,
    carouselNotices,
    upcomingEvents,
    posts,
    setPosts,
    deals,
    wellnessCategories,
    amenities,
    loading,
    refreshing,
    restrictionError,
    onRefresh,
    reload: load,
  };
}

export function useHomeNotices() {
  const screen = useHomeScreen();
  return {
    carouselNotices: screen.carouselNotices,
    upcomingEvents: screen.upcomingEvents,
    loading: screen.loading,
    restrictionError: screen.restrictionError,
    reload: screen.reload,
  };
}
