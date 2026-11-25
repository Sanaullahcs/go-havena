<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Dummy resident-app data for resi@gmail.com (Green Valley).
 * Idempotent: looks up existing rows by name or title before inserting.
 *
 * Run: php artisan db:seed --class=Database\\Seeders\\ResiAccountDemoSeeder
 */
class ResiAccountDemoSeeder extends Seeder
{
    public function run(): void
    {
        $user = DB::table('users')->where('email', 'resi@gmail.com')->first();
        if (! $user) {
            $this->command?->warn('ResiAccountDemoSeeder: resi@gmail.com was not found.');

            return;
        }

        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->where('role', 'member')
            ->orderBy('id')
            ->first();

        if (! $membership) {
            $this->command?->warn('ResiAccountDemoSeeder: no approved resident membership.');

            return;
        }

        $communityId = (int) $membership->community_id;
        $residentId = (int) $user->id;
        $adminId = (int) (DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->where('role', 'admin')
            ->orderBy('user_id')
            ->value('user_id') ?? $residentId);

        $now = now();
        $today = $now->copy()->startOfDay();

        $amenities = $this->seedAmenities($communityId, $adminId, $now);
        $this->seedBookings($amenities, $residentId, $today, $now);
        $this->seedSharedBills($amenities, $communityId, $residentId, $adminId, $today, $now);
        $this->seedNotices($communityId, $residentId, $adminId, $today, $now);
        $this->seedFeed($communityId, $residentId, $adminId, $now);
        $this->seedMarketplace($communityId, $residentId, $adminId, $now);
        $this->seedPropertyService($communityId, $residentId, $adminId, $today, $now);
        $this->seedGuest($communityId, $residentId, $adminId, $now);
        $this->seedRule($communityId, $adminId, $now);

        $this->command?->info("ResiAccountDemoSeeder: dummy data ready for resi@gmail.com in community {$communityId}.");
    }

