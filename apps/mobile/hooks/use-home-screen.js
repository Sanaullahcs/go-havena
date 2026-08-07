import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  fetchNotices,
  pickNeighborhoodCarousel,
  pickUpcomingEvents,
} from "../services/notices-api";
import { fetchFeed, pickHomeFeedPosts } from "../services/feed-api";
import { fetchDeals, pickActiveDealsForHome } from "../services/deals-api";
import { fetchWellnessHub } from "../services/wellness-api";
import {
  fetchAmenities,
  pickLatestApprovedAmenities,
} from "../services/amenity-api";
import { HOME_SECTION_CARD_LIMIT } from "../constants/home-sections";
import {
  isAccountRestrictedError,
  resolveLoadRestriction,
} from "../utils/account-access-sync";

export function useHomeScreen() {
  const [notices, setNotices] = useState([]);
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
      const preBlocked = await resolveLoadRestriction("feed");
      if (preBlocked) {
        setRestrictionError(preBlocked);
        clearHomeData();
        return;
      }

      const criticalPromise = Promise.allSettled([
        fetchNotices({ categoryGroup: "notices", perPage: 30 }),
        fetchNotices({ categoryGroup: "alerts", perPage: 10 }),
        fetchNotices({ category: "event", perPage: 30 }),
        fetchFeed({ perPage: HOME_SECTION_CARD_LIMIT }),
      ]);

      const secondaryPromise = Promise.allSettled([
        fetchDeals({ perPage: HOME_SECTION_CARD_LIMIT * 3 }),
        fetchWellnessHub(),
        fetchAmenities(),
      ]);

      const [carouselResult, alertsResult, eventsResult, feedResult] = await criticalPromise;

      for (const result of [carouselResult, alertsResult, eventsResult, feedResult]) {
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

      const carouselItems =
        carouselResult.status === "fulfilled" ? carouselResult.value.notices ?? [] : [];
      const alertItems =
        alertsResult.status === "fulfilled" ? alertsResult.value.notices ?? [] : [];
      const eventItems =
        eventsResult.status === "fulfilled" ? eventsResult.value.notices ?? [] : [];

      setNotices([...alertItems, ...carouselItems, ...eventItems]);
      setUpcomingEvents(pickUpcomingEvents(eventItems));

      if (feedResult.status === "fulfilled") {
        setPosts(pickHomeFeedPosts(feedResult.value.posts ?? []));
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
  }, [clearHomeData]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        return;
      }
      load({ silent: true });
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    load({ silent: true, refresh: true });
  }, [load]);

  const carouselNotices = useMemo(
    () => pickNeighborhoodCarousel(notices),
    [notices],
  );

  return {
    notices,
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
