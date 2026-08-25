import {
  MOCK_ADMIN_USER_ID,
  MOCK_COMMUNITY_ID,
  MOCK_RESIDENT_USER_ID,
} from "../mock-config";
import { daysFromNow, daysFromNowDatetime, daysFromNowIso, hoursAgo } from "./dates";
import { DEV_MOCK_COMMUNITIES, DEV_MOCK_REGIONS } from "../dev-data";

const COMMUNITY = {
  id: MOCK_COMMUNITY_ID,
  name: "Oak Valley Residences",
  address: "1200 Oak Valley Dr",
  region: "Florida - Miami-Dade County",
  status: "active",
  review_status: "approved",
};

export function buildMockResidentUser() {
  return {
    id: MOCK_RESIDENT_USER_ID,
    uuid: "mock-resident-101",
    name: "Sarah Mitchell",
    email: "sarah.mitchell@example.com",
    phone: "+15555550100",
    role: "resident",
    status: "active",
    community_admin_status: null,
    profile: {
      display_name: "Sarah Mitchell",
      bio: "Unit 4B · Dog mom · Community garden volunteer",
      unit_number: "4B",
      residence_type: "owner",
      avatar_url: "/storage/seed/feed-dog.jpg",
      region_id: 1,
    },
    memberships: [
      {
        id: 10,
        community_id: MOCK_COMMUNITY_ID,
        role: "member",
        status: "approved",
        community: COMMUNITY,
      },
    ],
    access: { can_use_mobile_app: true },
    family: {
      id: 501,
      family_number: "OV-4821",
      name: "Mitchell Family",
      role: "head",
    },
  };
}

export function buildMockAdminUser() {
  return {
    id: MOCK_ADMIN_USER_ID,
    uuid: "mock-admin-201",
    name: "Alex Rivera",
    email: "alex.rivera@oakvalley.com",
    phone: "+15555550200",
    role: "community_admin",
    status: "active",
    community_admin_status: "approved",
    profile: {
      display_name: "Alex Rivera",
      bio: "Community administrator · Oak Valley Residences",
      unit_number: "Office",
      residence_type: "owner",
      avatar_url: "/storage/seed/community-cover.jpg",
      region_id: 1,
    },
    memberships: [
      {
        id: 20,
        community_id: MOCK_COMMUNITY_ID,
        role: "admin",
        status: "approved",
        community: COMMUNITY,
      },
    ],
    access: {
      can_use_mobile_app: true,
      can_use_dashboard: true,
    },
  };
}

function buildNotices() {
  return [
    {
      id: 1001,
      title: "Pool maintenance scheduled",
      body: "The community pool will close Friday 8 AM–2 PM for filter service. Lap lanes reopen by 3 PM.",
      category: "maintenance",
      location: "Pool Deck",
      image_url: "/storage/seed/notice-maintenance.jpg",
      status: "published",
      is_pinned_active: true,
      published_at: hoursAgo(6),
      created_at: hoursAgo(6),
      author_name: "Alex Rivera",
      author_avatar: "/storage/seed/community-cover.jpg",
    },
    {
      id: 1002,
      title: "Severe weather advisory",
      body: "Strong winds expected tonight. Secure balcony furniture and use garage parking if available.",
      category: "emergency",
      location: "Community-wide",
      image_url: "/storage/seed/alert-weather.jpg",
      status: "published",
      is_pinned_active: true,
      published_at: hoursAgo(2),
      created_at: hoursAgo(2),
      author_name: "Alex Rivera",
      author_avatar: "/storage/seed/community-cover.jpg",
    },
    {
      id: 1003,
      title: "Summer BBQ & Movie Night",
      body: "Join neighbors for grilled food, live music, and an outdoor screening on the lawn. RSVP required.",
      category: "event",
      location: "Central Lawn",
      image_url: "/storage/seed/event-bbq.jpg",
      event_date: daysFromNow(5),
      event_time: "17:30:00",
      event_time_end: "21:00:00",
      requires_rsvp: true,
      event_capacity: 80,
      rsvp_count: 34,
      waitlist_count: 2,
      spots_remaining: 46,
      is_full: false,
      is_joined: false,
      status: "published",
      published_at: hoursAgo(48),
      created_at: hoursAgo(48),
      author_name: "Alex Rivera",
      author_avatar: "/storage/seed/community-cover.jpg",
      attendees: [
        { id: 102, name: "Jessica Miller", avatar_url: "/storage/seed/feed-market.jpg" },
        { id: 103, name: "Marcus Chen", avatar_url: "/storage/seed/listing-desk.jpg" },
        { id: 104, name: "Priya Sharma", avatar_url: "/storage/seed/deal-spa.jpg" },
      ],
    },
    {
      id: 1004,
      title: "Town Hall: 2026 Budget Review",
      body: "Review reserve fund updates, amenity upgrades, and Q&A with the board.",
      category: "event",
      location: "Clubhouse",
      image_url: "/storage/seed/event-townhall.jpg",
      event_date: daysFromNow(12),
      event_time: "18:00:00",
      event_time_end: "19:30:00",
      requires_rsvp: true,
      event_capacity: 120,
      rsvp_count: 67,
      spots_remaining: 53,
      status: "published",
      published_at: hoursAgo(72),
      created_at: hoursAgo(72),
      author_name: "Alex Rivera",
    },
    {
      id: 1005,
      title: "Quarterly HOA statements available",
      body: "Statements for Q2 are now in the resident portal. Payment due by the 15th.",
      category: "finance",
      status: "published",
      published_at: hoursAgo(120),
      created_at: hoursAgo(120),
      author_name: "Alex Rivera",
    },
    {
      id: 1006,
      title: "New gate access hours",
      body: "Visitor gate auto-close is now 10 PM on weekdays and 11 PM on weekends.",
      category: "security",
      status: "published",
      published_at: hoursAgo(168),
      created_at: hoursAgo(168),
      author_name: "Alex Rivera",
    },
  ];
}