    private function seedAmenities(int $communityId, int $adminId, $now): array
    {
        $rows = [
            [
                'name' => 'Swimming Pool',
                'description' => 'Heated outdoor pool with loungers, a shallow family end, and towel service. Reserve a 60-minute lane slot. A $25 reservation fee is collected when the booking is confirmed.',
                'status' => 'bookable',
                'capacity' => 30,
                'floor' => 'Garden level',
                'hours' => '6:00 AM – 10:00 PM',
                'start_time' => '06:00:00',
                'end_time' => '22:00:00',
                'weekends_available' => 1,
                'slot_duration_minutes' => 60,
                'icon_key' => 'pool',
                'booking_fee' => 25.00,
            ],
            [
                'name' => 'Tennis Court',
                'description' => 'Lighted hard court for singles or doubles. Bring your own racquets. Court rental is $15 per hour and must be paid before the slot is confirmed.',
                'status' => 'bookable',
                'capacity' => 4,
                'floor' => 'Outdoor courts',
                'hours' => '7:00 AM – 8:00 PM',
                'start_time' => '07:00:00',
                'end_time' => '20:00:00',
                'weekends_available' => 1,
                'slot_duration_minutes' => 60,
                'icon_key' => 'sports',
                'booking_fee' => 15.00,
            ],
            [
                'name' => 'Community Hall',
                'description' => 'Indoor hall for parties and meetings, with tables, chairs, and a small kitchen. Weekend bookings are $75 and include a two-hour slot.',
                'status' => 'bookable',
                'capacity' => 80,
                'floor' => 'Ground floor',
                'hours' => '8:00 AM – 9:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '21:00:00',
                'weekends_available' => 1,
                'slot_duration_minutes' => 120,
                'icon_key' => 'lounge',
                'booking_fee' => 75.00,
            ],
            [
                'name' => 'Meeting Room',
                'description' => 'Quiet room with Wi-Fi, a whiteboard, and seating for 12. Weekday bookings are $10 per hour.',
                'status' => 'bookable',
                'capacity' => 12,
                'floor' => 'Level 1',
                'hours' => '9:00 AM – 6:00 PM',
                'start_time' => '09:00:00',
                'end_time' => '18:00:00',
                'weekends_available' => 0,
                'slot_duration_minutes' => 60,
                'icon_key' => 'meeting',
                'booking_fee' => 10.00,
            ],
            [
                'name' => 'Fitness Center',
                'description' => 'Cardio machines, free weights, and a stretching area. Open access for residents. No reservation fee.',
                'status' => 'open',
                'capacity' => 20,
                'floor' => 'Level 2',
                'hours' => '5:00 AM – 11:00 PM',
                'start_time' => '05:00:00',
                'end_time' => '23:00:00',
                'weekends_available' => 1,
                'slot_duration_minutes' => null,
                'icon_key' => 'gym',
                'booking_fee' => 0,
            ],
            [
                'name' => 'Kids Playground',
                'description' => 'Shaded play area with swings, slides, and soft flooring. Open daily. No booking required.',
                'status' => 'open',
                'capacity' => 25,
                'floor' => 'Garden level',
                'hours' => '8:00 AM – 7:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '19:00:00',
                'weekends_available' => 1,
                'slot_duration_minutes' => null,
                'icon_key' => 'playground',
                'booking_fee' => 0,
            ],
            [
                'name' => 'Residents Clubhouse',
                'description' => 'Shared lounge with a coffee station and reading nook. The monthly upkeep of $40 is split across all residents and billed on the 5th.',
                'status' => 'open',
                'capacity' => 40,
                'floor' => 'Lobby',
                'hours' => '7:00 AM – 10:00 PM',
                'start_time' => '07:00:00',
                'end_time' => '22:00:00',
                'weekends_available' => 1,
                'slot_duration_minutes' => null,
                'icon_key' => 'lounge',
                'booking_fee' => 0,
                'shared_billing_enabled' => 1,
                'shared_billing_type' => 'all_residents',
                'shared_billing_frequency' => 'monthly',
                'shared_billing_amount' => 40.00,
                'shared_billing_due_day' => 5,
            ],
            [
                'name' => 'Residents Lounge',
                'description' => 'Small lobby lounge. Closed this month for carpet replacement.',
                'status' => 'closed',
                'capacity' => 18,
                'floor' => 'Lobby',
                'hours' => '9:00 AM – 5:00 PM',
                'start_time' => '09:00:00',
                'end_time' => '17:00:00',
                'weekends_available' => 0,
                'slot_duration_minutes' => null,
                'icon_key' => 'lounge',
                'booking_fee' => 0,
            ],
        ];

        $ids = [];
        foreach ($rows as $row) {
            $existingId = DB::table('amenities')
                ->where('community_id', $communityId)
                ->where('name', $row['name'])
                ->value('id');

            $payload = array_merge([
                'community_id' => $communityId,
                'created_by' => $adminId,
                'review_status' => 'approved',
                'capacity_booking_type' => 'per_seat',
                'shared_billing_enabled' => 0,
                'shared_billing_type' => null,
                'shared_billing_frequency' => null,
                'shared_billing_amount' => null,
                'shared_billing_due_day' => null,
                'updated_at' => $now,
            ], $row);

            if ($existingId) {
                DB::table('amenities')->where('id', $existingId)->update($payload);
                $ids[$row['name']] = (int) $existingId;
            } else {
                $payload['created_at'] = $now;
                $ids[$row['name']] = (int) DB::table('amenities')->insertGetId($payload);
            }
        }

        return $ids;
    }

