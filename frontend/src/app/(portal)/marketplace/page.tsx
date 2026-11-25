"use client";

import { useState, useEffect, useCallback } from "react";
import { confirmAction, toastSuccess, toastInfo, toastError } from "@/lib/alert";
import { fetchListings, createListing, toggleSaveListing, type Listing } from "@/lib/api/listings";
import { fetchDeals, type Deal } from "@/lib/api/deals";
import { apiError } from "@/lib/api/client";
import { formatCommunityMoney } from "@/lib/money";
import { PageLoader } from "@/components/shared/page-states";

type Category = "all" | "deal" | "sale" | "service" | "wanted";

const CAT_LABEL_MAP: Record<Category, string> = {
  all: "All", deal: "Deals", sale: "For Sale", service: "Services", wanted: "Wanted",
};

const TYPE_BADGE_COLOR: Record<string, string> = {
  sale:     "#7c3aed",
  for_sale: "#7c3aed",
  service:  "#0891b2",
  deal:     "#0D9488",
  wanted:   "#b45309",
};

/** Normalize API listing types to portal filter buckets. */
function listingBucket(type: string): Category | "other" {
  if (type === "for_sale" || type === "sale" || type === "item") return "sale";
  if (type === "service") return "service";
  if (type === "deal") return "deal";
  if (type === "wanted") return "wanted";
  return "other";
}

function dealAsListing(d: Deal): Listing {
  return {
    id: d.id + 1_000_000, // avoid colliding with listing ids in the UI grid
    type: "deal",
    category: d.category,
    condition: null,
    title: d.title,
    price: d.discounted_price ?? d.original_price,
    description: [d.discount_label, d.vendor, d.description].filter(Boolean).join(" · "),
    location: d.location,
    images: d.image_url ? [d.image_url] : [],
    status: d.status,
    is_verified: true,
    is_saved: false,
    created_at: d.created_at,
    seller_name: d.vendor || "Community Deal",
    seller_unit: null,
    seller_avatar: null,
  };
}