function buildFeedPosts() {
  return [
    {
      id: 2001,
      body: "Does anyone have a recommendation for a pediatrician near Oak Valley?",
      category: "general",
      author_name: "Jessica Miller",
      author_unit: "2A",
      author_avatar: "/storage/seed/feed-market.jpg",
      author_id: 102,
      likes_count: 14,
      comments_count: 6,
      liked_by_me: false,
      is_mine: false,
      status: "approved",
      created_at: hoursAgo(3),
      image_url: null,
    },
    {
      id: 2002,
      body: "Free moving boxes in the lobby — first come, first served!",
      category: "update",
      author_name: "Marcus Chen",
      author_unit: "7C",
      author_avatar: "/storage/seed/listing-desk.jpg",
      author_id: 103,
      likes_count: 28,
      comments_count: 4,
      liked_by_me: true,
      is_mine: false,
      status: "approved",
      created_at: hoursAgo(8),
      image_url: null,
    },
    {
      id: 2003,
      body: "Morning walk with Luna 🐕 — the community garden is looking amazing this week.",
      category: "update",
      author_name: "Sarah Mitchell",
      author_unit: "4B",
      author_avatar: "/storage/seed/feed-dog.jpg",
      author_id: MOCK_RESIDENT_USER_ID,
      likes_count: 41,
      comments_count: 9,
      liked_by_me: false,
      is_mine: true,
      status: "approved",
      created_at: hoursAgo(20),
      image_url: "/storage/seed/feed-dog.jpg",
    },
    {
      id: 2004,
      body: "Looking for a reliable dog walker for weekday mornings. Any suggestions?",
      category: "help",
      author_name: "Priya Sharma",
      author_unit: "3D",
      author_avatar: "/storage/seed/deal-spa.jpg",
      author_id: 104,
      likes_count: 9,
      comments_count: 11,
      liked_by_me: false,
      is_mine: false,
      status: "approved",
      created_at: hoursAgo(30),
      image_url: null,
    },
    {
      id: 2005,
      body: "Reminder: recycling pickup is tomorrow. Break down boxes please!",
      category: "announcement",
      author_name: "Alex Rivera",
      author_unit: "Office",
      author_avatar: "/storage/seed/community-cover.jpg",
      author_id: MOCK_ADMIN_USER_ID,
      likes_count: 52,
      comments_count: 2,
      liked_by_me: false,
      is_mine: false,
      status: "approved",
      created_at: hoursAgo(52),
      image_url: null,
    },
  ];
}

