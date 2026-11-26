<?php

namespace Database\Seeders\Support;

use Database\Seeders\AidaMuscatCommunitySeeder;
use Database\Seeders\AidaMuscatContentSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Idempotent demo content for AIDA Muscat (English + Arabic).
 */
class AidaMuscatDemoContent
{
    private int $cid;

    private int $adminId;

    /** @var array<string, int> */
    private array $people = [];

    public function __construct(
        private readonly AidaMuscatContentSeeder $seeder,
        int $communityId,
    ) {
        $this->cid = $communityId;
    }

    public function run(): void
    {
        $this->people = $this->resolvePeople();
        $this->adminId = (int) ($this->people[AidaMuscatCommunitySeeder::ADMIN_EMAIL] ?? 0);
        if ($this->adminId === 0) {
            $this->seeder->log('AIDA admin not found.');

            return;
        }

        $this->resetSeededContent();
        $this->seedCategories();
        $amenities = $this->seedAmenities();
        $this->seedBookings($amenities);
        $this->seedPropertyServices();
        $this->seedNotices();
        $this->seedAlerts();
        $this->seedEvents();
        $this->seedFeed();
        $this->seedBusinessesAndDeals();
        $this->seedListings();
        $this->seedRules();
        $this->seedDocuments();
        $this->seedDocumentAssignments();
        $staff = $this->seedStaff();
        $this->seedComplaints($staff);
        $this->seedNotifications();
    }

    private function img(string $key): string
    {
        static $aida = null;
        static $gulf = null;

        if ($aida === null) {
            $aida = [];
            foreach (glob(storage_path('app/public/seed/aida/*.jpg')) ?: [] as $path) {
                $aida[basename($path, '.jpg')] = true;
            }
            $gulf = [];
            foreach (glob(storage_path('app/public/seed/gulf/*.jpg')) ?: [] as $path) {
                $gulf[basename($path, '.jpg')] = true;
            }
        }

        if (isset($aida[$key])) {
            return "/storage/seed/aida/{$key}.jpg";
        }
        if (isset($gulf[$key])) {
            return "/storage/seed/gulf/{$key}.jpg";
        }

        return "/storage/seed/{$key}.jpg";
    }