export default function ResidentMarketplacePage() {
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch]     = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [deals, setDeals]       = useState<Listing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState({ title: "", price: "", category: "", type: "sale", description: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const listParams: Record<string, unknown> = {};
      if (search) listParams.search = search;
      // Fetch all listing types; filter client-side so for_sale maps to "sale".
      if (category === "service" || category === "wanted") {
        listParams.type = category;
      } else if (category === "sale") {
        listParams.type = "for_sale";
      }

      const [listRes, dealRes] = await Promise.all([
        category === "deal" ? Promise.resolve({ data: [] as Listing[] }) : fetchListings(listParams),
        category === "sale" || category === "service" || category === "wanted"
          ? Promise.resolve({ data: [] as Deal[] })
          : fetchDeals(search ? { search } : undefined),
      ]);

      setListings(listRes.data);
      setDeals((dealRes.data || []).filter((d) => !d.is_expired).map(dealAsListing));
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => { load(); }, [load]);

  const toggleSave = async (id: number) => {
    if (id >= 1_000_000) {
      toastInfo("Community deals can’t be saved to your wishlist yet.");
      return;
    }
    const item = listings.find((l) => l.id === id);
    try {
      const res = await toggleSaveListing(id);
      setListings((prev) => prev.map((l) => l.id === id ? { ...l, is_saved: res.saved } : l));
      toastSuccess(res.saved ? "Saved to your wishlist!" : "Removed from saved listings.");
    } catch (err) {
      toastError(apiError(err));
    }
    void item;
  };

  const handleContact = async (title: string, seller: string) => {
    const r = await confirmAction({
      title: `Contact ${seller}?`,
      text: `You'll be connected with the seller of "${title}" via messages.`,
      confirmText: "Send Message",
      color: "blue",
    });
    if (r.isConfirmed) toastSuccess(`Message sent to ${seller}!`);
  };

  const catalog = category === "deal" ? deals : category === "all" ? [...deals, ...listings] : listings;

  const visible = catalog.filter((l) => {
    const bucket = listingBucket(l.type);
    const matchCat = category === "all" || bucket === category || l.type === category;
    const matchQ   = !search || l.title.toLowerCase().includes(search.toLowerCase()) || (l.seller_name || "").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  const catCounts = (c: Category) => {
    if (c === "all") return listings.length + deals.length;
    if (c === "deal") return deals.length;
    return listings.filter((l) => listingBucket(l.type) === c).length;
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="nl-eyebrow" style={{ color: "#0D9488" }}>Resident Portal</p>
          <h2 className="mt-0.5 text-xl font-bold text-slate-900">Marketplace</h2>
          <p className="mt-0.5 text-sm text-slate-500">Local deals, resident listings, and community services.</p>
        </div>
        <button onClick={() => setModal(true)} className="nl-btn-primary">
          <IcoPlus /> Post a Listing
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&_svg]:h-4 [&_svg]:w-4">
            <IcoSearch />
          </span>
          <input
            type="search"
            placeholder="Search listings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 text-[13px] shadow-sm outline-none placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition"
            style={{ paddingLeft: "2.25rem" }}
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", "deal", "sale", "service", "wanted"] as Category[]).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={[
                "flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-[12.5px] font-semibold transition",
                category === c
                  ? "border-[#14B8A6] bg-[#14B8A6] text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
              ].join(" ")}
            >
              {CAT_ICON[c]}
              {CAT_LABEL_MAP[c]}
              <span className={`text-[10.5px] ${category === c ? "opacity-75" : "text-slate-400"}`}>
                ({catCounts(c)})
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading ? <PageLoader variant="cards" /> : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white py-14 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 [&_svg]:h-6 [&_svg]:w-6">
            <IcoMarket />
          </div>
          <p className="text-[13.5px] font-medium text-slate-500">No listings found.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((l) => {
            const badgeColor = TYPE_BADGE_COLOR[l.type] ?? "#64748b";
            const badgeLabel =
              l.type === "sale" || l.type === "for_sale" ? "For Sale"
              : l.type === "service" ? "Service"
              : l.type === "deal" ? "Deal"
              : l.type === "wanted" ? "Wanted"
              : l.type;
            const imgUrl = l.images?.[0] ?? "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&q=80";
            return (
              <div key={l.id}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="relative overflow-hidden" style={{ paddingBottom: "56%" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgUrl}
                    alt={l.title}
                    className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1">
                    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white shadow-sm"
                      style={{ background: badgeColor }}>
                      {badgeLabel}
                    </span>
                    {l.is_verified && (
                      <span className="flex items-center gap-0.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-[#0D9488] shadow-sm backdrop-blur-sm">
                        <IcoVerified /> Verified
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleSave(l.id)}
                    className={[
                      "absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition [&_svg]:h-3.5 [&_svg]:w-3.5",
                      l.is_saved ? "bg-[#14B8A6] text-white" : "bg-white/90 text-slate-400 hover:text-[#0D9488]",
                    ].join(" ")}
                  >
                    <IcoSave />
                  </button>
                </div>

                <div className="p-3.5">
                  <p className="line-clamp-2 text-[13.5px] font-bold text-slate-900 leading-snug">{l.title}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[12px] text-slate-500">{l.seller_name}</span>
                    {l.seller_unit && <>
                      <span className="text-slate-300">·</span>
                      <span className="text-[12px] text-slate-400">{l.seller_unit}</span>
                    </>}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11.5px] text-slate-400">{l.description}</p>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[15px] font-bold text-slate-900">
                        {l.price != null ? formatCommunityMoney(l.price) : "—"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleContact(l.title, l.seller_name)}
                      className="flex h-8 items-center gap-1.5 rounded-xl px-3 text-[12px] font-bold text-white transition"
                      style={{ background: badgeColor }}
                    >
                      <IcoMsg /> View
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Post listing modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Post a Listing</h3>
                <p className="mt-0.5 text-[12.5px] text-slate-500">Share something with your community.</p>
              </div>
              <button onClick={() => setModal(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 [&_svg]:h-4 [&_svg]:w-4">
                <IcoX />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="nl-label">Listing Type</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="nl-input nl-select mt-1.5">
                  <option value="sale">For Sale</option>
                  <option value="service">Service</option>
                </select>
              </div>
              <div>
                <label className="nl-label">Title</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="nl-input mt-1.5" placeholder="e.g. Sofa for sale" />
              </div>
              <div>
                <label className="nl-label">Price (USD)</label>
                <input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="nl-input mt-1.5" placeholder="$ 0.00" />
              </div>
              <div>
                <label className="nl-label">Category</label>
                <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="nl-input mt-1.5" placeholder="e.g. Furniture" />
              </div>
              <div>
                <label className="nl-label">Description</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="nl-input mt-1.5 resize-none" placeholder="Describe your item or service…" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button onClick={() => setModal(false)} className="nl-btn-secondary">Cancel</button>
              <button disabled={submitting} onClick={async () => {
                if (!form.title || !form.price || !form.category) { toastInfo("Please fill in title, price, and category."); return; }
                const r = await confirmAction({ title: "Post this listing?", text: "It will be visible to all residents immediately.", confirmText: "Post Listing", color: "green" });
                if (r.isConfirmed) {
                  setSubmitting(true);
                  try {
                    const priceNum = parseFloat(form.price.replace(/[^\d.]/g, ""));
                    if (Number.isNaN(priceNum) || priceNum < 0) {
                      toastInfo("Enter a valid price in USD.");
                      return;
                    }
                    const listingType = form.type === "sale" ? "for_sale" : form.type;
                    await createListing({
                      type: listingType,
                      title: form.title,
                      price: priceNum,
                      category: form.category.trim(),
                      description: form.description,
                    });
                    setModal(false);
                    setForm({ title: "", price: "", category: "", type: "sale", description: "" });
                    toastSuccess("Listing posted to the marketplace!");
                    load();
                  } catch (err) {
                    toastError(apiError(err));
                  } finally {
                    setSubmitting(false);
                  }
                }
              }} className="nl-btn-primary disabled:opacity-60"><IcoPlus /> {submitting ? "Posting…" : "Post Listing"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CAT_ICON: Record<Category, React.ReactNode> = {
  all:     <IcoGrid />,
  deal:    <IcoTag />,
  sale:    <IcoMarket />,
  service: <IcoWrench />,
  wanted:  <IcoSearch />,
};

function IcoGrid()     { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/></svg>; }
function IcoTag()      { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M14 8l-7 7a1 1 0 01-1.41 0L1.41 10.8A1 1 0 011.4 9.4L8.4 2H14v6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><circle cx="11.5" cy="4.5" r="0.8" fill="currentColor"/></svg>; }
function IcoMarket()   { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 6h10l-.8 7H3.8L3 6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M5.5 6V4.5a2.5 2.5 0 015 0V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function IcoWrench()   { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M10.5 1.5a3 3 0 00-3 3c0 .4.08.78.22 1.13L2 11.35 2.5 13l1.65.5L9.37 7.78A3 3 0 1010.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>; }
function IcoSearch()   { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function IcoPlus()     { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoSave()     { return <svg viewBox="0 0 24 24" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>; }
function IcoVerified() { return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M5 8l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoMsg()      { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M14 2H2a1 1 0 00-1 1v8a1 1 0 001 1h2v2.5L7.5 12H14a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>; }
function IcoX()        { return <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