function buildFeedComments() {
  return {
    2001: [
      {
        id: 3001,
        post_id: 2001,
        parent_id: null,
        depth: 0,
        body: "Dr. Patel at Coral Kids Clinic has been great for our twins.",
        author_name: "Sarah Mitchell",
        author_avatar: "/storage/seed/feed-dog.jpg",
        user_id: MOCK_RESIDENT_USER_ID,
        likes_count: 5,
        liked_by_me: false,
        is_mine: true,
        created_at: hoursAgo(2),
      },
      {
        id: 3002,
        post_id: 2001,
        parent_id: 3001,
        depth: 1,
        body: "Second this — short wait times and they take our insurance.",
        author_name: "Marcus Chen",
        author_avatar: "/storage/seed/listing-desk.jpg",
        user_id: 103,
        likes_count: 2,
        liked_by_me: false,
        is_mine: false,
        created_at: hoursAgo(1),
      },
    ],
    2003: [
      {
        id: 3003,
        post_id: 2003,
        parent_id: null,
        depth: 0,
        body: "Luna is adorable! Which trail do you usually take?",
        author_name: "Jessica Miller",
        author_avatar: "/storage/seed/feed-market.jpg",
        user_id: 102,
        likes_count: 3,
        liked_by_me: true,
        is_mine: false,
        created_at: hoursAgo(18),
      },
    ],
  };
}

function buildDeals() {
  const endsAt = daysFromNowDatetime(21);
  return [
    {
      id: 4001,
      business_id: 5001,
      title: "20% off artisan coffee",
      vendor: "Sunrise Café",
      description: "Show this deal before ordering. Valid on espresso drinks and pastries.",
      type: "deal",
      category: "Food & Drink",
      discount_label: "20% OFF",
      promo_code: "OAKVALLEY20",
      original_price: 6.5,
      discounted_price: 5.2,
      location: "0.4 mi · Main Street",
      image_url: "/storage/seed/deal-coffee.jpg",
      is_featured: true,
      is_liked: true,
      status: "active",
      ends_at: endsAt,
      created_at: hoursAgo(96),
    },
    {
      id: 4002,
      business_id: 5002,
      title: "Family pizza bundle",
      vendor: "Bella Napoli",
      description: "Large pizza + salad + 2 drinks. Dine-in or takeout.",
      type: "deal",
      category: "Restaurants",
      discount_label: "$12 OFF",
      location: "0.8 mi · Oak Plaza",
      image_url: "/storage/seed/deal-pizza.jpg",
      is_featured: false,
      is_liked: false,
      status: "active",
      ends_at: daysFromNowDatetime(14),
      created_at: hoursAgo(120),
    },
    {
      id: 4003,
      business_id: 5003,
      title: "Spa day package",
      vendor: "Serenity Spa",
      description: "60-min massage + express facial at member pricing.",
      type: "deal",
      category: "Wellness",
      discount_label: "30% OFF",
      location: "1.2 mi · Palm Avenue",
      image_url: "/storage/seed/deal-spa.jpg",
      is_featured: true,
      is_liked: false,
      status: "active",
      ends_at: daysFromNowDatetime(30),
      created_at: hoursAgo(200),
    },
  ];
}

function buildBusinesses() {
  return [
    {
      id: 5001,
      name: "Sunrise Café",
      category: "Coffee & Bakery",
      description: "Neighborhood favorite for pour-over coffee and fresh pastries.",
      location: "124 Main Street",
      distance_label: "0.4 mi",
      rating: 4.8,
      review_count: 126,
      image_url: "/storage/seed/business-cafe.jpg",
      status: "approved",
      is_featured: true,
    },
    {
      id: 5002,
      name: "Bella Napoli",
      category: "Italian Restaurant",
      description: "Wood-fired pizza and handmade pasta. Family-friendly patio seating.",
      location: "88 Oak Plaza",
      distance_label: "0.8 mi",
      rating: 4.6,
      review_count: 89,
      image_url: "/storage/seed/business-restaurant.jpg",
      status: "approved",
    },
    {
      id: 5003,
      name: "Serenity Spa",
      category: "Wellness",
      description: "Massage, facials, and wellness packages with resident discounts.",
      location: "410 Palm Avenue",
      distance_label: "1.2 mi",
      rating: 4.9,
      review_count: 54,
      image_url: "/storage/seed/business-salon.jpg",
      status: "approved",
    },
    {
      id: 5004,
      name: "Peak Fitness Studio",
      category: "Fitness",
      description: "Small-group training, yoga, and spin classes.",
      location: "15 Harbor Lane",
      distance_label: "1.5 mi",
      rating: 4.7,
      review_count: 72,
      image_url: "/storage/seed/business-fitness.jpg",
      status: "approved",
    },
  ];
}