    private function seedBookings(array $amenities, int $residentId, $today, $now): void
    {
        $rows = [
            [
                'amenity' => 'Swimming Pool',
                'date' => $today->copy()->addDays(3)->toDateString(),
                'time_slot' => '10:00 AM – 11:00 AM',
                'guests' => 2,
                'booking_fee' => 25.00,
                'status' => 'confirmed',
                'payment_verification_status' => 'approved',
                'payment_method' => 'manual',
                'payment_date' => $today->toDateString(),
                'payment_reference' => 'POOL-1042',
                'payment_note' => 'Paid at the front desk. Receipt attached for testing.',
                'notes' => 'Family swim. Two guests.',
            ],
            [
                'amenity' => 'Tennis Court',
                'date' => $today->copy()->addDays(5)->toDateString(),
                'time_slot' => '6:00 PM – 7:00 PM',
                'guests' => 1,
                'booking_fee' => 15.00,
                'status' => 'awaiting_payment',
                'payment_verification_status' => 'pending',
                'payment_method' => null,
                'notes' => 'Evening singles. Fee still due.',
            ],
            [
                'amenity' => 'Community Hall',
                'date' => $today->copy()->subDays(7)->toDateString(),
                'time_slot' => '4:00 PM – 6:00 PM',
                'guests' => 12,
                'booking_fee' => 75.00,
                'status' => 'confirmed',
                'payment_verification_status' => 'approved',
                'payment_method' => 'manual',
                'payment_date' => $today->copy()->subDays(10)->toDateString(),
                'payment_reference' => 'HALL-8831',
                'payment_note' => 'Birthday gathering. Fee paid in full.',
                'notes' => 'Past booking used to test history and receipts.',
            ],
            [
                'amenity' => 'Meeting Room',
                'date' => $today->copy()->addDay()->toDateString(),
                'time_slot' => '2:00 PM – 3:00 PM',
                'guests' => 4,
                'booking_fee' => 10.00,
                'status' => 'pending',
                'payment_verification_status' => 'not_required',
                'notes' => 'Waiting for admin approval.',
            ],
        ];

        foreach ($rows as $row) {
            $amenityId = $amenities[$row['amenity']] ?? null;
            if (! $amenityId) {
                continue;
            }

            $match = [
                'amenity_id' => $amenityId,
                'user_id' => $residentId,
                'date' => $row['date'],
                'time_slot' => $row['time_slot'],
            ];

            $payload = array_merge($match, [
                'guests' => $row['guests'],
                'booking_fee' => $row['booking_fee'],
                'status' => $row['status'],
                'payment_verification_status' => $row['payment_verification_status'],
                'payment_method' => $row['payment_method'] ?? null,
                'payment_date' => $row['payment_date'] ?? null,
                'payment_reference' => $row['payment_reference'] ?? null,
                'payment_note' => $row['payment_note'] ?? null,
                'notes' => $row['notes'] ?? null,
                'updated_at' => $now,
            ]);

            $existingId = DB::table('bookings')->where($match)->value('id');
            if ($existingId) {
                DB::table('bookings')->where('id', $existingId)->update($payload);
            } else {
                $payload['created_at'] = $now;
                DB::table('bookings')->insert($payload);
            }
        }
    }

    private function seedSharedBills(array $amenities, int $communityId, int $residentId, int $adminId, $today, $now): void
    {
        $amenityId = $amenities['Residents Clubhouse'] ?? null;
        if (! $amenityId) {
            return;
        }

        $months = [
            [
                'billing_month' => $today->copy()->startOfMonth()->subMonth()->toDateString(),
                'title' => 'Clubhouse upkeep — '.$today->copy()->subMonth()->format('F Y'),
                'due_date' => $today->copy()->subMonth()->startOfMonth()->addDays(4)->toDateString(),
                'resident_status' => 'paid',
                'payment_reference' => 'CLUB-SEP',
            ],
            [
                'billing_month' => $today->copy()->startOfMonth()->toDateString(),
                'title' => 'Clubhouse upkeep — '.$today->format('F Y'),
                'due_date' => $today->copy()->startOfMonth()->addDays(4)->toDateString(),
                'resident_status' => 'unpaid',
                'payment_reference' => null,
            ],
        ];

        foreach ($months as $month) {
            $billId = DB::table('amenity_monthly_bills')
                ->where('amenity_id', $amenityId)
                ->where('billing_month', $month['billing_month'])
                ->value('id');

            $billPayload = [
                'amenity_id' => $amenityId,
                'community_id' => $communityId,
                'billing_month' => $month['billing_month'],
                'title' => $month['title'],
                'description' => 'Shared monthly upkeep for the Residents Clubhouse. Coffee, cleaning, and lounge supplies.',
                'amount_per_resident' => 40.00,
                'due_date' => $month['due_date'],
                'status' => 'published',
                'created_by' => $adminId,
                'published_at' => $now,
                'updated_at' => $now,
            ];

            if ($billId) {
                DB::table('amenity_monthly_bills')->where('id', $billId)->update($billPayload);
            } else {
                $billPayload['created_at'] = $now;
                $billId = DB::table('amenity_monthly_bills')->insertGetId($billPayload);
            }

            $residentBill = DB::table('amenity_resident_bills')
                ->where('monthly_bill_id', $billId)
                ->where('user_id', $residentId)
                ->value('id');

            $residentPayload = [
                'monthly_bill_id' => $billId,
                'amenity_id' => $amenityId,
                'community_id' => $communityId,
                'user_id' => $residentId,
                'amount' => 40.00,
                'status' => $month['resident_status'],
                'payment_reference' => $month['payment_reference'],
                'payment_date' => $month['resident_status'] === 'paid' ? $month['due_date'] : null,
                'payment_method' => $month['resident_status'] === 'paid' ? 'manual' : null,
                'payment_note' => $month['resident_status'] === 'paid' ? 'Marked paid for testing.' : null,
                'approved_by' => $month['resident_status'] === 'paid' ? $adminId : null,
                'approved_at' => $month['resident_status'] === 'paid' ? $now : null,
                'updated_at' => $now,
            ];

            if ($residentBill) {
                DB::table('amenity_resident_bills')->where('id', $residentBill)->update($residentPayload);
            } else {
                $residentPayload['created_at'] = $now;
                DB::table('amenity_resident_bills')->insert($residentPayload);
            }
        }
    }

