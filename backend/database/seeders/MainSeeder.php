<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class MainSeeder extends Seeder
{
    public function run(): void
    {
        if (DB::table('users')->where('email', 'admin@havena.app')->exists()) {
            $this->command?->warn('MainSeeder skipped: login accounts already exist.');

            return;
        }

        $now = now();

        /* ── Community ── */
        $communityId = DB::table('communities')->insertGetId([
            'name'       => 'Sunflower Heights Estate',
            'region'     => 'New York, NY',
            'description'=> 'A premium residential community in the heart of the city.',
            'timezone'   => 'America/New_York',
            'status'     => 'active',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        /* ── Users ── */
        $adminId = DB::table('users')->insertGetId([
            'name'       => 'Admin User',
            'email'      => 'admin@havena.app',
            'password'   => Hash::make('password'),
            'status'     => 'active',
            'role'       => 'system_admin',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $residents = [
            ['Sarah Mitchell',  'sarah@havena.app',   'Apt 4B', 'Two-bedroom'],
            ['David Chen',      'david@havena.app',   'Apt 6D', 'Studio'],
            ['Lisa Wang',       'lisa@havena.app',    'Apt 2A', 'One-bedroom'],
            ['James Okafor',    'james@havena.app',   'Apt 7A', 'Two-bedroom'],
            ['Emily Rodriguez', 'emily@havena.app',   'Apt 1C', 'One-bedroom'],
            ['Michael Torres',  'michael@havena.app', 'Apt 5F', 'Three-bedroom'],
        ];

        $residentIds = [];
        foreach ($residents as [$name, $email, $unit, $type]) {
            $uid = DB::table('users')->insertGetId([
                'name'       => $name,
                'email'      => $email,
                'password'   => Hash::make('password'),
                'status'     => 'active',
                'role'       => $name === 'Michael Torres' ? 'moderator' : 'resident',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $residentIds[] = $uid;

            DB::table('profiles')->insert([
                'user_id'        => $uid,
                'display_name'   => $name,
                'unit_number'    => $unit,
                'residence_type' => $type,
                'bio'            => "Resident at Sunflower Heights Estate.",
                'created_at'     => $now,
                'updated_at'     => $now,
            ]);

            DB::table('community_memberships')->insert([
                'user_id'      => $uid,
                'community_id' => $communityId,
                'role'         => $name === 'Michael Torres' ? 'moderator' : 'member',
                'status'       => $name === 'James Okafor' ? 'pending' : 'approved',
                'created_at'   => $now,
                'updated_at'   => $now,
            ]);
        }

        /* Admin profile + membership */
        DB::table('profiles')->insert(['user_id' => $adminId, 'display_name' => 'Admin User', 'unit_number' => null, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('community_memberships')->insert(['user_id' => $adminId, 'community_id' => $communityId, 'role' => 'admin', 'status' => 'approved', 'created_at' => $now, 'updated_at' => $now]);

        /* ── Notices ── */
        $noticeCategories = ['general', 'event', 'maintenance', 'security'];
        $notices = [
            ['Community BBQ This Saturday', 'event',       'Join us this Saturday at 4 PM in the courtyard for our monthly community BBQ. Bring your family and enjoy good food and great company!', 'published'],
            ['Water Maintenance - June 25', 'maintenance', 'Water will be shut off on June 25th from 9 AM to 1 PM for scheduled pipe maintenance. Please store water in advance.', 'published'],
            ['New Security Cameras Installed', 'security', 'We have installed new HD security cameras in all parking areas and building entrances for enhanced safety.', 'published'],
            ['Parking Permit Renewal', 'general',         'All parking permits expire on July 1st. Please visit the management office to renew. Bring your vehicle registration.', 'published'],
            ['Pool Hours Update', 'general',               'Pool hours have been updated: Mon–Fri 6 AM–10 PM, Sat–Sun 7 AM–11 PM. Children under 12 must be accompanied by an adult.', 'published'],
            ['Fire Drill Scheduled', 'security',           'A mandatory fire drill is scheduled for June 28th at 10 AM. Please cooperate with building staff during the exercise.', 'draft'],
        ];

        foreach ($notices as $i => [$title, $category, $body, $status]) {
            DB::table('notices')->insert([
                'community_id' => $communityId,
                'author_id'    => $adminId,
                'title'        => $title,
                'category'     => $category,
                'body'         => $body,
                'status'       => $status,
                'published_at' => $status === 'published' ? $now->copy()->subDays($i) : null,
                'created_at'   => $now->copy()->subDays($i),
                'updated_at'   => $now->copy()->subDays($i),
            ]);
        }

        /* ── Reports ── */
        $reports = [
            [$residentIds[0], $residentIds[3], 'noise',       'Loud Music After Hours',    'Resident in Apt 7A is playing loud music after 11 PM on multiple nights.', 'open',     'high'],
            [$residentIds[2], null,            'damage',      'Broken Hallway Light',      'The hallway light on floor 3 has been broken for over a week.', 'resolved', 'low'],
            [$residentIds[1], null,            'safety',      'Suspicious Parking Activity','Unknown vehicle parked in visitor spot for 5+ days.', 'in_review','medium'],
            [$residentIds[4], $residentIds[3], 'harassment',  'Verbal Altercation',        'Had a verbal confrontation near the mailboxes on June 20.', 'open',     'high'],
        ];

        foreach ($reports as [$reporterId, $reportedId, $type, $title, $desc, $status, $severity]) {
            DB::table('reports')->insert([
                'community_id'     => $communityId,
                'reporter_id'      => $reporterId,
                'reported_user_id' => $reportedId,
                'type'             => $type,
                'title'            => $title,
                'description'      => $desc,
                'status'           => $status,
                'severity'         => $severity,
                'created_at'       => $now->copy()->subDays(rand(1, 5)),
                'updated_at'       => $now,
            ]);
        }

        /* ── Listings ── */
        $listings = [
            [$residentIds[0], 'for_sale', 'Sony 4K Smart TV - 55"',        299.00, 'Barely used Sony Bravia 4K TV. Comes with original remote and stand. Selling due to upgrade.', 'approved', true],
            [$residentIds[1], 'service',  'Professional Piano Lessons',    50.00,  'Certified piano teacher offering private lessons for all levels. First session free!', 'approved', false],
            [$residentIds[2], 'for_sale', 'IKEA Dining Table Set',         180.00, '6-seater dining table with chairs. White finish, minor scratches on one leg. Must collect.', 'approved', false],
            [$residentIds[4], 'deal',     '20% Off Homemade Baked Goods',  null,   'Fresh bread, cookies, and cakes every weekend. Order by Friday. Community discount!', 'approved', true],
            [$residentIds[1], 'for_sale', 'Baby Crib - Gently Used',       75.00,  'Gently used baby crib. Any style considered. Must collect from Building B.', 'pending', false],
            [$residentIds[3], 'for_sale', 'Mountain Bike - Trek Marlin 5', 450.00, 'Trek Marlin 5, 2022 model, excellent condition. Used only on weekends. Size M.', 'pending', false],
        ];

        foreach ($listings as [$uid, $type, $title, $price, $desc, $status, $verified]) {
            DB::table('listings')->insert([
                'community_id' => $communityId,
                'user_id'      => $uid,
                'type'         => $type,
                'title'        => $title,
                'price'        => $price,
                'description'  => $desc,
                'images'       => json_encode([]),
                'status'       => $status,
                'is_verified'  => $verified,
                'approved_by'  => $status === 'approved' ? $adminId : null,
                'approved_at'  => $status === 'approved' ? $now : null,
                'created_at'   => $now->copy()->subDays(rand(1, 10)),
                'updated_at'   => $now,
            ]);
        }

        /* ── Local Businesses ── */
        if (Schema::hasTable('businesses')) {
            $businesses = [
                ['The Daily Grind', 'Coffee Shop', 'Neighborhood coffee shop with fresh pastries.', '123 Main Street', '(305) 555-0101', '7:00 AM - 6:00 PM', 'WiFi, Outdoor Seating'],
                ['Green Bowl', 'Healthy Food', 'Fresh salads and bowls made daily.', '45 Oak Avenue', '(305) 555-0102', '11:00 AM - 9:00 PM', 'Takeout, Vegan Options'],
                ["Joe's Burger Bar", 'Restaurant', 'Classic burgers and community favorites.', '88 Market Lane', '(305) 555-0103', '12:00 PM - 10:00 PM', 'Dine-in, Takeout'],
                ['Zenith Fitness', 'Gym', 'Full-service gym with classes and personal training.', '200 Fitness Blvd', '(305) 555-0104', '5:00 AM - 11:00 PM', 'Showers, Classes'],
            ];

            foreach ($businesses as [$name, $category, $desc, $address, $phone, $hours, $amenities]) {
                DB::table('businesses')->insert([
                    'community_id' => $communityId,
                    'owner_id'     => $adminId,
                    'name'         => $name,
                    'category'     => $category,
                    'description'  => $desc,
                    'address'      => $address,
                    'phone'        => $phone,
                    'hours'        => $hours,
                    'amenities'    => $amenities,
                    'status'       => 'approved',
                    'approved_at'  => $now,
                    'approved_by'  => $adminId,
                    'created_at'   => $now->copy()->subDays(rand(1, 12)),
                    'updated_at'   => $now,
                ]);
            }
        }

        /* ── Deals & Offers ── */
        if (Schema::hasTable('deals')) {
            $deals = [
                ['20% off all burgers', "Joe's Burger Bar", 'Enjoy 20% off all burger items this week. Dine-in and takeout.', '20% OFF', 'Food & Dining', true],
                ['First week free trial', 'Zenith Fitness', 'New members get their first week completely free. No commitment.', 'FREE TRIAL', 'Health & Fitness', false],
                ['Buy 1 Get 1 Free Coffee', 'The Daily Grind', 'Purchase any coffee and get a second one free, all day.', 'BOGO', 'Coffee', false],
                ['$5 off orders over $25', 'Green Bowl', 'Save $5 on any order $25 or more. Community exclusive.', '$5 OFF', 'Food & Dining', true],
            ];

            foreach ($deals as [$title, $vendor, $desc, $label, $category, $featured]) {
                DB::table('deals')->insert([
                    'community_id'   => $communityId,
                    'created_by'     => $adminId,
                    'title'          => $title,
                    'vendor'         => $vendor,
                    'description'    => $desc,
                    'type'           => 'deal',
                    'discount_label' => $label,
                    'category'       => $category,
                    'is_featured'    => $featured,
                    'status'         => 'active',
                    'ends_at'        => $now->copy()->addDays(rand(7, 30)),
                    'created_at'     => $now->copy()->subDays(rand(1, 8)),
                    'updated_at'     => $now,
                ]);
            }
        }

        /* ── Feed Posts ── */
        $posts = [
            [$residentIds[0], 'general',
                'Had the most amazing time at yesterday\'s pool party! Great to meet everyone. Looking forward to the next community event!',
                '¡La pasé increíble en la fiesta de la piscina de ayer! Qué gusto conocerlos a todos. ¡Espero con ansias el próximo evento comunitario!',
                'قضيت وقتاً رائعاً في حفلة المسبح أمس! سعيد بلقاء الجميع. أتطلع للفعالية المجتمعية القادمة!',
            ],
            [$residentIds[1], 'event',
                'Reminder: Yoga in the Park this Sunday at 7 AM near the east garden. All levels welcome, bring your own mat!',
                'Recordatorio: Yoga en el Parque este domingo a las 7 AM cerca del jardín este. Todos los niveles son bienvenidos, ¡trae tu propio tapete!',
                'تذكير: يوغا في الحديقة يوم الأحد القادم الساعة ٧ صباحاً بالقرب من الحديقة الشرقية. جميع المستويات مرحب بها، أحضر سجادتك الخاصة!',
            ],
            [$residentIds[2], 'help',
                'Hi neighbors! Has anyone seen a black cat near block C? My cat escaped this morning. Please message me if you spot him.',
                '¡Hola vecinos! ¿Alguien ha visto un gato negro cerca del bloque C? Mi gato se escapó esta mañana. Por favor escríbanme si lo ven.',
                'مرحباً يا جيران! هل رأى أحدكم قطاً أسود بالقرب من المبنى C؟ هرب قطي هذا الصباح. أرجو مراسلتي إذا شاهدتموه.',
            ],
            [$residentIds[4], 'announcement',
                'Just wanted to say — the new gym equipment is fantastic! Thank you management for the upgrade. The building is getting better every month!',
                '¡Solo quería decir que los nuevos equipos del gimnasio son fantásticos! Gracias a la administración por la mejora. ¡El edificio mejora cada mes!',
                'أردت فقط أن أقول — معدات الصالة الرياضية الجديدة رائعة! شكراً للإدارة على التحديث. المبنى يتحسن كل شهر!',
            ],
            [$residentIds[0], 'update',
                'FYI the package room is overflowing right now. Please collect your deliveries as soon as possible. Management is asking everyone to clear their packages.',
                'Para su información, la sala de paquetes está desbordada en este momento. Por favor recojan sus entregas lo antes posible. La administración pide a todos retirar sus paquetes.',
                'للعلم، غرفة الطرود ممتلئة حالياً. يرجى استلام شحناتكم في أقرب وقت ممكن. الإدارة تطلب من الجميع تسلّم طرودهم.',
            ],
            [$adminId,        'announcement',
                'Welcome to our newest resident, Emily Rodriguez in Apt 1C! Please give her a warm welcome when you see her around the building.',
                '¡Bienvenida a nuestra nueva residente, Emily Rodriguez en el Apt 1C! Por favor denle una cálida bienvenida cuando la vean en el edificio.',
                'نرحب بالمقيمة الجديدة، إيميلي رودريغيز في الشقة 1C! نتمنى منكم الترحيب بها عند رؤيتها في المبنى.',
            ],
        ];

        foreach ($posts as [$uid, $cat, $body, $bodyEs, $bodyAr]) {
            $postId = DB::table('posts')->insertGetId([
                'community_id'  => $communityId,
                'user_id'       => $uid,
                'body'          => $body,
                'body_es'       => $bodyEs,
                'body_ar'       => $bodyAr,
                'category'      => $cat,
                'status'        => 'approved',
                'approved_at'   => $now,
                'likes_count'   => 0,
                'comments_count'=> 0,
                'created_at'    => $now->copy()->subHours(rand(1, 72)),
                'updated_at'    => $now,
            ]);

            app(FeedEngagementSeeder::class)->seedPostEngagement((object) [
                'id'             => $postId,
                'user_id'        => $uid,
                'community_id'   => $communityId,
                'likes_count'    => rand(2, 8),
                'comments_count' => rand(1, 3),
            ]);
        }

        /* ── Amenities ── */
        // Facilities are created by community admins in-app (no seeded catalog).

        /* ── Wellness Content ── */
        $wellness = [
            ['fitness',        'Morning Stretch Routine',       'Start your day with a 10-minute full-body stretch to improve flexibility and energy.', 10],
            ['fitness',        'HIIT Cardio Blast',             'High-intensity interval training for maximum fat burn in minimal time.', 25],
            ['fitness',        'Core Strength Training',        'Build a strong core with targeted exercises for abs, back, and stability.', 20],
            ['mental_health',  'Guided Meditation for Stress',  'A calming 15-minute guided session to reduce anxiety and clear your mind.', 15],
            ['mental_health',  'Breathing Techniques',          'Learn powerful breathing exercises to manage stress and improve focus.', 10],
            ['mental_health',  'Sleep Hygiene Masterclass',     'Science-backed tips to build healthy sleep habits for better rest.', 20],
            ['nutrition',      'Meal Prep Sunday',              'Plan and prep your meals for the week in under 2 hours. Easy, healthy recipes.', 30],
            ['nutrition',      'Superfoods Guide',              'Discover the top 10 superfoods and how to incorporate them into your daily diet.', 15],
            ['mindfulness',    'Mindful Morning Practice',      'Set a positive intention for your day with this 10-minute mindfulness ritual.', 10],
            ['mindfulness',    'Evening Wind-Down Yoga',        'Gentle yoga poses to relax your body and prepare your mind for restful sleep.', 20],
            ['sleep',          'The 4-7-8 Sleep Method',        'Master this breathing technique to fall asleep in under 5 minutes.', 10],
            ['sleep',          'Create Your Sleep Sanctuary',   'Simple bedroom adjustments that dramatically improve your sleep quality.', 15],
        ];

        foreach ($wellness as $i => [$cat, $title, $desc, $dur]) {
            DB::table('wellness_content')->insert([
                'category'     => $cat,
                'title'        => $title,
                'description'  => $desc,
                'duration_min' => $dur,
                'sort_order'   => $i,
                'created_at'   => $now,
                'updated_at'   => $now,
            ]);
        }

        /* ── Notifications for residents ── */
        foreach ($residentIds as $uid) {
            DB::table('app_notifications')->insert([
                ['user_id' => $uid, 'type' => 'info',    'title' => 'Community BBQ This Saturday',   'body' => 'Join us at 4 PM in the courtyard!',               'read_at' => null, 'created_at' => $now->copy()->subHours(2),  'updated_at' => $now],
                ['user_id' => $uid, 'type' => 'warning', 'title' => 'Water Maintenance - June 25',   'body' => 'Water shutoff 9 AM–1 PM. Please plan ahead.',     'read_at' => null, 'created_at' => $now->copy()->subHours(5),  'updated_at' => $now],
                ['user_id' => $uid, 'type' => 'success', 'title' => 'Welcome to Havena!',      'body' => 'Your account is active. Explore your community.',  'read_at' => $now, 'created_at' => $now->copy()->subDays(3), 'updated_at' => $now],
            ]);
        }

        $this->command->info('MainSeeder: all data seeded successfully.');

        $this->call([
            WellnessHubSeeder::class,
            CommunitySeeder::class,
            RegionSeeder::class,
        ]);
    }
}