function buildListings() {
  return [
    {
      id: 6001,
      title: "West Elm sectional — like new",
      description: "Slate gray fabric, pet-free home. Pickup from unit 4B.",
      type: "for_sale",
      category: "furniture",
      price: 850,
      status: "active",
      image_url: "/storage/seed/listing-sofa.jpg",
      seller_id: MOCK_RESIDENT_USER_ID,
      seller_name: "Sarah Mitchell",
      seller_unit: "4B",
      created_at: hoursAgo(40),
    },
    {
      id: 6002,
      title: "Kids bike — 20 inch",
      description: "Blue Trek bike, lightly used. Helmet included.",
      type: "for_sale",
      category: "kids",
      price: 120,
      status: "active",
      image_url: "/storage/seed/listing-bike.jpg",
      seller_id: 103,
      seller_name: "Marcus Chen",
      seller_unit: "7C",
      created_at: hoursAgo(55),
    },
    {
      id: 6003,
      title: "Standing desk converter",
      description: "Adjustable sit-stand desk riser. Fits 48–60 inch desks.",
      type: "for_sale",
      category: "furniture",
      price: 95,
      status: "pending",
      image_url: "/storage/seed/listing-desk.jpg",
      seller_id: 102,
      seller_name: "Jessica Miller",
      seller_unit: "2A",
      created_at: hoursAgo(12),
    },
    {
      id: 6004,
      title: "Monstera plant collection",
      description: "Three mature monsteras with ceramic pots.",
      type: "for_sale",
      category: "home",
      price: 65,
      status: "active",
      image_url: "/storage/seed/listing-plants.jpg",
      seller_id: 104,
      seller_name: "Priya Sharma",
      seller_unit: "3D",
      created_at: hoursAgo(80),
    },
  ];
}

function buildAmenities() {
  return [
    {
      id: 7001,
      name: "Community Pool",
      description: "Heated lap pool with lounge area. Max 2 guests per household.",
      category: "recreation",
      image_url: "/storage/seed/amenity-pool.jpg",
      status: "active",
      review_status: "approved",
      capacity: 40,
      updated_at: hoursAgo(24),
    },
    {
      id: 7002,
      name: "Fitness Center",
      description: "Cardio machines, free weights, and yoga mats.",
      category: "fitness",
      image_url: "/storage/seed/amenity-gym.jpg",
      status: "active",
      review_status: "approved",
      capacity: 20,
      updated_at: hoursAgo(48),
    },
    {
      id: 7003,
      name: "Clubhouse",
      description: "Event space with kitchenette. Book for private gatherings.",
      category: "events",
      image_url: "/storage/seed/amenity-clubhouse.jpg",
      status: "active",
      review_status: "approved",
      capacity: 50,
      updated_at: hoursAgo(72),
    },
  ];
}

function buildBookings() {
  return [
    {
      id: 8001,
      amenity_id: 7003,
      amenity_name: "Clubhouse",
      date: daysFromNow(3),
      time_slot: "14:00-16:00",
      status: "approved",
      guests: 12,
      notes: "Birthday party",
      created_at: hoursAgo(36),
    },
    {
      id: 8002,
      amenity_id: 7001,
      amenity_name: "Community Pool",
      date: daysFromNow(1),
      time_slot: "10:00-11:00",
      status: "pending",
      guests: 2,
      notes: "Morning swim",
      created_at: hoursAgo(4),
    },
  ];
}

function buildBookingInbox() {
  return [
    {
      id: 8003,
      amenity_id: 7002,
      amenity_name: "Fitness Center",
      resident_name: "Jessica Miller",
      resident_unit: "2A",
      date: daysFromNow(2),
      time_slot: "07:00-08:00",
      status: "pending",
      guests: 1,
      created_at: hoursAgo(2),
    },
    {
      id: 8004,
      amenity_id: 7003,
      amenity_name: "Clubhouse",
      resident_name: "Marcus Chen",
      resident_unit: "7C",
      date: daysFromNow(6),
      time_slot: "18:00-21:00",
      status: "pending",
      guests: 18,
      created_at: hoursAgo(8),
    },
  ];
}

