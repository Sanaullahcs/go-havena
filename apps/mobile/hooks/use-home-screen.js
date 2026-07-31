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

      const [
        carouselResult,
        eventsResult,
        feedResult,
        dealsResult,
        wellnessResult,
        amenitiesResult,
      ] = await Promise.allSettled([
        fetchNotices({ categoryGroup: "notices", perPage: 30 }),
        fetchNotices({ category: "event", perPage: 30 }),
        fetchFeed({ perPage: HOME_SECTION_CARD_LIMIT }),
        fetchDeals({ perPage: HOME_SECTION_CARD_LIMIT * 3 }),
        fetchWellnessHub(),
        fetchAmenities(),
      ]);

      for (const result of [
        carouselResult,
        eventsResult,
        feedResult,
        dealsResult,
        wellnessResult,
        amenitiesResult,
      ]) {
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
      const eventItems =
        eventsResult.status === "fulfilled" ? eventsResult.value.notices ?? [] : [];

      setNotices([...carouselItems, ...eventItems]);

      if (feedResult.status === "fulfilled") {
        setPosts(pickHomeFeedPosts(feedResult.value.posts ?? []));
      }

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

  const upcomingEvents = useMemo(
    () => pickUpcomingEvents(notices),
    [notices],
  );

  return {
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
