"use client";

import { useCallback, useEffect, useState } from "react";
import { apiError } from "@/lib/api/client";
import { fetchLandlordPortfolio, type LandlordPortfolioPayload } from "@/lib/api/landlord";
import { getUser } from "@/lib/auth/session";

type CommunityOption = { id: number; name: string };

type PortfolioCacheEntry = {
  payload: LandlordPortfolioPayload;
  communities: CommunityOption[];
};

const portfolioCache = new Map<string, PortfolioCacheEntry>();

function cacheKey(communityId?: number) {
  return communityId == null ? "auto" : String(communityId);
}

function readCache(communityId?: number) {
  return portfolioCache.get(cacheKey(communityId)) ?? null;
}

function writeCache(communityId: number | undefined, entry: PortfolioCacheEntry) {
  portfolioCache.set(cacheKey(communityId), entry);
  const resolvedId = communityId ?? entry.communities[0]?.id;
  if (resolvedId != null) {
    portfolioCache.set(cacheKey(resolvedId), entry);
  }
}

export function useLandlordPortfolio(initialCommunityId?: number) {
  const sessionCommunityId = getUser()?.active_context_community_id ?? undefined;
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | undefined>(
    initialCommunityId ?? sessionCommunityId,
  );
  const cached = readCache(selectedCommunityId);
  const [payload, setPayload] = useState<LandlordPortfolioPayload | null>(cached?.payload ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [communities, setCommunities] = useState<CommunityOption[]>(cached?.communities ?? []);

  const load = useCallback(async (communityId?: number) => {
    const requested = communityId ?? selectedCommunityId;
    const existing = readCache(requested);
    if (!existing) setLoading(true);
    setError(null);
    try {
      const res = await fetchLandlordPortfolio(requested);
      const nextCommunities = res.meta.landlord_communities ?? [];
      const entry = { payload: res.data, communities: nextCommunities };
      writeCache(requested, entry);
      setPayload(res.data);
      setCommunities(nextCommunities);
      if (requested == null && nextCommunities[0]) {
        setSelectedCommunityId((current) => current ?? nextCommunities[0].id);
      }
      return res.data;
    } catch (err) {
      setError(apiError(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [selectedCommunityId]);

  useEffect(() => {
    let cancelled = false;
    const requested = selectedCommunityId;
    const existing = readCache(requested);
    if (existing) {
      setPayload(existing.payload);
      setCommunities(existing.communities);
      setLoading(false);
    }

    void (async () => {
      if (!existing) setLoading(true);
      try {
        const res = await fetchLandlordPortfolio(requested);
        if (cancelled) return;
        const nextCommunities = res.meta.landlord_communities ?? [];
        const entry = { payload: res.data, communities: nextCommunities };
        writeCache(requested, entry);
        setPayload(res.data);
        setCommunities(nextCommunities);
        setError(null);
        if (requested == null && nextCommunities[0]) {
          setSelectedCommunityId((current) => current ?? nextCommunities[0].id);
        }
      } catch (err) {
        if (!cancelled) setError(apiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCommunityId]);

  return {
    payload,
    loading: loading && !payload,
    error,
    communities,
    selectedCommunityId,
    setSelectedCommunityId,
    load,
  };
}