function buildWellness() {
  return {
    hub: {
      stats: {
        total_courses: 12,
        avg_progress: 42,
        week_label: "2h 15m",
      },
      categories: [
        {
          id: 1,
          key: "stress",
          title: "Stress Relief",
          subtitle: "Calm your mind",
          icon_key: "stress",
          color: "#1B4F8A",
          course_count: 3,
          courses_label: "3 courses",
          progress_percent: 60,
          progress_label: "60% complete",
        },
        {
          id: 2,
          key: "fitness",
          title: "Fitness",
          subtitle: "Move your body",
          icon_key: "fitness",
          color: "#059669",
          course_count: 4,
          courses_label: "4 courses",
          progress_percent: 25,
          progress_label: "25% complete",
        },
        {
          id: 3,
          key: "social",
          title: "Social Wellness",
          subtitle: "Connect with others",
          icon_key: "social",
          color: "#7C3AED",
          course_count: 2,
          courses_label: "2 courses",
          progress_percent: 0,
          progress_label: "0% complete",
        },
      ],
    },
    courses: {
      stress: [
        {
          id: 9001,
          title: "5-Minute Breathing Reset",
          description: "Quick techniques to reduce tension during a busy day.",
          image_url: "/storage/seed/wellness-stress.jpg",
          lesson_count: 4,
          duration_min: 20,
          lessons_label: "4 lessons · 20 min",
          progress_percent: 75,
          progress_label: "75% complete",
        },
        {
          id: 9002,
          title: "Mindful Evening Wind-Down",
          description: "Build a calming bedtime routine.",
          image_url: "/storage/seed/wellness-learning.jpg",
          lesson_count: 5,
          duration_min: 35,
          lessons_label: "5 lessons · 35 min",
          progress_percent: 20,
          progress_label: "20% complete",
        },
      ],
      fitness: [
        {
          id: 9003,
          title: "Low-Impact Strength",
          description: "Gentle strength training for all levels.",
          image_url: "/storage/seed/wellness-exercise.jpg",
          lesson_count: 6,
          duration_min: 45,
          lessons_label: "6 lessons · 45 min",
          progress_percent: 10,
          progress_label: "10% complete",
        },
      ],
    },
    courseDetails: {
      9001: {
        id: 9001,
        category_key: "stress",
        category_title: "Stress Relief",
        category_color: "#1B4F8A",
        title: "5-Minute Breathing Reset",
        description: "Quick techniques to reduce tension during a busy day.",
        image_url: "/storage/seed/wellness-stress.jpg",
        completed_count: 3,
        total_count: 4,
        progress_percent: 75,
        lessons: [
          { id: 9101, title: "Introduction", duration_min: 3, time_label: "3 min", completed: true },
          { id: 9102, title: "Box breathing", duration_min: 5, time_label: "5 min", completed: true },
          { id: 9103, title: "Body scan", duration_min: 7, time_label: "7 min", completed: true },
          { id: 9104, title: "Daily practice plan", duration_min: 5, time_label: "5 min", completed: false },
        ],
      },
    },
    lessons: {
      9104: {
        id: 9104,
        course_id: 9001,
        course_title: "5-Minute Breathing Reset",
        course_description: "Quick techniques to reduce tension during a busy day.",
        category_key: "stress",
        category_title: "Stress Relief",
        category_color: "#1B4F8A",
        title: "Daily practice plan",
        description: "Build a simple 5-minute routine you can repeat anywhere.",
        duration_min: 5,
        link_url: "https://example.com/wellness/breathing",
        key_takeaways: ["Practice at the same time daily", "Start with 3 breath cycles", "Track how you feel afterward"],
        completed: false,
      },
    },
  };
}

