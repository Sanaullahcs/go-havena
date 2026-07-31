import assert from "node:assert/strict";
import {
  buildPropertyHubActivity,
  formatBookingActivityMeta,
  pickAdminPendingBookings,
  pickResidentRecentBookings,
  pickUnacknowledgedRule,
} from "../utils/property-hub-activity.js";

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// formatBookingActivityMeta
assert.equal(formatBookingActivityMeta(todayPlus(0), "6:00 AM").startsWith("Today"), true);
assert.equal(formatBookingActivityMeta(todayPlus(1), "6:00 AM").startsWith("Tomorrow"), true);

// resident recent: includes pending, confirmed, rejected — newest first
const recent = pickResidentRecentBookings([
  {
    id: 1,
    status: "confirmed",
    amenity_name: "Gym",
    date: todayPlus(1),
    updated_at: "2026-07-01T10:00:00Z",
  },
  {
    id: 2,
    status: "rejected",
    amenity_name: "Pool",
    date: todayPlus(2),
    updated_at: "2026-07-20T10:00:00Z",
  },
  {
    id: 3,
    status: "pending",
    amenity_name: "Hall",
    date: todayPlus(3),
    updated_at: "2026-07-15T10:00:00Z",
  },
  {
    id: 4,
    status: "cancelled",
    amenity_name: "Gym",
    date: todayPlus(1),
    updated_at: "2026-07-25T10:00:00Z",
  },
]);
assert.deepEqual(
  recent.map((b) => b.id),
  [2, 3, 1],
);

// admin pending only
const pending = pickAdminPendingBookings([
  { id: 1, status: "confirmed", date: todayPlus(1) },
  { id: 2, status: "pending", date: todayPlus(3), user_name: "A" },
  { id: 3, status: "pending", date: todayPlus(1), user_name: "B" },
]);
assert.deepEqual(
  pending.map((b) => b.id),
  [3, 2],
);

assert.equal(pickUnacknowledgedRule([{ id: 1, needs_action: false }]), null);
assert.equal(pickUnacknowledgedRule([{ id: 2, needs_action: true, title: "Parking" }]).id, 2);

// empty hub
assert.deepEqual(buildPropertyHubActivity({ bookings: [], rules: [], isAdmin: false }), {
  title: "Your reservations",
  items: [],
});

// resident: rejected + pending cards
const resident = buildPropertyHubActivity({
  bookings: [
    {
      id: 9,
      status: "rejected",
      date: todayPlus(1),
      time_slot: "6:00 AM",
      amenity_name: "Gym",
      updated_at: "2026-07-28T10:00:00Z",
    },
    {
      id: 10,
      status: "pending",
      date: todayPlus(2),
      time_slot: "8:00 AM",
      amenity_name: "Pool",
      updated_at: "2026-07-27T10:00:00Z",
    },
  ],
  rules: [],
  isAdmin: false,
});
assert.equal(resident.title, "Your reservations");
assert.equal(resident.items.length, 1);
assert.equal(resident.items[0].type, "danger");
assert.equal(resident.items[0].badge, "Declined");

// resident hub preview does not surface rule alerts in Your reservations
const ruleOnly = buildPropertyHubActivity({
  bookings: [],
  rules: [{ id: 5, title: "Parking Policy", needs_action: true }],
  isAdmin: false,
});
assert.equal(ruleOnly.items.length, 0);

// admin need approval
const admin = buildPropertyHubActivity({
  bookings: [
    {
      id: 11,
      status: "pending",
      date: todayPlus(1),
      time_slot: "9:00 AM",
      amenity_name: "Party Room",
      user_name: "Alex Resident",
      user_unit: "12B",
    },
  ],
  isAdmin: true,
});
assert.equal(admin.title, "Approval queue");
assert.equal(admin.items.length, 1);
assert.equal(admin.items[0].type, "approval");
assert.equal(admin.items[0].routeKey, "ADMIN_BOOKINGS");
assert.match(admin.items[0].meta, /Alex Resident/);

// admin ignores resident rule alerts
const adminNoRules = buildPropertyHubActivity({
  bookings: [],
  rules: [{ id: 5, title: "Parking Policy", needs_action: true }],
  isAdmin: true,
});
assert.equal(adminNoRules.items.length, 0);

console.log("property-hub-activity: all tests passed");