    private function seedNotices(int $communityId, int $residentId, int $adminId, $today, $now): void
    {
        $eventDate = $today->copy()->addDays(6)->toDateString();
        $rows = [
            [
                'title' => 'Pool hours this weekend',
                'category' => 'general',
                'body' => "The swimming pool stays open until 10:00 PM on Saturday and Sunday.\n\nLap lanes are reserved 6:00–8:00 AM. Family swim is open after that. Please shower before entering and keep glass containers off the deck.",
                'location' => 'Swimming Pool, garden level',
                'is_pinned' => 1,
                'published_at' => $now->copy()->subHours(3),
            ],
            [
                'title' => 'Water shutoff on Tuesday',
                'category' => 'maintenance',
                'body' => "Cold water will be off on Tuesday from 9:00 AM to 1:00 PM while the main valve is replaced.\n\nFill bottles the night before. Hot water returns about an hour after the work finishes. The fitness center and playground stay open.",
                'location' => 'All residential units',
                'published_at' => $now->copy()->subDay(),
            ],
            [
                'title' => 'Saturday courtyard picnic',
                'category' => 'event',
                'body' => "Join neighbors for a courtyard picnic. The association provides drinks and a grill. Bring a side dish if you can.\n\nKids activities start at 11:00 AM. RSVP so we can set enough tables.",
                'location' => 'Courtyard lawn',
                'event_date' => $eventDate,
                'event_time' => '11:00 AM',
                'event_time_end' => '2:00 PM',
                'event_capacity' => 60,
                'requires_rsvp' => 1,
                'published_at' => $now->copy()->subHours(8),
                'rsvp' => 'going',
            ],
            [
                'title' => 'Lobby door sensor alert',
                'category' => 'emergency',
                'body' => "The main lobby door sensor is beeping and will be reset tonight after 8:00 PM.\n\nUse the side entrance until the alert clears. Security is on site. This is a test alert with full detail for the resident app.",
                'location' => 'Main lobby',
                'published_at' => $now->copy()->subHours(1),
            ],
            [
                'title' => 'October clubhouse fee is due',
                'category' => 'finance',
                'body' => "The Residents Clubhouse shared fee for this month is $40 per household, due on the 5th.\n\nLast month's payment is already marked paid on your account. Pay the current bill from Amenities or the finance notice. Reference CLUB plus your unit number.",
                'location' => 'Unit 10',
                'published_at' => $now->copy()->subHours(5),
            ],
        ];

        foreach ($rows as $row) {
            $rsvp = $row['rsvp'] ?? null;
            unset($row['rsvp']);

            $noticeId = DB::table('notices')
                ->where('community_id', $communityId)
                ->where('title', $row['title'])
                ->whereNull('deleted_at')
                ->value('id');

            $payload = array_merge([
                'community_id' => $communityId,
                'author_id' => $adminId,
                'status' => 'published',
                'review_status' => 'approved',
                'audience_type' => 'all',
                'is_global' => 0,
                'is_pinned' => 0,
                'requires_rsvp' => 0,
                'approved_by' => $adminId,
                'approved_at' => $now,
                'updated_at' => $now,
            ], $row);

            if ($noticeId) {
                DB::table('notices')->where('id', $noticeId)->update($payload);
            } else {
                $payload['created_at'] = $row['published_at'];
                $noticeId = DB::table('notices')->insertGetId($payload);
            }

            if ($rsvp) {
                $existing = DB::table('event_rsvps')
                    ->where('notice_id', $noticeId)
                    ->where('user_id', $residentId)
                    ->value('id');
                $rsvpPayload = [
                    'notice_id' => $noticeId,
                    'user_id' => $residentId,
                    'status' => $rsvp,
                    'updated_at' => $now,
                ];
                if ($existing) {
                    DB::table('event_rsvps')->where('id', $existing)->update($rsvpPayload);
                } else {
                    $rsvpPayload['created_at'] = $now;
                    DB::table('event_rsvps')->insert($rsvpPayload);
                }
            }
        }
    }