function buildMessages() {
  return {
    conversations: [
      {
        id: 10001,
        peer: {
          id: 102,
          display_name: "Jessica Miller",
          avatar_url: "/storage/seed/feed-market.jpg",
          unit_number: "2A",
          role: "member",
        },
        last_message: {
          body: "Thanks! I'll pick up the boxes tonight.",
          created_at: hoursAgo(1),
        },
        unread_count: 2,
        updated_at: hoursAgo(1),
      },
      {
        id: 10002,
        peer: {
          id: MOCK_ADMIN_USER_ID,
          display_name: "Alex Rivera",
          avatar_url: "/storage/seed/community-cover.jpg",
          unit_number: "Office",
          role: "admin",
        },
        last_message: {
          body: "Your clubhouse booking is confirmed for Saturday.",
          created_at: hoursAgo(5),
        },
        unread_count: 0,
        updated_at: hoursAgo(5),
      },
    ],
    messages: {
      10001: [
        {
          id: 11001,
          body: "Are the moving boxes still available?",
          sender_id: 102,
          is_mine: false,
          created_at: hoursAgo(3),
        },
        {
          id: 11002,
          body: "Yes! They're stacked near the mailroom.",
          sender_id: MOCK_RESIDENT_USER_ID,
          is_mine: true,
          created_at: hoursAgo(2),
        },
        {
          id: 11003,
          body: "Thanks! I'll pick up the boxes tonight.",
          sender_id: 102,
          is_mine: false,
          created_at: hoursAgo(1),
        },
      ],
    },
  };
}

function buildNotifications() {
  return [
    {
      id: 12001,
      type: "event_reminder",
      title: "Summer BBQ this Friday",
      body: "Don't forget to RSVP for the community BBQ on the central lawn.",
      read_at: null,
      created_at: hoursAgo(4),
      data: { screen: "/screens/event-detail", id: "1003" },
    },
    {
      id: 12002,
      type: "booking_approved",
      title: "Clubhouse booking approved",
      body: "Your reservation for Saturday 2–4 PM is confirmed.",
      read_at: hoursAgo(2),
      created_at: hoursAgo(6),
      data: { screen: "/(tabs)/services/my-booking", id: "8001" },
    },
    {
      id: 12003,
      type: "points_earned",
      title: "You earned 25 points",
      body: "Thanks for completing a wellness lesson!",
      read_at: null,
      created_at: hoursAgo(20),
      data: { screen: "/screens/profile/points-history" },
    },
    {
      id: 12004,
      type: "new_deal",
      title: "New deal: Sunrise Café",
      body: "20% off artisan coffee this month for Oak Valley residents.",
      read_at: null,
      created_at: hoursAgo(48),
      data: { screen: "/(tabs)/marketplace/deal-details", id: "4001" },
    },
  ];
}

function buildPoints() {
  return {
    stats: {
      total_points: 1240,
      rank: 7,
      rank_label: "Community Contributor",
      streak_days: 5,
      next_rank_points: 1500,
      points_to_next_rank: 260,
    },
    history: [
      { id: 1, title: "Completed wellness lesson", subtitle: "5-Minute Breathing Reset", points: 25, action: "lesson_completed", created_at: daysFromNowIso(-1) },
      { id: 2, title: "Community post", subtitle: "Shared a photo in the feed", points: 15, action: "community_post", created_at: daysFromNowIso(-2) },
      { id: 3, title: "Daily login bonus", subtitle: "Day 5 streak", points: 10, action: "daily_login", created_at: daysFromNowIso(-2) },
      { id: 4, title: "Amenity booking", subtitle: "Clubhouse reservation", points: 20, action: "booking", created_at: daysFromNowIso(-4) },
    ],
    leaderboard: {
      entries: [
        { rank: 1, user_id: 104, display_name: "Priya Sharma", unit_number: "3D", points: 2180, avatar_url: "/storage/seed/deal-spa.jpg" },
        { rank: 2, user_id: 103, display_name: "Marcus Chen", unit_number: "7C", points: 1920, avatar_url: "/storage/seed/listing-desk.jpg" },
        { rank: 3, user_id: 102, display_name: "Jessica Miller", unit_number: "2A", points: 1680, avatar_url: "/storage/seed/feed-market.jpg" },
        { rank: 7, user_id: MOCK_RESIDENT_USER_ID, display_name: "Sarah Mitchell", unit_number: "4B", points: 1240, avatar_url: "/storage/seed/feed-dog.jpg", is_me: true },
      ],
      my_rank: 7,
    },
    rank: {
      rank: 7,
      total_points: 1240,
      rank_label: "Community Contributor",
      percentile: 82,
      neighbors_count: 48,
    },
  };
}

