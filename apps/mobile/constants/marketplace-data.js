/** Shared marketplace mock data — single source for hub + detail screens */



import { Media } from "./media";



export const FEATURED_DEALS = [

  {

    id: "joes-burger",

    title: "Joe's Burger Bar",

    description: "20% off all burgers this week",

    distance: "0.5 mi away",

    validUntil: "5 days",

    offerTag: "20% OFF",

    imageKey: "food-bowl",

    image: Media.heroFood,

    gradient: ["#FFFBEB", "#FEF3C6"],

    borderColor: "#FEE685",

    badgeBg: "#FEE685",

    badgeColor: "#BB4D00",

    vendor: "Joe's Burger Bar",

    isTrending: true,

  },

  {

    id: "zenith-fitness",

    title: "Zenith Fitness",

    description: "First week free for new members",

    distance: "1.2 mi away",

    rating: "4.8 (120)",

    offerTag: "FREE TRIAL",

    imageKey: "deal-fitness",

    image: Media.dealFitness,

    gradient: ["#ECFDF5", "#D0FAE5"],

    borderColor: "#A4F4CF",

    badgeBg: "#A4F4CF",

    badgeColor: "#007A55",

    vendor: "Zenith Fitness",

    isTrending: false,

  },

];



export const NEARBY_BUSINESSES = [

  {

    id: "daily-grind",

    title: "The Daily Grind",

    rating: "4.9",

    image: Media.businessCafe,

    imageKey: "business-cafe",

    category: "Cafe",

  },

  {

    id: "oak-spa",

    title: "Oak Valley Spa",

    rating: "4.7",

    image: Media.businessSpa,

    imageKey: "business-spa",

    category: "Wellness",

  },

];



export const MY_COUPONS = [

  {

    id: "coupon-1",

    title: "Joe's Burger Bar",

    offer: "20% OFF",

    expires: "Feb 28, 2026",

    status: "active",

  },

  {

    id: "coupon-2",

    title: "Zenith Fitness",

    offer: "FREE TRIAL",

    expires: "Mar 15, 2026",

    status: "active",

  },

];



export function dealToParams(deal) {

  return {

    title: deal.title,

    vendor: deal.vendor || deal.title,

    description: deal.description,

    distance: deal.distance || "",

    validUntil: deal.validUntil || "",

    offerTag: deal.offerTag || "",

    isTrending: deal.isTrending ? "1" : "0",

    imageKey: deal.imageKey || "food-bowl",

  };

}