    private function seedFeed(int $communityId, int $residentId, int $adminId, $now): void
    {
        $posts = [
            [
                'user_id' => $residentId,
                'body' => 'The garden roses by unit 10 are blooming. Happy to share cuttings this weekend if anyone wants some.',
                'category' => 'general',
            ],
            [
                'user_id' => $adminId,
                'body' => 'Reminder: guest parking passes are at the front desk. Overnight guests need a pass on the dashboard.',
                'category' => 'announcement',
            ],
        ];

        foreach ($posts as $post) {
            $existing = DB::table('posts')
                ->where('community_id', $communityId)
                ->where('user_id', $post['user_id'])
                ->where('body', $post['body'])
                ->whereNull('deleted_at')
                ->value('id');

            if ($existing) {
                continue;
            }

            DB::table('posts')->insert([
                'community_id' => $communityId,
                'user_id' => $post['user_id'],
                'body' => $post['body'],
                'category' => $post['category'],
                'status' => 'approved',
                'approved_by' => $adminId,
                'approved_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $question = 'Should the picnic include a kids craft table?';
        $pollPostId = DB::table('posts')
            ->where('community_id', $communityId)
            ->where('category', 'poll')
            ->whereNull('deleted_at')
            ->whereIn('id', function ($query) use ($question) {
                $query->select('post_id')->from('polls')->where('question', $question);
            })
            ->value('id');

        if (! $pollPostId) {
            $pollPostId = DB::table('posts')->insertGetId([
                'community_id' => $communityId,
                'user_id' => $adminId,
                'body' => $question,
                'category' => 'poll',
                'status' => 'approved',
                'approved_by' => $adminId,
                'approved_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $pollId = DB::table('polls')->insertGetId([
                'post_id' => $pollPostId,
                'question' => $question,
                'description' => 'Tell us before Saturday so we can set up the courtyard.',
                'duration_days' => 7,
                'ends_at' => $now->copy()->addDays(7),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            foreach (['Yes, add crafts', 'No, keep it simple'] as $index => $label) {
                DB::table('poll_options')->insert([
                    'poll_id' => $pollId,
                    'label' => $label,
                    'position' => $index + 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    private function seedMarketplace(int $communityId, int $residentId, int $adminId, $now): void
    {
        $listingTitle = 'Standing desk, barely used';
        $listingId = DB::table('listings')
            ->where('community_id', $communityId)
            ->where('user_id', $residentId)
            ->where('title', $listingTitle)
            ->whereNull('deleted_at')
            ->value('id');

        $listing = [
            'community_id' => $communityId,
            'user_id' => $residentId,
            'type' => 'for_sale',
            'category' => 'Furniture',
            'condition' => 'Like new',
            'title' => $listingTitle,
            'price' => 120.00,
            'description' => 'White standing desk, 48 inches wide. Height adjusts from sitting to standing. Pickup from unit 10 after 5 PM.',
            'location' => 'Unit 10',
            'status' => 'approved',
            'is_verified' => 1,
            'approved_at' => $now,
            'approved_by' => $adminId,
            'updated_at' => $now,
        ];

        if ($listingId) {
            DB::table('listings')->where('id', $listingId)->update($listing);
        } else {
            $listing['created_at'] = $now;
            DB::table('listings')->insert($listing);
        }

        $dealTitle = 'Green Valley Cafe — 15% off lunch';
        $dealId = DB::table('deals')
            ->where('community_id', $communityId)
            ->where('title', $dealTitle)
            ->whereNull('deleted_at')
            ->value('id');

        $deal = [
            'community_id' => $communityId,
            'created_by' => $adminId,
            'title' => $dealTitle,
            'vendor' => 'Green Valley Cafe',
            'description' => 'Show this offer at the counter for 15% off any lunch plate. Valid for Green Valley residents through the end of the month. Dine-in only.',
            'type' => 'offer',
            'discount_label' => '15% off',
            'promo_code' => 'VALLEY15',
            'category' => 'Food',
            'location' => 'Cafe by the main gate',
            'is_featured' => 1,
            'status' => 'active',
            'starts_at' => $now->copy()->subDay(),
            'ends_at' => $now->copy()->addDays(30),
            'updated_at' => $now,
        ];

        if ($dealId) {
            DB::table('deals')->where('id', $dealId)->update($deal);
        } else {
            $deal['created_at'] = $now;
            DB::table('deals')->insert($deal);
        }
    }

    private function seedPropertyService(int $communityId, int $residentId, int $adminId, $today, $now): void
    {
        $unitId = DB::table('units')
            ->where('community_id', $communityId)
            ->where('unit_number', '10')
            ->value('id');

        if (! $unitId) {
            return;
        }

        $serviceName = 'Water service';
        $serviceId = DB::table('property_services')
            ->where('community_id', $communityId)
            ->where('name', $serviceName)
            ->value('id');

        $service = [
            'community_id' => $communityId,
            'created_by' => $adminId,
            'name' => $serviceName,
            'category' => 'water',
            'description' => 'Monthly water charge for the unit. Pay from Property Services. Keep the payment reference for your records.',
            'icon_key' => 'water',
            'status' => 'active',
            'application_type' => 'automatic',
            'billing_frequency' => 'monthly',
            'amount_type' => 'fixed',
            'amount' => 45.00,
            'due_day' => 10,
            'first_billing_month' => $today->copy()->startOfMonth()->subMonth()->toDateString(),
            'payment_instructions' => 'Pay the association office or upload proof in the app. Use reference WATER-10.',
            'require_payment_proof' => 1,
            'auto_generate_bills' => 0,
            'send_notice' => 1,
            'notice_title' => 'Water bill is ready',
            'notice_body' => 'Your monthly water charge is available in Property Services.',
            'updated_at' => $now,
        ];

        if ($serviceId) {
            DB::table('property_services')->where('id', $serviceId)->update($service);
        } else {
            $service['created_at'] = $now;
            $serviceId = DB::table('property_services')->insertGetId($service);
        }

        $subscriptionId = DB::table('unit_service_subscriptions')
            ->where('service_id', $serviceId)
            ->where('unit_id', $unitId)
            ->value('id');

        $subscription = [
            'community_id' => $communityId,
            'service_id' => $serviceId,
            'unit_id' => $unitId,
            'requested_by' => $residentId,
            'status' => 'active',
            'reviewed_by' => $adminId,
            'reviewed_at' => $now,
            'starts_at' => $now->copy()->subMonth(),
            'updated_at' => $now,
        ];

        if ($subscriptionId) {
            DB::table('unit_service_subscriptions')->where('id', $subscriptionId)->update($subscription);
        } else {
            $subscription['created_at'] = $now;
            DB::table('unit_service_subscriptions')->insert($subscription);
        }

        $periods = [
            [
                'billing_period' => $today->copy()->startOfMonth()->subMonth()->toDateString(),
                'title' => 'Water — '.$today->copy()->subMonth()->format('F Y'),
                'due_date' => $today->copy()->subMonth()->startOfMonth()->addDays(9)->toDateString(),
                'status' => 'paid',
            ],
            [
                'billing_period' => $today->copy()->startOfMonth()->toDateString(),
                'title' => 'Water — '.$today->format('F Y'),
                'due_date' => $today->copy()->startOfMonth()->addDays(9)->toDateString(),
                'status' => 'unpaid',
            ],
        ];

        foreach ($periods as $period) {
            $billId = DB::table('unit_service_bills')
                ->where('service_id', $serviceId)
                ->where('unit_id', $unitId)
                ->where('billing_period', $period['billing_period'])
                ->value('id');

            $bill = [
                'community_id' => $communityId,
                'service_id' => $serviceId,
                'unit_id' => $unitId,
                'billing_contact_user_id' => $residentId,
                'created_by' => $adminId,
                'billing_period' => $period['billing_period'],
                'title' => $period['title'],
                'description' => 'Fixed monthly water charge for unit 10.',
                'amount' => 45.00,
                'due_date' => $period['due_date'],
                'status' => $period['status'],
                'payment_instructions' => 'Reference WATER-10 when you pay.',
                'require_payment_proof' => 1,
                'payment_reference' => $period['status'] === 'paid' ? 'WATER-10-PAID' : null,
                'payment_date' => $period['status'] === 'paid' ? $period['due_date'] : null,
                'payment_note' => $period['status'] === 'paid' ? 'Paid for testing.' : null,
                'approved_by' => $period['status'] === 'paid' ? $adminId : null,
                'approved_at' => $period['status'] === 'paid' ? $now : null,
                'updated_at' => $now,
            ];

            if ($billId) {
                DB::table('unit_service_bills')->where('id', $billId)->update($bill);
            } else {
                $bill['created_at'] = $now;
                DB::table('unit_service_bills')->insert($bill);
            }
        }
    }

    private function seedGuest(int $communityId, int $residentId, int $adminId, $now): void
    {
        $code = 'RESIDEMO10';
        $existing = DB::table('guest_invitations')->where('invite_code', $code)->value('id');
        $payload = [
            'community_id' => $communityId,
            'invited_by_user_id' => $residentId,
            'invitation_type' => 'resident',
            'guest_name' => 'Alex Rivera',
            'guest_email' => 'alex.rivera.demo@example.com',
            'guest_phone' => '+15551234010',
            'invite_code' => $code,
            'starts_at' => $now->copy()->addDays(2)->setTime(15, 0),
            'ends_at' => $now->copy()->addDays(3)->setTime(11, 0),
            'status' => 'active',
            'approved_by_user_id' => $adminId,
            'approved_at' => $now,
            'updated_at' => $now,
        ];

        if ($existing) {
            DB::table('guest_invitations')->where('id', $existing)->update($payload);
        } else {
            $payload['created_at'] = $now;
            DB::table('guest_invitations')->insert($payload);
        }
    }

    private function seedRule(int $communityId, int $adminId, $now): void
    {
        $title = 'Quiet hours';
        $existing = DB::table('community_rules')
            ->where('community_id', $communityId)
            ->where('title', $title)
            ->whereNull('deleted_at')
            ->value('id');

        $payload = [
            'community_id' => $communityId,
            'created_by' => $adminId,
            'title' => $title,
            'category' => 'Community living',
            'description' => 'Quiet hours are 10:00 PM to 8:00 AM. Keep music, construction, and balcony gatherings low enough that neighbors cannot hear them through a closed door. Pool and hall bookings must end by 9:00 PM on weeknights.',
            'severity' => 'important',
            'requires_acknowledgment' => 1,
            'status' => 'active',
            'updated_at' => $now,
        ];

        if ($existing) {
            DB::table('community_rules')->where('id', $existing)->update($payload);
        } else {
            $payload['created_at'] = $now;
            DB::table('community_rules')->insert($payload);
        }
    }
}