function buildAchievements() {
  return {
    earned_count: 2,
    total_count: 8,
    overall_progress_percent: 38,
    earned: [
      {
        key: "early_bird",
        title: "Early Bird",
        subtitle: "Logged in 5 days in a row",
        status_label: "Earned",
        icon: "sunny-outline",
        icon_color: "#D97706",
        icon_bg: "#FFFBEB",
        image_key: "earned_card",
        progress_color: "#FE9A00",
        earned_at: daysFromNowIso(-3),
        earned_date_label: "3 days ago",
        progress: { current: 5, total: 5, percent: 100 },
      },
    ],
    locked: [
      {
        key: "community_star",
        title: "Community Star",
        subtitle: "Receive 50 likes on your posts",
        status_label: "18 / 50 likes",
        icon: "people-outline",
        icon_color: "#D97706",
        icon_bg: "#FFFBEB",
        image_key: "community_star",
        progress_color: "#FE9A00",
        progress: { current: 18, total: 50, percent: 36 },
      },
    ],
    recent: [],
  };
}

function buildFamily() {
  return {
    state: "active",
    family: {
      id: 501,
      family_number: "OV-4821",
      name: "Mitchell Family",
      head_name: "Sarah Mitchell",
      member_count: 3,
    },
    members: [
      {
        user_id: MOCK_RESIDENT_USER_ID,
        display_name: "Sarah Mitchell",
        role: "head",
        unit_number: "4B",
        avatar_url: "/storage/seed/feed-dog.jpg",
        status: "active",
      },
      {
        user_id: 105,
        display_name: "James Mitchell",
        role: "member",
        unit_number: "4B",
        avatar_url: "/storage/seed/listing-tv.jpg",
        status: "active",
      },
      {
        user_id: 106,
        display_name: "Emma Mitchell",
        role: "member",
        unit_number: "4B",
        avatar_url: "/storage/seed/listing-stroller.jpg",
        status: "active",
      },
    ],
    pending_requests: [
      {
        id: 13001,
        user: { display_name: "Daniel Ortiz", unit_number: "5A" },
        message: "Would like to join the Mitchell family account.",
        created_at: hoursAgo(10),
      },
    ],
  };
}

function buildGuests() {
  return [
    {
      id: 14001,
      guest_name: "Michael Torres",
      host_name: "Sarah Mitchell",
      host_unit: "4B",
      status: "active",
      starts_at: daysFromNowIso(-1),
      ends_at: daysFromNowIso(2),
      access_code: "GUEST-4821",
    },
    {
      id: 14002,
      guest_name: "Lisa Wong",
      host_name: "Jessica Miller",
      host_unit: "2A",
      status: "pending",
      starts_at: daysFromNowIso(1),
      ends_at: daysFromNowIso(3),
    },
  ];
}

function buildDocuments() {
  return [
    {
      id: 15001,
      title: "Community Bylaws 2026",
      category: "governance",
      file_size_label: "2.4 MB",
      updated_at: hoursAgo(720),
      download_count: 89,
    },
    {
      id: 15002,
      title: "Pool Rules & Hours",
      category: "amenities",
      file_size_label: "540 KB",
      updated_at: hoursAgo(240),
      download_count: 156,
    },
    {
      id: 15003,
      title: "Architectural Guidelines",
      category: "governance",
      file_size_label: "1.1 MB",
      updated_at: hoursAgo(480),
      download_count: 44,
    },
  ];
}

function buildRules() {
  return [
    {
      id: 16001,
      title: "Quiet Hours",
      body: "Quiet hours are 10 PM – 8 AM daily. Please keep music and gatherings at a considerate volume.",
      category: "community",
      requires_acknowledgement: true,
      acknowledged: true,
      updated_at: hoursAgo(1000),
    },
    {
      id: 16002,
      title: "Pet Policy",
      body: "Dogs must be leashed in common areas. Clean up after pets. Maximum 2 pets per unit.",
      category: "community",
      requires_acknowledgement: true,
      acknowledged: false,
      updated_at: hoursAgo(800),
    },
  ];
}