    /** @return array<string, int> */
    private function resolvePeople(): array
    {
        $emails = array_merge(
            [AidaMuscatCommunitySeeder::ADMIN_EMAIL],
            array_column(AidaMuscatCommunitySeeder::RESIDENTS, 'email'),
        );

        return DB::table('users')
            ->whereIn('email', $emails)
            ->pluck('id', 'email')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function uid(string $email): ?int
    {
        return $this->people[$email] ?? null;
    }

    /** @return list<int> */
    private function approvedResidentIds(): array
    {
        return DB::table('community_memberships')
            ->where('community_id', $this->cid)
            ->where('status', 'approved')
            ->whereIn('role', ['member', 'moderator'])
            ->orderBy('user_id')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function resetSeededContent(): void
    {
        if (Schema::hasTable('complaint_assignments')) {
            $complaintIds = DB::table('complaints')->where('community_id', $this->cid)->pluck('id');
            if ($complaintIds->isNotEmpty()) {
                DB::table('complaint_assignments')->whereIn('complaint_id', $complaintIds)->delete();
                DB::table('complaint_messages')->whereIn('complaint_id', $complaintIds)->delete();
                DB::table('complaints')->whereIn('id', $complaintIds)->delete();
            }
        }

        if (Schema::hasTable('community_staff')) {
            DB::table('community_staff')->where('community_id', $this->cid)->delete();
        }

        if (Schema::hasTable('community_document_assignments')) {
            $docIds = DB::table('community_documents')->where('community_id', $this->cid)->pluck('id');
            if ($docIds->isNotEmpty()) {
                DB::table('community_document_assignments')->whereIn('document_id', $docIds)->delete();
            }
        }

        $amenityIds = DB::table('amenities')->where('community_id', $this->cid)->pluck('id');
        if ($amenityIds->isNotEmpty()) {
            $bookingIds = DB::table('bookings')->whereIn('amenity_id', $amenityIds)->pluck('id');
            if ($bookingIds->isNotEmpty() && Schema::hasTable('booking_slot_allocations')) {
                DB::table('booking_slot_allocations')->whereIn('booking_id', $bookingIds)->delete();
            }
            DB::table('bookings')->whereIn('amenity_id', $amenityIds)->delete();
            DB::table('amenities')->where('community_id', $this->cid)->delete();
        }

        if (Schema::hasTable('unit_service_bills')) {
            DB::table('unit_service_bills')->where('community_id', $this->cid)->delete();
        }
        if (Schema::hasTable('unit_service_subscriptions')) {
            DB::table('unit_service_subscriptions')->where('community_id', $this->cid)->delete();
        }
        if (Schema::hasTable('property_services')) {
            DB::table('property_services')->where('community_id', $this->cid)->delete();
        }

        $noticeIds = DB::table('notices')->where('community_id', $this->cid)->pluck('id');
        if ($noticeIds->isNotEmpty()) {
            if (Schema::hasTable('event_rsvps')) {
                DB::table('event_rsvps')->whereIn('notice_id', $noticeIds)->delete();
            }
            DB::table('notices')->where('community_id', $this->cid)->delete();
        }

        $postIds = DB::table('posts')->where('community_id', $this->cid)->pluck('id');
        if ($postIds->isNotEmpty()) {
            DB::table('post_comments')->whereIn('post_id', $postIds)->delete();
            DB::table('post_likes')->whereIn('post_id', $postIds)->delete();
            DB::table('posts')->where('community_id', $this->cid)->delete();
        }

        if (Schema::hasTable('listings')) {
            $listingIds = DB::table('listings')->where('community_id', $this->cid)->pluck('id');
            if ($listingIds->isNotEmpty() && Schema::hasTable('listing_saves')) {
                DB::table('listing_saves')->whereIn('listing_id', $listingIds)->delete();
            }
            DB::table('listings')->where('community_id', $this->cid)->delete();
        }

        if (Schema::hasTable('deals')) {
            DB::table('deals')->where('community_id', $this->cid)->delete();
        }
        if (Schema::hasTable('businesses')) {
            DB::table('businesses')->where('community_id', $this->cid)->delete();
        }

        $ruleIds = DB::table('community_rules')->where('community_id', $this->cid)->pluck('id');
        if ($ruleIds->isNotEmpty() && Schema::hasTable('rule_acknowledgments')) {
            DB::table('rule_acknowledgments')->whereIn('rule_id', $ruleIds)->delete();
        }
        DB::table('community_rules')->where('community_id', $this->cid)->delete();

        if (Schema::hasTable('community_documents')) {
            DB::table('community_documents')->where('community_id', $this->cid)->delete();
        }

        if (Schema::hasTable('app_notifications')) {
            DB::table('app_notifications')
                ->whereIn('user_id', array_values($this->people))
                ->where('data', 'like', '%"community_id":'.$this->cid.'%')
                ->delete();
        }
    }

    private function seedCategories(): void
    {
        foreach (['Access', 'Landscaping', 'Golf & Recreation', 'Security', 'Facilities', 'Billing'] as $name) {
            DB::table('community_rule_categories')->updateOrInsert(
                ['community_id' => $this->cid, 'name' => $name],
                ['updated_at' => now(), 'created_at' => now()->subMonths(10)],
            );
        }
        foreach (['Policies', 'Agreements', 'Safety', 'Welcome', 'Billing'] as $name) {
            DB::table('community_document_categories')->updateOrInsert(
                ['community_id' => $this->cid, 'name' => $name],
                ['updated_at' => now(), 'created_at' => now()->subMonths(10)],
            );
        }
    }

    /** @return array<string, int> */
    private function seedAmenities(): array
    {
        $rows = [
            ['Golf Course', 'Coastal championship layout between the fairway villas and the Gulf of Oman. Tee times are released through the starter and resident carts have priority before 9am.', 'bookable', 4, '06:30:00', '18:30:00', 45, 'golf', 'amenity-golf', 25.000, 'ملعب الغولف', 'ملعب غولف ساحلي بين الفيلات وخليج عُمان. أوقات الانطلاق عبر مكتب البداية.'],
            ['Infinity Swimming Pool', 'Cliff-edge pool looking over the Gulf of Oman. A lifeguard is rostered during the posted hours. Children under 12 swim with an adult.', 'bookable', 40, '07:00:00', '20:00:00', 60, 'droplet', 'amenity-pool', 0, 'مسبح لامتناهي', 'مسبح بإطلالة على خليج عُمان.'],
            ['Fitness Centre', 'Cardio, free weights and a functional bay inside the clubhouse. Towels are at the desk. Residents and registered guests only.', 'bookable', 25, '06:00:00', '22:00:00', 60, 'dumbbell', 'amenity-fitness', 0, 'مركز اللياقة', 'أجهزة كارديو وأوزان حرة داخل النادي. المناشف عند الاستقبال.'],
            ['Wellness and Spa Centre', 'Hammam, massage and recovery sessions by appointment. The menu is posted at the desk. This is a wellness studio, not a medical clinic.', 'bookable', 8, '10:00:00', '20:00:00', 90, 'heart', 'amenity-spa', 15.000, 'العافية والسبا', 'حمام مغربي ومساج وجلسات استشفاء بموعد مسبق.'],
            ['Community Clubhouse', 'Welcome desk, resident lounge and the room used for heritage evenings and committee meetings.', 'open', 120, '08:00:00', '22:00:00', 0, 'home', 'amenity-clubhouse', 0, 'نادي المجتمع', 'مكتب الخدمات والاستقبال.'],
            ['Outdoor Yoga Area', 'Shaded deck above the coastal path. Mats live in the chest by the steps. Sessions finish on time so the deck can be booked after.', 'bookable', 20, '06:00:00', '19:00:00', 60, 'sun', 'amenity-yoga', 0, 'منطقة اليوغا', 'سطح مظلّل للجلسات الصباحية.'],
            ['Children\'s Play Area', 'Fenced soft-play beside Sunrise Haven, with a shade sail over the slide. Close the gate on the way out.', 'open', 30, '08:00:00', '20:00:00', 0, 'smile', 'amenity-playground', 0, 'منطقة الألعاب', 'منطقة ألعاب آمنة للأطفال.'],
            ['Walking and Cycling Trails', 'Marked coastal and wadi-edge paths. After rain, stay on the stone route — the wadi bed is not a shortcut.', 'open', 0, '05:30:00', '21:00:00', 0, 'map', 'amenity-trails', 0, 'مسارات المشي', 'مسارات ساحلية للمشي وركوب الدراجات.'],
            ['Private Event Lounge', 'Resident lounge for dinners of up to thirty-five. The 40 OMR hire covers the room, glassware and setup. Catering is arranged separately.', 'bookable', 35, '10:00:00', '23:00:00', 120, 'users', 'amenity-lounge', 40.000, 'صالة المناسبات', 'صالة للمناسبات حتى ٣٥ شخصاً. الرسوم تشمل القاعة والتجهيز.'],
            ['Outdoor Recreation Area', 'The coastal lawn used for sunset gatherings, Eid morning and the Ramadan iftar. Residents and their registered guests.', 'open', 200, '08:00:00', '22:00:00', 0, 'flag', 'amenity-recreation', 0, 'منطقة الترفيه', 'الساحة الخضراء لتجمعات الغروب والإفطار والعيد.'],
        ];

        $ids = [];
        foreach ($rows as $row) {
            $payload = [
                'community_id' => $this->cid,
                'created_by' => $this->adminId,
                'name' => $row[0],
                'description' => $row[1],
                'status' => $row[2],
                'review_status' => 'approved',
                'capacity' => $row[3],
                'floor' => 'AIDA Yenkit',
                'hours' => match ($row[0]) {
                    'Golf Course' => 'Daily 6:30 AM – 6:30 PM',
                    'Infinity Swimming Pool' => 'Daily 7:00 AM – 8:00 PM',
                    'Fitness Centre' => 'Daily 6:00 AM – 10:00 PM',
                    'Wellness and Spa Centre' => 'Daily 10:00 AM – 8:00 PM',
                    'Community Clubhouse' => 'Daily 8:00 AM – 10:00 PM',
                    'Outdoor Yoga Area' => 'Daily 6:00 AM – 7:00 PM',
                    'Children\'s Play Area' => 'Daily 8:00 AM – 8:00 PM',
                    'Walking and Cycling Trails' => 'Daily 5:30 AM – 9:00 PM',
                    'Private Event Lounge' => 'Daily 10:00 AM – 11:00 PM',
                    default => 'Daily 8:00 AM – 10:00 PM',
                },
                'start_time' => $row[4],
                'end_time' => $row[5],
                'weekends_available' => true,
                'slot_duration_minutes' => $row[6] ?: null,
                'icon_key' => $row[7],
                'image_url' => $this->img($row[8]),
                'booking_fee' => $row[9],
                'updated_at' => now(),
            ];
            if (Schema::hasColumn('amenities', 'name_ar')) {
                $payload['name_ar'] = $row[10];
                $payload['description_ar'] = $row[11];
            }

            $existing = DB::table('amenities')->where('community_id', $this->cid)->where('name', $row[0])->value('id');
            if ($existing) {
                DB::table('amenities')->where('id', $existing)->update($payload);
                $ids[$row[0]] = (int) $existing;
            } else {
                $ids[$row[0]] = (int) DB::table('amenities')->insertGetId($payload + ['created_at' => now()->subMonths(8)]);
            }
        }

        $this->seeder->log('  Amenities: '.count($rows));

        return $ids;
    }

    /** @param array<string, int> $amenities */
    private function seedBookings(array $amenities): void
    {
        $zaeem = $this->uid('zaeem.chaudhry@gmail.com');
        $faisal = $this->uid('faisalaljamil@gmail.com');
        $golfId = $amenities['Golf Course'] ?? null;
        $poolId = $amenities['Infinity Swimming Pool'] ?? null;
        if (! $golfId || ! $zaeem) {
            return;
        }

        $rows = [
            [$golfId, $zaeem, now()->addDays(4)->toDateString(), '08:00 AM - 10:00 AM', 2, 'confirmed', 'Morning tee, Fairway Villas.'],
            [$poolId, $faisal, now()->addDays(2)->toDateString(), '05:00 PM - 06:00 PM', 4, 'confirmed', 'Family swim.'],
            [$amenities['Private Event Lounge'] ?? $golfId, $zaeem, now()->addDays(12)->toDateString(), '07:00 PM - 11:00 PM', 22, 'pending', 'Resident lounge gathering.'],
        ];

        foreach ($rows as [$amenityId, $userId, $date, $slot, $guests, $status, $notes]) {
            if (! $amenityId || ! $userId) {
                continue;
            }
            $exists = DB::table('bookings')
                ->where('amenity_id', $amenityId)
                ->where('user_id', $userId)
                ->where('date', $date)
                ->where('time_slot', $slot)
                ->exists();
            if ($exists) {
                continue;
            }
            $payload = [
                'amenity_id' => $amenityId,
                'user_id' => $userId,
                'date' => $date,
                'time_slot' => $slot,
                'guests' => $guests,
                'status' => $status,
                'notes' => $notes,
                'created_at' => now()->subDay(),
                'updated_at' => now(),
            ];
            if (Schema::hasColumn('bookings', 'booking_fee')) {
                $payload['booking_fee'] = $slot === '08:00 AM - 10:00 AM' ? 25.000 : 0;
            }
            DB::table('bookings')->insert($payload);
        }
    }

    private function seedPropertyServices(): void
    {
        if (! Schema::hasTable('property_services')) {
            return;
        }

        $services = [
            ['AIDA Community Service Charge', 'maintenance', 'automatic', 185.500, 5, 'Monthly community service charge for villa collections.'],
            ['Landscaping & Garden Care', 'landscaping', 'automatic', 22.000, 15, 'Villa garden maintenance per month.'],
            ['Pool & Facility Care', 'facilities', 'optional', 12.500, 20, 'Shared facility upkeep contribution.'],
        ];

        $serviceIds = [];
        foreach ($services as [$name, $category, $type, $amount, $dueDay, $desc]) {
            $payload = [
                'community_id' => $this->cid,
                'created_by' => $this->adminId,
                'name' => $name,
                'category' => $category,
                'description' => $desc,
                'icon_key' => 'receipt',
                'status' => 'active',
                'application_type' => $type,
                'billing_frequency' => 'monthly',
                'amount_type' => 'fixed',
                'amount' => $amount,
                'due_day' => $dueDay,
                'require_payment_proof' => true,
                'send_notice' => false,
                'send_notification' => false,
                'updated_at' => now(),
            ];
            $existing = DB::table('property_services')->where('community_id', $this->cid)->where('name', $name)->value('id');
            if ($existing) {
                DB::table('property_services')->where('id', $existing)->update($payload);
                $serviceIds[$name] = (int) $existing;
            } else {
                $serviceIds[$name] = (int) DB::table('property_services')->insertGetId($payload + ['created_at' => now()->subMonths(6)]);
            }
        }

        if (! Schema::hasTable('unit_service_bills')) {
            return;
        }

        $units = DB::table('units')->where('community_id', $this->cid)->where('kind', 'residential')->pluck('id', 'unit_number');
        $residents = AidaMuscatCommunitySeeder::RESIDENTS;
        $states = ['paid', 'unpaid', 'pending_verification', 'unpaid', 'paid', 'unpaid'];
        $i = 0;

        foreach ($residents as $person) {
            $unitId = $units[$person['unit']] ?? null;
            $userId = $this->uid($person['email']);
            if (! $unitId || ! $userId) {
                continue;
            }
            foreach ($serviceIds as $serviceName => $serviceId) {
                $month = now()->startOfMonth()->subMonths($i % 3);
                $status = $states[$i % count($states)];
                $due = $month->copy()->day(10);
                if ($status === 'unpaid' && $i % 4 === 3) {
                    $due = now()->subDays(12);
                }
                $amount = (float) DB::table('property_services')->where('id', $serviceId)->value('amount');
                DB::table('unit_service_bills')->updateOrInsert(
                    [
                        'service_id' => $serviceId,
                        'unit_id' => $unitId,
                        'billing_period' => $month->toDateString(),
                    ],
                    [
                        'community_id' => $this->cid,
                        'billing_contact_user_id' => $userId,
                        'created_by' => $this->adminId,
                        'title' => $serviceName.' — '.$month->format('F Y'),
                        'description' => $serviceName.' for '.$person['unit'].'.',
                        'amount' => $amount,
                        'due_date' => $due->toDateString(),
                        'status' => $status,
                        'require_payment_proof' => true,
                        'payment_reference' => $status === 'paid' ? 'AIDA-'.$month->format('ym').'-'.($i + 100) : null,
                        'payment_date' => $status === 'paid' ? $due->copy()->subDays(2)->toDateString() : null,
                        'approved_by' => $status === 'paid' ? $this->adminId : null,
                        'approved_at' => $status === 'paid' ? now()->subDays(1) : null,
                        'created_at' => $month,
                        'updated_at' => now(),
                    ]
                );
                $i++;
            }
        }
    }

    private function seedNotices(): void
    {
        $items = [
            ['Welcome to AIDA Muscat', 'general', 'Welcome to AIDA by DarGlobal on the Yiti and Yenkit coastline. Use this app for notices, events, amenity bookings, billing and community messaging. The management office is open Sunday–Thursday, 8:30am–5:30pm at the Yenkit welcome centre.', 'مرحباً بكم في عيدة مسقط', 'مرحباً بكم في مجتمع عيدة الساحلي. استخدموا التطبيق للإشعارات والفعاليات والحجوزات.', 'notice-welcome', 2, true, 45],
            ['Community Management Office Hours', 'general', 'Office hours: Sunday to Thursday 8:30am–5:30pm, Friday 9:00am–1:00pm. Emergency security line remains 24/7 via the gatehouse.', 'ساعات مكتب الإدارة', 'من الأحد إلى الخميس ٨:٣٠ ص–٥:٣٠ م.', 'notice-office', 4, true, 60],
            ['Landscape and Garden Maintenance', 'maintenance', 'Landscape teams work collection zones on a rolling four-week schedule. Irrigation along Fairway Villas runs Tuesday and Thursday mornings — please keep villa gates accessible.', 'صيانة الحدائق', 'جدول الصيانة الأسبوعي لمناطق المجمع.', 'notice-gardens', 6, false, 30],
            ['Residential Access and Security', 'general', 'Resident QR passes, visitor pre-registration and contractor escorts are mandatory. Night access after 11:00pm uses the main Yenkit gate only.', 'الوصول والأمن', 'تسجيل الزوار إلزامي. البوابة الرئيسية بعد ١١ مساءً.', 'notice-security', 5, true, 90],
            ['Golf Cart and On-Site Transport', 'general', 'Golf carts operate between the clubhouse, Fairway Villas and the coastal viewpoint. Resident priority; visitors by invitation only.', 'عربات الجولف', 'خدمة النقل داخل المجمع حسب التوفر.', 'notice-cart', 8, false, 40],
            ['Waste Collection and Recycling', 'maintenance', 'Household waste: daily 7:00–9:00am at collection points. Recycling (paper, plastic, glass) Wednesdays.', 'النفايات وإعادة التدوير', 'جمع يومي؛ إعادة التدوير أيام الأربعاء.', 'notice-recycling', 10, false, 25],
            ['Visitor Registration', 'general', 'Register visitors at least two hours before arrival. The host resident is responsible for guest conduct and parking.', 'تسجيل الزوار', 'التسجيل قبل الوصول بساعتين.', 'notice-gate', 7, false, 50],
            ['Residential Parking Guidelines', 'general', 'Two bays per villa unless otherwise titled. Visitor parking in marked bays only — no overnight parking on internal roads.', 'مواقف السكن', 'موقفان لكل فيلا ما لم يُنص على غير ذلك.', 'notice-parking', 9, false, 35],
            ['Community Facility Updates', 'general', 'The clubhouse meeting rooms and the spa wing stay open while joinery is finished through the first quarter of 2027. Book as usual. Housekeeping will post any morning when a room is closed.', 'تحديثات المرافق', 'قاعات النادي وجناح السبا مفتوحة أثناء أعمال التشطيب. احجزوا كالمعتاد.', 'notice-facilities', 3, true, 70],
            ['Seasonal Community Announcements', 'general', 'Coastal wind season: secure outdoor furniture and terrace planters. Wadi routes may close briefly after heavy rain — follow alerts in the app.', 'إعلانات موسمية', 'تثبيت الأثاث الخارجي ومتابعة التنبيهات بعد الأمطار.', 'notice-season', 12, false, 20],
        ];

        foreach ($items as [$title, $cat, $body, $titleAr, $bodyAr, $img, $daysAgo, $pinned, $expireDays]) {
            $payload = [
                'author_id' => $this->adminId,
                'category' => $cat,
                'body' => $body,
                'image_url' => $this->img($img),
                'event_date' => now()->addDays($expireDays)->toDateString(),
                'is_pinned' => $pinned,
                'status' => 'published',
                'review_status' => 'approved',
                'is_global' => false,
                'approved_by' => $this->adminId,
                'approved_at' => now()->subDays($daysAgo),
                'published_at' => now()->subDays($daysAgo),
                'updated_at' => now()->subDays($daysAgo),
                'created_at' => now()->subDays($daysAgo),
            ];
            if (Schema::hasColumn('notices', 'title_ar')) {
                $payload['title_ar'] = $titleAr;
                $payload['body_ar'] = $bodyAr;
            }
            DB::table('notices')->updateOrInsert(['community_id' => $this->cid, 'title' => $title], $payload);
        }
    }

    private function seedAlerts(): void
    {
        $alerts = [
            ['Coastal High Wind Advisory', 'Security expects gusts along the Yiti frontage this evening. Tie down terrace cushions and close umbrellas before maghrib. Golf carts will pause on the exposed cliff path if the flags on the 7th are horizontal.', 'تنبيه رياح ساحلية', 'رياح قوية متوقعة على واجهة يتي. ثبّتوا وسائد الشرفات وأغلقوا المظلات قبل المغرب.'],
            ['Temporary Road Access Restrictions', 'A service convoy uses Yenkit Boulevard between 10:00 and 12:00. Resident cars can still enter through the north gate. Please follow the marshals rather than overtaking on the single lane.', 'قيود مؤقتة على الطريق', 'حركة خدمة على بوليفارد ينكيت من ١٠ إلى ١٢. الدخول من البوابة الشمالية.'],
            ['Scheduled Water Supply Maintenance', 'Sunrise Haven will have lower pressure from 2:00 to 6:00am Thursday while the valve on the rising main is tested. Fill kettles the night before. Fairway Villas and Azure are on a separate line.', 'صيانة المياه', 'ضغط منخفض في صن رايز هيفن من ٢ إلى ٦ فجراً يوم الخميس لفحص المحبس.'],
            ['Community Security Advisory', 'Contractors must show a badge at the Yenkit gate. If someone is on your street without a host or a badge, call the gatehouse rather than confronting them.', 'تنبيه أمني', 'يجب إبراز تصريح المقاول عند البوابة. أبلغوا الحراسة عن أي زائر بدون مضيف.'],
            ['Temporary Facility Closure', 'The outdoor yoga deck is closed Friday morning while the mat store is fitted. The 6:30 class moves to the clubhouse studio. The deck reopens at 2pm.', 'إغلاق مؤقت', 'سطح اليوغا مغلق صباح الجمعة لتركيب خزانة السجاد. الحصة في استوديو النادي.'],
            ['Heavy Rain and Wadi Safety', 'After rain the stones on the wadi-edge trail hold water. Use the marked coastal path until the landscape team reopens the lower route. Do not cross the wadi bed on foot or by cart.', 'الأمطار والوديان', 'بعد المطر التزموا المسار الساحلي المعلّم. لا تعبروا مجرى الوادي.'],
        ];

        foreach ($alerts as $index => [$title, $body, $titleAr, $bodyAr]) {
            $payload = [
                'author_id' => $this->adminId,
                'category' => 'emergency',
                'body' => $body,
                'image_url' => $this->img(['alert-wind', 'alert-road', 'alert-water', 'alert-security', 'alert-closure', 'alert-rain'][$index]),
                'status' => 'published',
                'review_status' => 'approved',
                'is_global' => false,
                'is_pinned' => $index < 2,
                'approved_by' => $this->adminId,
                'approved_at' => now()->subHours(12 + $index),
                'published_at' => now()->subHours(12 + $index),
                'updated_at' => now(),
                'created_at' => now()->subHours(12 + $index),
            ];
            if (Schema::hasColumn('notices', 'title_ar')) {
                $payload['title_ar'] = $titleAr;
                $payload['body_ar'] = $bodyAr;
            }
            DB::table('notices')->updateOrInsert(['community_id' => $this->cid, 'title' => $title], $payload);
        }
    }

    private function seedEvents(): void
    {
        $events = [
            ['AIDA Sunset Community Gathering', 'An evening on the coastal lawn with Omani coffee, dates and live oud. Families welcome.', 14, '17:30', '20:30', 120, 'Outdoor Recreation Area', true, 'event-sunset'],
            ['Morning Yoga Overlooking the Ocean', 'Instructor-led session on the yoga deck. Mats provided; arrive 10 minutes early.', 5, '06:30', '07:30', 24, 'Outdoor Yoga Area', true, 'event-yoga'],
            ['Residents Golf Experience', 'Short-game clinic with the pro shop on the practice green, then coffee on the terrace. Bring your own putter if you have one.', 21, '08:00', '11:00', 16, 'Golf Course', false, 'event-golf'],
            ['Omani Heritage and Cultural Evening', 'Frankincense, a short telling of the Yiti fishing families, and kahwa in the clubhouse. Children are welcome for the first hour.', 35, '18:00', '21:00', 80, 'Community Clubhouse', true, 'event-heritage'],
            ['Family Weekend Brunch', 'Buffet brunch at the clubhouse terrace — RSVP with dietary notes.', 8, '10:00', '13:00', 90, 'Community Clubhouse', false, 'event-brunch'],
            ['Community Wellness Day', 'Morning stretch, a nutrition talk and optional blood-pressure checks with the visiting nurse. Wear something you can move in.', 28, '09:00', '15:00', 100, 'Wellness and Spa Centre', false, 'event-wellness'],
            ['Coastal Photography Walk', 'Guided golden-hour walk along the marked coastal trail.', 10, '16:45', '18:30', 25, 'Walking and Cycling Trails', false, 'event-photo'],
            ['Ramadan Community Iftar', 'Shared iftar tent setup — registration closes 48 hours prior.', 90, '18:15', '20:30', 150, 'Outdoor Recreation Area', true, 'event-iftar'],
            ['Residents Networking Evening', 'Informal mixer for entrepreneurs and professionals living at AIDA.', 18, '19:00', '22:00', 60, 'Private Event Lounge', false, 'event-networking'],
            ['Community Eid Celebration', 'Eid morning family programme with face painting and hospitality corner.', 120, '09:00', '12:30', 200, 'Outdoor Recreation Area', true, 'event-eid'],
        ];

        $titles = [];
        foreach ($events as [$title, $body, $days, $start, $end, $cap, $loc, $pinned, $img]) {
            $titles[] = $title;
            $eventDate = now()->addDays($days);
            $deadline = $eventDate->copy()->subDays(2);
            $payload = [
                'author_id' => $this->adminId,
                'category' => 'event',
                'body' => $body,
                'location' => $loc,
                'image_url' => $this->img($img),
                'event_date' => $eventDate->toDateString(),
                'event_time' => $start,
                'event_time_end' => $end,
                'event_capacity' => $cap,
                'requires_rsvp' => true,
                'is_pinned' => $pinned,
                'status' => 'published',
                'review_status' => 'approved',
                'is_global' => false,
                'approved_by' => $this->adminId,
                'approved_at' => now()->subDays(3),
                'published_at' => now()->subDays(3),
                'updated_at' => now(),
                'created_at' => now()->subDays(3),
            ];
            if (Schema::hasColumn('notices', 'registration_deadline_date')) {
                $payload['registration_deadline_date'] = $deadline->toDateString();
                $payload['registration_deadline_time'] = '18:00:00';
            }
            DB::table('notices')->updateOrInsert(['community_id' => $this->cid, 'title' => $title], $payload);
        }

        $residents = $this->approvedResidentIds();
        $pattern = ['going', 'maybe', 'going'];
        foreach ($titles as $ei => $title) {
            $noticeId = DB::table('notices')->where('community_id', $this->cid)->where('title', $title)->value('id');
            if (! $noticeId) {
                continue;
            }
            foreach ($residents as $ri => $userId) {
                DB::table('event_rsvps')->updateOrInsert(
                    ['notice_id' => $noticeId, 'user_id' => $userId],
                    ['status' => $pattern[($ri + $ei) % 3], 'created_at' => now(), 'updated_at' => now()]
                );
            }
        }
    }

    private function seedFeed(): void
    {
        $zaeem = 'zaeem.chaudhry@gmail.com';
        $faisal = 'faisalaljamil@gmail.com';
        $syed = 'syed@gohavena.com';

        $posts = [
            [$zaeem, 'Fairway Villas, FV-012. First week in and the dawn light on the 7th green is the reason the alarm is set for 5:40. Coffee on the terrace, then a slow nine if the starter has a gap.', 'شروق الفيرواي من فيلا FV-012 يستحق الاستيقاظ باكراً.', 'feed-fairway', 1, $faisal, 'Save me a tee if you go out Thursday. I will bring the extra glove.'],
            [$faisal, 'Sunrise Haven neighbours: the coastal path toward the Yenkit viewpoint is quiet before 7. I counted eleven flamingos in the lagoon this morning. Take water. The return climb is warmer than it looks.', 'مسار ينيكت قبل السابعة هادئ. خذوا ماءً.', 'feed-trails', 2, $syed, 'Did the loop from Azure yesterday. The new shade sail at the halfway bench is already earning its keep.'],
            [$syed, 'Azure Oceanfront, AOV-015. Golden hour from the terrace last night — no filter. The sea was flat enough to hear the fishing boats off Yiti.', 'الغروب من شرفة AOV-015 أمس.', 'feed-ocean', 0, $zaeem, 'That is the shot the welcome guide should have used. Stunning.'],
            [$zaeem, 'Looking for a fourth for the residents golf clinic on the practice green. Handicap anywhere. We are there for the coffee afterwards as much as the putting.', 'أبحث عن شريك لعيادة الغولف.', 'feed-golf', 3, $faisal, 'Count me in. I will book the cart from the clubhouse.'],
            [$faisal, 'Guests this weekend: we took them to Bait Al Luban in Muttrah. Shuwa and the sea view. Book before Thursday or you will be standing.', 'بيت اللبان في مطرح — احجزوا مبكراً.', 'feed-dining', 4, $syed, 'The grilled kingfish is the one. Ask for a table upstairs.'],
            [$faisal, 'Question for the office: is visitor parking on Yenkit Boulevard still capped at four hours over Eid, or do hosts register an overnight bay?', 'هل مواقف الزوار في العيد لأربع ساعات فقط؟', 'feed-parking', 2, $zaeem, 'I registered two cars through the app last Eid and security waved them through. Do it the day before.'],
            [$zaeem, 'The soft-play at Sunrise Haven on Friday morning was a success. Three families, no lost shoes, and the shade sail actually covers the slide now.', 'منطقة الألعاب صباح الجمعة كانت ممتازة.', 'feed-play', 5, $faisal, 'We will be there this Friday. The little one has been asking since we left.'],
            [$syed, 'The heritage evening in the clubhouse — frankincense, a short story about the Yiti fishing families, and kahwa that was not from a sachet. More of this, please.', 'أمسية التراث في النادي كانت جميلة.', 'feed-heritage', 8, $faisal, 'My mother still talks about the dallah. Whoever sourced the beans, thank you.'],
            [$faisal, 'Yoga deck at 6:30. There is a breeze off the Gulf you do not get in Qurum. Mats are in the chest by the steps. Bring your own water.', 'يوغا السادسة والنصف على سطح البحر.', 'feed-yoga', 3, $syed, 'Joined Tuesday. The instructor finished on time, which I respect.'],
            [$zaeem, 'Sunset gathering on the lawn. Met neighbours from Trump Golf Villas I had only waved at on the cart path. Omani coffee, dates, and nobody checking their phone. Rare.', 'تجمع الغروب على العشب.', 'feed-gathering', 6, $syed, 'We stayed for the oud. The kids fell asleep on the cushions, which is a review.'],
            [$syed, 'Coastal wind note: the cushions on our daybed left the terrace and visited the neighbour’s ghaf tree. Tie them down when the advisory posts. I have learned.', 'اربطوا وسائد الشرفة عند تنبيه الرياح.', 'feed-wind', 2, $zaeem, 'Same story on the fairway side. The office has spare clips at the welcome desk.'],
            [$faisal, 'Wellness day is on the calendar. I am going for the stretch class, not the juice. If anyone from Sunrise Haven wants to walk over together, message me.', 'يوم العافية — أمشي مع الجيران إن رغبتم.', 'feed-wellness', 1, $zaeem, 'I will meet you at the clubhouse steps at 8:50.'],
            [$zaeem, 'Marriott Residences friends: the clubhouse terrace brunch on Saturday still has seats. The shuwa station is the one worth queuing for.', 'فطور السبت في تراس النادي.', 'feed-brunch', 4, $faisal, 'Booked a table for four. Happy to share if anyone is coming alone.'],
            [$syed, 'Photography walk along the marked coastal trail. We stopped above the wadi mouth — stay on the path after rain, the stones are slick.', 'جولة التصوير على المسار الساحلي.', 'feed-photo', 7, $faisal, 'I have a spare lens if someone wants to try a longer reach on the boats.'],
            [$faisal, 'A quiet recommendation: the small grocery in Yenkit village still bakes khubz at 4pm. Better than the big store in Qurum if you only need bread and laban.', 'خبز ينيكت الساعة الرابعة أفضل من السوبرماركت.', 'feed-bakery', 9, $zaeem, 'Confirmed. Cash and card both work. They close for maghrib, so go before.'],
            [$syed, 'Pool steps had a green patch yesterday and the team was already on it this morning. Posting so nobody assumes it was ignored.', 'درجات المسبح نُظفت هذا الصباح.', 'feed-pool', 1, $faisal, 'Saw them at 7:15. Water looks clear again.'],
        ];

        $residents = $this->approvedResidentIds();

        foreach ($posts as [$email, $body, $bodyAr, $img, $daysAgo, $commentEmail, $comment]) {
            $userId = $this->uid($email) ?? $this->adminId;
            $at = now()->subDays($daysAgo)->subHours(3);
            $payload = [
                'category' => 'general',
                'image_url' => $this->img($img),
                'status' => 'approved',
                'approved_at' => $at,
                'likes_count' => count($residents),
                'comments_count' => 1,
                'updated_at' => $at,
                'created_at' => $at,
            ];
            if (Schema::hasColumn('posts', 'body_ar')) {
                $payload['body_ar'] = $bodyAr;
            }
            DB::table('posts')->updateOrInsert(
                ['community_id' => $this->cid, 'user_id' => $userId, 'body' => $body],
                $payload,
            );
            $postId = (int) DB::table('posts')
                ->where('community_id', $this->cid)
                ->where('user_id', $userId)
                ->where('body', $body)
                ->value('id');
            if ($postId === 0) {
                continue;
            }

            $commenter = $this->uid($commentEmail);
            if ($commenter && $commenter !== $userId) {
                DB::table('post_comments')->updateOrInsert(
                    ['post_id' => $postId, 'user_id' => $commenter, 'body' => $comment],
                    ['created_at' => $at->copy()->addHours(2), 'updated_at' => $at->copy()->addHours(2)],
                );
            }
            foreach ($residents as $liker) {
                DB::table('post_likes')->updateOrInsert(
                    ['post_id' => $postId, 'user_id' => $liker],
                    ['created_at' => $at],
                );
            }
        }

        $this->seeder->log('  Feed posts: '.count($posts));
    }

    private function seedBusinessesAndDeals(): void
    {
        $businesses = [
            ['The Restaurant — Al Bustan Palace', 'Fine dining', 'Seaside dining at Al Bustan when you want Muscat rather than the clubhouse. Reserve upstairs for the water.', 'Al Bustan, Muscat', '+96824799666', 'biz-bustan'],
            ['Kargeen Caffe', 'Restaurants and cafés', 'Garden café in Madinat Qaboos. Families go for the Omani breakfast on Fridays.', 'Madinat Qaboos', '+96824694808', 'biz-kargeen'],
            ['Angsana Spa', 'Wellness and spas', 'Hammam and couples treatments at Al Mouj. Book the evening slot if you want it quiet.', 'Al Mouj Muscat', '+96824522400', 'biz-spa'],
            ['Sultan Center — Qurum', 'Grocery stores', 'The hypermarket for the weekly shop when Yenkit village does not carry it.', 'Qurum', '+96824560000', 'biz-grocery'],
            ['Fix It Home Maintenance', 'Home maintenance', 'Electricians and plumbers who already work the Yiti road. They check in at the gate.', 'Muscat', '+96891456780', 'biz-maintenance'],
            ['Quick Laundry Muscat', 'Laundry services', 'Pickup from the villa gate and back the next day. Leave the bag with security if you are out.', 'Ghala', '+96822001122', 'biz-laundry'],
            ['Marhaba Taxi Services', 'Transportation', 'Airport runs and city cars. Give the villa number when you book so the driver clears the gate.', 'Muscat', '+96899334455', 'biz-taxi'],
            ['Muscat Hills Golf', 'Golf and recreation', 'A second course in Al Amerat when the AIDA starter is full. Twilight rates after 3pm.', 'Al Amerat', '+96822447788', 'biz-golf'],
            ['Green Thumb Landscaping', 'Landscaping services', 'Native planting and irrigation checks for villa gardens, alongside the community landscape round.', 'Seeb', '+96895123777', 'biz-landscape'],
        ];

        foreach ($businesses as [$name, $cat, $desc, $addr, $phone, $img]) {
            DB::table('businesses')->updateOrInsert(
                ['community_id' => $this->cid, 'name' => $name],
                [
                    'owner_id' => $this->adminId,
                    'category' => $cat,
                    'description' => $desc,
                    'address' => $addr,
                    'phone' => $phone,
                    'hours' => 'See listing',
                    'image_url' => $this->img($img),
                    'status' => 'approved',
                    'approved_at' => now(),
                    'approved_by' => $this->adminId,
                    'created_at' => now()->subMonths(2),
                    'updated_at' => now(),
                ]
            );
        }

        $deals = [
            ['Friday brunch for two', 'The Restaurant — Al Bustan Palace', 'Resident rate at Al Bustan, Friday seatings at 12:30 and 2:00. Mention AIDA when you book.', '24.000', '18.000', 'deal-brunch', 40, 'فطور الجمعة لشخصين', 'سعر السكان في البستان. اذكروا عيدة عند الحجز.'],
            ['60-minute massage', 'Angsana Spa', 'Midweek massage at Angsana, Al Mouj. Sundays to Wednesdays. Book by phone and show your resident pass.', '35.000', '25.000', 'deal-spa', 45, 'مساج لمدة ساعة', 'مساج منتصف الأسبوع في أنغسانا. أبرزوا بطاقة السكن.'],
            ['Free grocery delivery over 20 OMR', 'Sultan Center — Qurum', 'Sultan Center delivers to Yiti and Yenkit at no charge when the basket is above 20 OMR. Order before 2pm for the same evening.', '6.000', '0.000', 'deal-grocery', 21, 'توصيل مجاني فوق ٢٠ ريالاً', 'توصيل مجاني إلى يتي وينكيت للطلبات فوق ٢٠ ريالاً عمانياً.'],
            ['Twilight green fee', 'Muscat Hills Golf', 'After 3pm at Muscat Hills. Cart is extra. The AIDA starter can book it if our own sheet is full.', '22.000', '12.000', 'deal-golf', 30, 'رسوم الغولف بعد العصر', 'بعد الثالثة في مسقط هيلز. العربة تحسب بشكل منفصل.'],
            ['Five pressed shirts', 'Quick Laundry Muscat', 'Villa-gate pickup. Five shirts pressed and back the next day. Leave the bag with the gate if you are on the course.', '4.500', '3.000', 'deal-laundry', 28, 'كيّ خمسة قمصان', 'استلام من بوابة الفيلا وإعادة في اليوم التالي.'],
            ['Kargeen breakfast for two', 'Kargeen Caffe', 'Friday Omani breakfast in the garden at Kargeen. Honey, cheese, khubz and karak. Arrive before 10 if you want the shaded tables.', '11.000', '8.500', 'deal-cafe', 20, 'فطور كرجين لشخصين', 'فطور عُماني في حديقة كرجين يوم الجمعة.'],
            ['Villa garden visit', 'Green Thumb Landscaping', 'A first look at irrigation and planting for one villa garden. They coordinate with the community landscape round so the two teams do not double-water.', '18.000', '12.000', 'deal-landscape', 35, 'زيارة حديقة الفيلا', 'فحص الري والزراعة لتنسيقها مع فريق المجمع.'],
            ['Airport transfer', 'Marhaba Taxi Services', 'One way between Muscat airport and AIDA. The driver has the gate list. Night arrivals after 11pm use the main Yenkit gate.', '12.000', '8.000', 'deal-transfer', 50, 'توصيل المطار', 'مشوار واحد بين المطار وعيدة. الوصول بعد ١١ من البوابة الرئيسية.'],
        ];

        foreach ($deals as [$title, $business, $desc, $was, $nowPrice, $image, $days, $titleAr, $descAr]) {
            $bizId = Schema::hasColumn('deals', 'business_id')
                ? DB::table('businesses')->where('community_id', $this->cid)->where('name', $business)->value('id')
                : null;

            $payload = [
                'created_by' => $this->adminId,
                'vendor' => $business,
                'description' => $desc,
                'type' => 'offer',
                'discount_label' => 'Resident rate',
                'original_price' => $was,
                'discounted_price' => $nowPrice,
                'category' => 'Muscat',
                'location' => 'Muscat',
                'image_url' => $this->img($image),
                'is_featured' => false,
                'status' => 'active',
                'starts_at' => now()->subDay(),
                'ends_at' => now()->addDays($days),
                'updated_at' => now(),
                'created_at' => now()->subDays(5),
            ];
            if ($bizId) {
                $payload['business_id'] = $bizId;
            }
            if (Schema::hasColumn('deals', 'title_ar')) {
                $payload['title_ar'] = $titleAr;
                $payload['description_ar'] = $descAr;
                if (Schema::hasColumn('deals', 'discount_label_ar')) {
                    $payload['discount_label_ar'] = 'سعر السكان';
                }
            }
            DB::table('deals')->updateOrInsert(
                ['community_id' => $this->cid, 'title' => $title],
                $payload,
            );
        }
    }

    private function seedListings(): void
    {
        if (! Schema::hasTable('listings')) {
            return;
        }

        $rows = [
            ['zaeem.chaudhry@gmail.com', 'for_sale', 'Sports', 'used', 'TaylorMade irons, barely out', 180, 'FV-012. A set I brought from Dubai and then joined the AIDA fitting. Grips are this year. Happy for a neighbour to try them on the range before paying.', 'mkt-clubs', 2],
            ['faisalaljamil@gmail.com', 'for_sale', 'Kids', 'used', 'Kids bicycle, Sunrise Haven', 35, 'SH-008. 20-inch bike, used one season. Helmet included. Collection from the villa, not the play area.', 'mkt-bike', 4],
            ['syed@gohavena.com', 'for_sale', 'Home', 'used', 'Teak daybed from the terrace', 220, 'AOV-015. Outdoor teak lounge, cushions replaced last winter. Too large for the new shade plan. Two people and a pickup.', 'mkt-sofa', 6],
            ['faisalaljamil@gmail.com', 'for_sale', 'Home', 'used', 'Silver dallah and six finjans', 28, 'A proper dallah, not a decorative one. We were gifted a second set at Eid. Polished, no dents.', 'mkt-dallah', 3],
            ['zaeem.chaudhry@gmail.com', 'for_sale', 'Sports', 'used', 'Inflatable paddleboard', 75, 'Used on the calm mornings off Yiti. Pump and leash included. Patch kit unused.', 'mkt-paddle', 8],
            ['syed@gohavena.com', 'for_sale', 'Food', 'new', 'Omani halwa gift boxes', 6, 'Two sealed boxes from a Muttrah kitchen, bought for guests who cancelled. Best this week.', 'mkt-halwa', 1],
            ['zaeem.chaudhry@gmail.com', 'for_sale', 'Sports', 'used', 'Electric golf trolley', 95, 'Battery holds nine holes and most of the walk back. Charger included. I switched to a cart membership.', 'mkt-buggy', 9],
            ['faisalaljamil@gmail.com', 'for_sale', 'Home', 'used', 'Indoor plants, five pots', 18, 'Olive, a ficus and three smaller pots that outgrew the Sunrise Haven lobby. Pots stay with the plants.', 'mkt-plants', 5],
            ['syed@gohavena.com', 'for_sale', 'Home', 'used', 'Hand-knotted sitting rug', 140, 'About 2.4 by 1.7 metres. Sun has faded one edge, which I will show you in daylight on the terrace.', 'mkt-rug', 11],
            ['faisalaljamil@gmail.com', 'service', 'Services', null, 'Villa reset before guests arrive', 25, 'A half-day clean for a three-bed villa: kitchen, baths, terrace glass. I use the same team as our own house. Rate is per visit.', 'mkt-clean', 2],
            ['zaeem.chaudhry@gmail.com', 'service', 'Lessons', null, 'Junior golf, Sunday mornings', 12, 'Forty minutes on the practice green for children 7–12. I am not a pro. Four places. Fee is per child per month.', 'mkt-tutor', 7],
            ['syed@gohavena.com', 'for_sale', 'Home', 'new', 'Frankincense and a small burner', 9, 'Hojari resin from Dhofar and a brass burner. Bought extra after the heritage evening.', 'mkt-incense', 3],
        ];

        foreach ($rows as [$email, $type, $category, $condition, $title, $price, $description, $image, $daysAgo]) {
            $userId = $this->uid($email);
            if (! $userId) {
                continue;
            }
            $payload = [
                'type' => $type,
                'price' => $price,
                'description' => $description.' Prices in Omani rial. Collection inside AIDA.',
                'images' => json_encode([$this->img($image)]),
                'status' => 'approved',
                'is_verified' => true,
                'approved_at' => now()->subDays($daysAgo),
                'approved_by' => $this->adminId,
                'updated_at' => now()->subDays($daysAgo),
                'created_at' => now()->subDays($daysAgo),
            ];
            if (Schema::hasColumn('listings', 'category')) {
                $payload['category'] = $category;
            }
            if (Schema::hasColumn('listings', 'location')) {
                $payload['location'] = 'AIDA Muscat';
            }
            if (Schema::hasColumn('listings', 'condition')) {
                $payload['condition'] = $condition;
            }
            DB::table('listings')->updateOrInsert(
                ['community_id' => $this->cid, 'user_id' => $userId, 'title' => $title],
                $payload,
            );
        }

        $this->seeder->log('  Marketplace listings: '.count($rows));
    }

    private function seedRules(): void
    {
        $rules = [
            ['Quiet hours 10pm–7am along villa streets', 'Access', 'No outdoor parties or generator use in shared lanes during quiet hours.'],
            ['Visitor escort policy', 'Security', 'Hosts must meet guests at the gate and remain responsible for their conduct.'],
            ['Pool and spa dress code', 'Facilities', 'Modest swimwear; children under 12 with an adult at all times.'],
        ];
        foreach ($rules as [$title, $cat, $body]) {
            DB::table('community_rules')->updateOrInsert(
                ['community_id' => $this->cid, 'title' => $title],
                [
                    'created_by' => $this->adminId,
                    'category' => $cat,
                    'description' => $body,
                    'severity' => 'important',
                    'requires_acknowledgment' => true,
                    'status' => 'active',
                    'created_at' => now()->subMonths(6),
                    'updated_at' => now(),
                ]
            );
        }
    }

    private function seedDocuments(): void
    {
        if (! Schema::hasTable('community_documents')) {
            return;
        }

        $dir = storage_path('app/public/documents/'.$this->cid);
        if (! is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        $docs = [
            ['AIDA Resident Welcome Guide', 'Welcome', 'Orientation for new owners and tenants.', true],
            ['Community Rules and Regulations', 'Policies', 'Binding community policies.', true],
            ['Visitor Access Policy', 'Policies', 'Gate and visitor procedures.', true],
            ['Parking and Vehicle Registration', 'Policies', 'Bay allocation and stickers.', true],
            ['Shared Facilities Usage Agreement', 'Agreements', 'Amenity use terms.', true],
            ['Maintenance Access Agreement', 'Agreements', 'Entry for scheduled works.', true],
            ['Community Code of Conduct', 'Policies', 'Respectful conduct standards.', true],
            ['Property Modification Guidelines', 'Policies', 'Alterations approval process.', true],
            ['Emergency Contact Information', 'Safety', 'Key numbers and muster points.', false],
        ];

        foreach ($docs as [$title, $cat, $desc, $signature]) {
            $slug = Str::slug($title).'.pdf';
            $absolute = $dir.'/'.$slug;
            if (! is_file($absolute)) {
                file_put_contents($absolute, $this->placeholderPdf($title));
            }
            $payload = [
                'created_by' => $this->adminId,
                'category' => $cat,
                'description' => $desc,
                'file_path' => "/storage/documents/{$this->cid}/{$slug}",
                'file_name' => $slug,
                'file_size' => filesize($absolute),
                'mime_type' => 'application/pdf',
                'status' => 'active',
                'download_count' => 12,
                'updated_at' => now(),
                'created_at' => now()->subMonths(4),
            ];
            if (Schema::hasColumn('community_documents', 'kind')) {
                $payload['kind'] = $signature ? 'agreement' : 'document';
                $payload['signature_required'] = $signature;
                $payload['publication_status'] = 'published';
                $payload['due_at'] = $signature ? now()->addMonths(2) : null;
            }
            DB::table('community_documents')->updateOrInsert(
                ['community_id' => $this->cid, 'title' => $title],
                $payload,
            );
        }
    }

    private function seedDocumentAssignments(): void
    {
        if (! Schema::hasTable('community_document_assignments')) {
            return;
        }

        $residents = $this->approvedResidentIds();
        $agreements = DB::table('community_documents')
            ->where('community_id', $this->cid)
            ->where('signature_required', true)
            ->pluck('id');

        $statusCycle = ['signed', 'pending', 'overdue'];
        $i = 0;
        foreach ($agreements as $docId) {
            foreach ($residents as $userId) {
                $status = $statusCycle[$i % 3];
                $signedAt = $status === 'signed' ? now()->subDays(10 + $i) : null;
                $assignment = [
                    'community_id' => $this->cid,
                    'document_version' => 1,
                    'status' => $status === 'overdue' ? 'pending' : $status,
                    'signed_at' => $signedAt,
                    'updated_at' => now(),
                    'created_at' => now()->subMonth(),
                ];
                DB::table('community_document_assignments')->updateOrInsert(
                    ['document_id' => $docId, 'user_id' => $userId, 'scope_key' => 'resident'],
                    $assignment,
                );
                $i++;
            }
        }
    }

    /** @return array<string, int> department => staff id */
    private function seedStaff(): array
    {
        if (! Schema::hasTable('community_staff')) {
            return [];
        }

        $staffRows = [
            ['security', 'Rashid Al Hinai', 'aida.staff.security@havena.app', '+96892111001', ['gate_access', 'patrol']],
            ['maintenance', 'Vikram Nair', 'aida.staff.maintenance@havena.app', '+96892111002', ['hvac', 'electrical']],
            ['housekeeping', 'Maria Santos', 'aida.staff.housekeeping@havena.app', '+96892111003', ['common_areas']],
            ['landscaping', 'Ahmed Al Balushi', 'aida.staff.landscape@havena.app', '+96892111004', ['irrigation', 'plants']],
            ['management', 'Layla Al Rashdi', 'aida.staff.management@havena.app', '+96892111005', ['resident_services']],
        ];

        $map = [];
        foreach ($staffRows as [$type, $name, $email, $phone, $specs]) {
            $user = DB::table('users')->where('email', $email)->first();
            if (! $user) {
                $userId = DB::table('users')->insertGetId([
                    'uuid' => (string) Str::ulid(),
                    'email' => $email,
                    'name' => $name,
                    'phone' => $phone,
                    'password' => bcrypt('password'),
                    'role' => 'resident',
                    'status' => 'active',
                    'email_verified_at' => now(),
                    'created_at' => now()->subMonths(3),
                    'updated_at' => now(),
                ]);
                DB::table('profiles')->insert([
                    'user_id' => $userId,
                    'display_name' => $name,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } else {
                $userId = (int) $user->id;
            }

            $staffId = DB::table('community_staff')->updateOrInsert(
                ['community_id' => $this->cid, 'email' => $email],
                [
                    'user_id' => $userId,
                    'name' => $name,
                    'phone' => $phone,
                    'staff_type' => $type,
                    'status' => 'active',
                    'availability' => 'available',
                    'specializations' => json_encode($specs),
                    'activated_at' => now()->subMonths(2),
                    'invited_by' => $this->adminId,
                    'updated_at' => now(),
                    'created_at' => now()->subMonths(3),
                ]
            );

            $id = DB::table('community_staff')->where('community_id', $this->cid)->where('email', $email)->value('id');
            $map[$type] = (int) $id;
        }

        return $map;
    }

    /** @param array<string, int> $staff */
    private function seedComplaints(array $staff): void
    {
        if (! Schema::hasTable('complaints')) {
            return;
        }

        $reporters = [
            ['zaeem.chaudhry@gmail.com', 'FV-012', 'Air Conditioning Maintenance', 'The master bedroom unit at FV-012 runs but the room stays at 27°C after sunset. Filter was cleaned last week. Please check the gas before Friday, we have guests.', 'in_progress', 'maintenance', 'high', 'Technician is on the fairway side this afternoon. He will call from the gate.'],
            ['faisalaljamil@gmail.com', 'SH-008', 'Landscaping Maintenance', 'The Tuesday irrigation at SH-008 is overshooting the lawn and soaking the terrace tiles. Can the head be turned ten degrees toward the ghaf?', 'assigned', 'landscaping', 'normal', 'Landscape team has it on Thursday’s Sunrise Haven round.'],
            ['syed@gohavena.com', 'AOV-015', 'Street Lighting Issue', 'The bollard on the path between AOV-015 and the coastal steps flickers after 8pm. It is the only dark stretch on the way back from the pool.', 'submitted', 'maintenance', 'normal', null],
            ['zaeem.chaudhry@gmail.com', 'FV-012', 'Parking Access Issue', 'Visitor QR for bay V-12 took three scans last night. The boom eventually opened. Logging it so the gate team can see the pattern.', 'resolved', 'security', 'low', 'Reader was reseated this morning. Please try the next guest and tell us if it hesitates.'],
            ['faisalaljamil@gmail.com', 'SH-008', 'Swimming Pool Maintenance', 'A green line on the second step of the infinity pool, sea side. Not the whole pool. Noticed it at 6:40am.', 'in_progress', 'maintenance', 'normal', 'Brush and balance are on today’s opening checklist. The step should be clear before the 9am swim.'],
            ['syed@gohavena.com', 'AOV-015', 'Community Cleaning Request', 'Clubhouse family restroom ran out of soap during the sunset gathering. The room itself was fine. Just the dispenser.', 'closed', 'housekeeping', 'low', 'Refilled the same evening and added a spare under the basin.'],
        ];

        foreach ($reporters as $index => [$email, $unit, $title, $desc, $status, $dept, $priority, $note]) {
            $userId = $this->uid($email);
            if (! $userId) {
                continue;
            }
            $unitId = DB::table('units')->where('community_id', $this->cid)->where('unit_number', $unit)->value('id');
            $staffId = $staff[$dept] ?? $staff['management'] ?? null;

            $refKey = 'AIDA-CMP-'.$index;
            $existing = DB::table('complaints')->where('community_id', $this->cid)->where('title', $title)->where('reporter_user_id', $userId)->value('id');

            $payload = [
                'type' => 'maintenance',
                'routed_to' => 'community_admin',
                'community_id' => $this->cid,
                'unit_id' => $unitId,
                'unit_number_snapshot' => $unit,
                'reporter_user_id' => $userId,
                'reporter_name_snapshot' => DB::table('users')->where('id', $userId)->value('name'),
                'category' => $dept,
                'priority' => $priority,
                'title' => $title,
                'description' => $desc,
                'status' => $status,
                'assigned_staff_id' => $staffId,
                'resolved_at' => in_array($status, ['resolved', 'closed'], true) ? now()->subDays(2) : null,
                'updated_at' => now()->subDays($index),
                'created_at' => now()->subDays($index + 3),
            ];

            if ($existing) {
                $id = (int) $existing;
                DB::table('complaints')->where('id', $id)->update($payload);
            } else {
                $id = (int) DB::table('complaints')->insertGetId($payload + ['reference' => 'PENDING']);
                DB::table('complaints')->where('id', $id)->update(['reference' => 'CMP-'.str_pad((string) $id, 6, '0', STR_PAD_LEFT)]);
            }

            if ($note && Schema::hasTable('complaint_messages')) {
                DB::table('complaint_messages')->updateOrInsert(
                    ['complaint_id' => $id, 'sender_id' => $this->adminId, 'body' => $note],
                    ['visibility' => 'public', 'created_at' => now()->subDays($index), 'updated_at' => now()->subDays($index)],
                );
            }
        }
    }

    private function seedNotifications(): void
    {
        if (! Schema::hasTable('app_notifications')) {
            return;
        }

        foreach ($this->approvedResidentIds() as $userId) {
            DB::table('app_notifications')->updateOrInsert(
                [
                    'user_id' => $userId,
                    'type' => 'community.welcome',
                    'title' => 'Welcome to AIDA',
                ],
                [
                    'body' => 'Your AIDA Muscat community is ready.',
                    'data' => json_encode(['community_id' => $this->cid]),
                    'read_at' => null,
                    'created_at' => now()->subDay(),
                    'updated_at' => now()->subDay(),
                ]
            );
        }
    }

    private function placeholderPdf(string $title): string
    {
        $content = "BT /F1 14 Tf 72 720 Td ({$title}) Tj ET";

        return "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            ."2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            ."3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n"
            .'4 0 obj<</Length '.strlen($content).">>stream\n{$content}\nendstream endobj\n"
            ."trailer<</Root 1 0 R>>\n%%EOF";
    }
}