function buildAdmin() {
  return {
    stats: {
      pending_members: 3,
      pending_listings: 2,
      pending_posts: 1,
      pending_bookings: 2,
      pending_businesses: 1,
      pending_notices: 1,
      pending_amenities: 1,
      pending_approval_total: 11,
      total_members: 148,
      active_events: 2,
      open_deals: 6,
    },
    pending_actions: [
      { type: "membership", user_id: 107, title: "Daniel Ortiz", subtitle: "Unit 5A · Applied 2 days ago" },
      { type: "listing", listing_id: 6003, title: "Standing desk converter", subtitle: "Pending review" },
      { type: "booking", booking_id: 8003, title: "Fitness Center booking", subtitle: "Jessica Miller · Tomorrow 7 AM" },
    ],
    members: [
      { id: 107, display_name: "Daniel Ortiz", unit_number: "5A", email: "daniel@example.com", status: "pending", role: "member", created_at: hoursAgo(48) },
      { id: 108, display_name: "Emily Nguyen", unit_number: "6B", email: "emily@example.com", status: "pending", role: "member", created_at: hoursAgo(72) },
      { id: 109, display_name: "Robert Kim", unit_number: "1C", email: "robert@example.com", status: "approved", role: "member", created_at: hoursAgo(200) },
      { id: 110, display_name: "Aisha Patel", unit_number: "8A", email: "aisha@example.com", status: "approved", role: "member", created_at: hoursAgo(400) },
    ],
    adminNotices: [
      {
        id: 17001,
        title: "Neighborhood yard sale",
        body: "Submitted by Marcus Chen for admin review.",
        category: "event",
        status: "pending",
        review_status: "pending",
        author_name: "Marcus Chen",
        created_at: hoursAgo(6),
      },
    ],
    adminAmenities: [
      {
        id: 7004,
        name: "Tennis Court B",
        description: "Recently resurfaced court — submitted for review.",
        status: "pending",
        review_status: "pending",
        submitted_by: "Jessica Miller",
        created_at: hoursAgo(12),
      },
    ],
  };
}

function buildReferrals() {
  return {
    referral_code: "OAK-SARAH-4821",
    total_referrals: 3,
    pending_referrals: 1,
    earned_rewards: 150,
    referrals: [
      { id: 1, name: "Emily Nguyen", status: "pending", created_at: hoursAgo(96) },
      { id: 2, name: "Robert Kim", status: "completed", reward: 50, created_at: hoursAgo(400) },
    ],
  };
}

function buildNeighbors() {
  return {
    102: {
      id: 102,
      display_name: "Jessica Miller",
      unit_number: "2A",
      bio: "Works from home · Loves hiking",
      avatar_url: "/storage/seed/feed-market.jpg",
      residence_type: "owner",
      points: 1680,
    },
  };
}

/** Deep-cloned initial state for the in-memory mock store. */
export function createInitialMockState() {
  return {
    persona: "resident",
    users: {
      resident: buildMockResidentUser(),
      admin: buildMockAdminUser(),
    },
    regions: [...DEV_MOCK_REGIONS],
    communities: [...DEV_MOCK_COMMUNITIES],
    notices: buildNotices(),
    feedPosts: buildFeedPosts(),
    feedComments: buildFeedComments(),
    deals: buildDeals(),
    businesses: buildBusinesses(),
    listings: buildListings(),
    amenities: buildAmenities(),
    bookings: buildBookings(),
    bookingInbox: buildBookingInbox(),
    wellness: buildWellness(),
    messages: buildMessages(),
    notifications: buildNotifications(),
    points: buildPoints(),
    achievements: buildAchievements(),
    family: buildFamily(),
    guests: buildGuests(),
    documents: buildDocuments(),
    rules: buildRules(),
    admin: buildAdmin(),
    referrals: buildReferrals(),
    neighbors: buildNeighbors(),
    communityMembers: [
      { id: 102, display_name: "Jessica Miller", unit_number: "2A", avatar_url: "/storage/seed/feed-market.jpg", role: "member" },
      { id: 103, display_name: "Marcus Chen", unit_number: "7C", avatar_url: "/storage/seed/listing-desk.jpg", role: "member" },
      { id: 104, display_name: "Priya Sharma", unit_number: "3D", avatar_url: "/storage/seed/deal-spa.jpg", role: "member" },
      { id: MOCK_ADMIN_USER_ID, display_name: "Alex Rivera", unit_number: "Office", avatar_url: "/storage/seed/community-cover.jpg", role: "admin" },
    ],
  };
}

export function cloneMockState(state) {
  return JSON.parse(JSON.stringify(state));
}
