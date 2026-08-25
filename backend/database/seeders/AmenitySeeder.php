<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Demo amenities (+ sample bookings) for the primary active community.
 * Idempotent: inserts missing amenities by name; tops up sample bookings.
 *
 * Run: php artisan db:seed --class=Database\\Seeders\\AmenitySeeder
 */
class AmenitySeeder extends Seeder
{
    public function run(): void
    {
        $community = DB::table('communities')
            ->where('status', 'active')
            ->orderBy('id')
            ->first();

        if (! $community) {
            $this->command?->warn('AmenitySeeder: no active community found.');

            return;
        }

        $communityId = (int) $community->id;

        $creatorId = DB::table('community_memberships as cm')
            ->join('users as u', 'u.id', '=', 'cm.user_id')
            ->where('cm.community_id', $communityId)
            ->where('cm.status', 'approved')
            ->whereIn('cm.role', ['admin'])
            ->orderBy('u.id')
            ->value('u.id');

        if (! $creatorId) {
            $creatorId = DB::table('community_memberships')
                ->where('community_id', $communityId)
                ->where('status', 'approved')
                ->orderBy('user_id')
                ->value('user_id');
        }

        $residentIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->where('role', 'member')
            ->orderBy('user_id')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        $now = now();
        $seedImg = '/storage/seed';

        $rows = [
            [
                'name' => 'Swimming Pool',
                'name_es' => 'Piscina',
                'name_ar' => 'المسبح',
                'description' => 'Heated outdoor pool with loungers and a shallow end for families.',
                'description_es' => 'Piscina exterior climatizada con tumbonas y zona poco profunda para familias.',
                'description_ar' => 'مسبح خارجي مُدفّأ مع كراسي استلقاء ومنطقة ضحلة مخصصة للعائلات.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 30,
                'floor' => 'Ground level',
                'hours' => '6:00 AM – 10:00 PM',
                'start_time' => '06:00:00',
                'end_time' => '22:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 60,
                'icon_key' => 'pool',
                'image_url' => "{$seedImg}/amenity-pool.jpg",
            ],
            [
                'name' => 'Fitness Center',
                'name_es' => 'Centro de Fitness',
                'name_ar' => 'مركز اللياقة البدنية',
                'description' => 'Cardio machines, free weights, and a stretching area.',
                'description_es' => 'Máquinas de cardio, pesas libres y zona de estiramientos.',
                'description_ar' => 'أجهزة كارديو وأوزان حرة ومنطقة تمارين إطالة.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 20,
                'floor' => 'Level 2',
                'hours' => '5:00 AM – 11:00 PM',
                'start_time' => '05:00:00',
                'end_time' => '23:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => null,
                'icon_key' => 'gym',
                'image_url' => "{$seedImg}/amenity-gym.jpg",
            ],
            [
                'name' => 'Community Hall',
                'name_es' => 'Salón Comunitario',
                'name_ar' => 'القاعة المجتمعية',
                'description' => 'Indoor space for meetings, parties, and resident events.',
                'description_es' => 'Espacio interior para reuniones, fiestas y eventos de los residentes.',
                'description_ar' => 'مساحة داخلية للاجتماعات والحفلات وفعاليات السكان.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 80,
                'floor' => 'Ground floor',
                'hours' => '8:00 AM – 9:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '21:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 120,
                'icon_key' => 'hall',
                'image_url' => "{$seedImg}/amenity-clubhouse.jpg",
            ],
            [
                'name' => 'Tennis Court',
                'name_es' => 'Cancha de Tenis',
                'name_ar' => 'ملعب التنس',
                'description' => 'Lighted hard court available for singles and doubles play.',
                'description_es' => 'Cancha de superficie dura iluminada para partidos individuales y dobles.',
                'description_ar' => 'ملعب صلب مُضاء متاح للعب الفردي والزوجي.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 4,
                'floor' => 'Outdoor area',
                'hours' => '7:00 AM – 8:00 PM',
                'start_time' => '07:00:00',
                'end_time' => '20:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 60,
                'icon_key' => 'sports',
                'image_url' => "{$seedImg}/wellness-exercise.jpg",
            ],
            [
                'name' => 'BBQ Terrace',
                'name_es' => 'Terraza de Parrillada',
                'name_ar' => 'شرفة الشواء',
                'description' => 'Rooftop grilling stations with seating for small gatherings.',
                'description_es' => 'Estaciones de parrilla en la azotea con asientos para reuniones pequeñas.',
                'description_ar' => 'محطات شواء على السطح مع مقاعد للتجمعات الصغيرة.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 15,
                'floor' => 'Rooftop',
                'hours' => '10:00 AM – 9:00 PM',
                'start_time' => '10:00:00',
                'end_time' => '21:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 90,
                'icon_key' => 'dining',
                'image_url' => "{$seedImg}/event-bbq.jpg",
            ],
            [
                'name' => 'Kids Playground',
                'name_es' => 'Área de Juegos Infantiles',
                'name_ar' => 'ملعب الأطفال',
                'description' => 'Shaded play area with swings, slides, and soft flooring.',
                'description_es' => 'Zona de juegos con sombra, columpios, toboganes y piso acolchado.',
                'description_ar' => 'منطقة لعب مظللة مع أراجيح وزحاليق وأرضية ناعمة.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 25,
                'floor' => 'Garden level',
                'hours' => '8:00 AM – 7:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '19:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => null,
                'icon_key' => 'playground',
                'image_url' => "{$seedImg}/wellness-social.jpg",
            ],
            [
                'name' => 'Meeting Room',
                'name_es' => 'Sala de Reuniones',
                'name_ar' => 'غرفة الاجتماعات',
                'description' => 'Quiet room with Wi‑Fi, whiteboard, and seating for 12.',
                'description_es' => 'Sala tranquila con Wi‑Fi, pizarra y capacidad para 12 personas.',
                'description_ar' => 'غرفة هادئة مع واي فاي ولوحة بيضاء وتتسع لـ 12 شخصاً.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 12,
                'floor' => 'Level 1',
                'hours' => '9:00 AM – 6:00 PM',
                'start_time' => '09:00:00',
                'end_time' => '18:00:00',
                'weekends_available' => false,
                'slot_duration_minutes' => 60,
                'icon_key' => 'meeting',
                'image_url' => "{$seedImg}/event-townhall.jpg",
            ],
            [
                'name' => 'Residents Lounge',
                'name_es' => 'Salón de Residentes',
                'name_ar' => 'صالة السكان',
                'description' => 'Comfortable lounge with reading nook and coffee station.',
                'description_es' => 'Salón acogedor con rincón de lectura y estación de café.',
                'description_ar' => 'صالة مريحة مع ركن قراءة ومحطة قهوة.',
                'status' => 'closed',
                'review_status' => 'approved',
                'capacity' => 18,
                'floor' => 'Lobby',
                'hours' => '9:00 AM – 5:00 PM',
                'start_time' => '09:00:00',
                'end_time' => '17:00:00',
                'weekends_available' => false,
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image_url' => "{$seedImg}/community-cover.jpg",
            ],
            [
                'name' => 'Yoga Studio (Pending)',
                'name_es' => 'Estudio de Yoga (Pendiente)',
                'name_ar' => 'استوديو اليوغا (قيد المراجعة)',
                'description' => 'Mirrored studio with mats and sound system. Awaiting admin review.',
                'description_es' => 'Estudio con espejos, colchonetas y sistema de sonido. Pendiente de aprobación.',
                'description_ar' => 'استوديو مزوّد بمرايا وحصائر ونظام صوتي. بانتظار مراجعة المسؤول.',
                'status' => 'bookable',
                'review_status' => 'pending',
                'capacity' => 16,
                'floor' => 'Level 3',
                'hours' => '7:00 AM – 8:00 PM',
                'start_time' => '07:00:00',
                'end_time' => '20:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 60,
                'icon_key' => 'spa',
                'image_url' => "{$seedImg}/deal-spa.jpg",
            ],
            [
                'name' => 'Guest Parking Bay (Pending)',
                'name_es' => 'Estacionamiento de Visitantes (Pendiente)',
                'name_ar' => 'موقف سيارات الضيوف (قيد المراجعة)',
                'description' => 'Reserved overnight guest parking spots near the lobby.',
                'description_es' => 'Plazas de estacionamiento nocturno reservadas para visitantes cerca del vestíbulo.',
                'description_ar' => 'أماكن وقوف سيارات ليلية محجوزة للضيوف بالقرب من الاستقبال.',
                'status' => 'bookable',
                'review_status' => 'pending',
                'capacity' => 6,
                'floor' => 'P1',
                'hours' => '12:00 AM – 11:59 PM',
                'start_time' => '00:00:00',
                'end_time' => '23:59:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 120,
                'icon_key' => 'parking',
                'image_url' => "{$seedImg}/community-cover.jpg",
            ],
            [
                'name' => 'Sauna',
                'name_es' => 'Sauna',
                'name_ar' => 'الساونا',
                'description' => 'Cedar dry sauna for up to 8 residents. Book 45-minute sessions.',
                'description_es' => 'Sauna seca de cedro para hasta 8 residentes. Reservas de 45 minutos.',
                'description_ar' => 'ساونا جافة تتسع لـ 8 سكان. احجز جلسات لمدة 45 دقيقة.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 8,
                'floor' => 'Spa level',
                'hours' => '7:00 AM – 9:00 PM',
                'start_time' => '07:00:00',
                'end_time' => '21:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 45,
                'icon_key' => 'spa',
                'image_url' => "{$seedImg}/deal-spa.jpg",
            ],
            [
                'name' => 'Basketball Court',
                'name_es' => 'Cancha de Baloncesto',
                'name_ar' => 'ملعب كرة السلة',
                'description' => 'Full outdoor court with night lighting. Max 10 players per booking.',
                'description_es' => 'Cancha exterior completa con iluminación nocturna. Máximo 10 jugadores.',
                'description_ar' => 'ملعب خارجي كامل مع إضاءة ليلية. حتى 10 لاعبين.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 10,
                'floor' => 'Sports court',
                'hours' => '7:00 AM – 10:00 PM',
                'start_time' => '07:00:00',
                'end_time' => '22:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 60,
                'icon_key' => 'sports',
                'image_url' => "{$seedImg}/wellness-exercise.jpg",
            ],
            [
                'name' => 'Bike Storage Room',
                'name_es' => 'Almacén de Bicicletas',
                'name_ar' => 'غرفة تخزين الدراجات',
                'description' => 'Secure indoor racks for resident bikes. Day-use lockers available.',
                'description_es' => 'Soportes interiores seguros para bicicletas. Taquillas de uso diario.',
                'description_ar' => 'حوامل داخلية آمنة للدراجات مع خزائن يومية.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 40,
                'floor' => 'P2',
                'hours' => '6:00 AM – 11:00 PM',
                'start_time' => '06:00:00',
                'end_time' => '23:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image_url' => "{$seedImg}/listing-bike.jpg",
            ],
            [
                'name' => 'Co-working Studio',
                'name_es' => 'Estudio de Coworking',
                'name_ar' => 'استوديو العمل المشترك',
                'description' => 'Quiet desks, monitors, and high-speed Wi‑Fi for remote work.',
                'description_es' => 'Escritorios silenciosos, monitores y Wi‑Fi de alta velocidad.',
                'description_ar' => 'مكاتب هادئة وشاشات وواي فاي عالي السرعة.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 14,
                'floor' => 'Level 2',
                'hours' => '8:00 AM – 8:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '20:00:00',
                'weekends_available' => false,
                'slot_duration_minutes' => 120,
                'icon_key' => 'meeting',
                'image_url' => "{$seedImg}/listing-desk.jpg",
            ],
            [
                'name' => 'Pet Wash Station',
                'name_es' => 'Estación de Lavado de Mascotas',
                'name_ar' => 'محطة غسل الحيوانات',
                'description' => 'Raised tubs, dryer, and supplies for dogs and cats.',
                'description_es' => 'Bañeras elevadas, secador y productos para perros y gatos.',
                'description_ar' => 'أحواض مرتفعة ومجفف ومستلزمات للكلاب والقطط.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 2,
                'floor' => 'Garden level',
                'hours' => '8:00 AM – 7:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '19:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 30,
                'icon_key' => 'building',
                'image_url' => "{$seedImg}/feed-dog.jpg",
            ],
            [
                'name' => 'Cinema Room',
                'name_es' => 'Sala de Cine',
                'name_ar' => 'غرفة السينما',
                'description' => '12 reclining seats, surround sound, and a 120-inch screen.',
                'description_es' => '12 asientos reclinables, sonido envolvente y pantalla de 120 pulgadas.',
                'description_ar' => '12 مقعدًا مائلًا وصوت محيطي وشاشة 120 بوصة.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 12,
                'floor' => 'Level 1',
                'hours' => '10:00 AM – 11:00 PM',
                'start_time' => '10:00:00',
                'end_time' => '23:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 150,
                'icon_key' => 'hall',
                'image_url' => "{$seedImg}/listing-tv.jpg",
            ],
            [
                'name' => 'Library Nook',
                'name_es' => 'Rincón de Biblioteca',
                'name_ar' => 'ركن المكتبة',
                'description' => 'Quiet reading room with resident book swap shelves.',
                'description_es' => 'Sala de lectura silenciosa con intercambio de libros.',
                'description_ar' => 'غرفة قراءة هادئة مع أرفف تبادل الكتب.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 10,
                'floor' => 'Lobby',
                'hours' => '8:00 AM – 9:00 PM',
                'start_time' => '08:00:00',
                'end_time' => '21:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => null,
                'icon_key' => 'building',
                'image_url' => "{$seedImg}/wellness-learning.jpg",
            ],
            [
                'name' => 'Putting Green',
                'name_es' => 'Green de Putting',
                'name_ar' => 'ملعب وضع الغولف',
                'description' => 'Three-hole practice green next to the courtyard garden.',
                'description_es' => 'Green de práctica de tres hoyos junto al jardín.',
                'description_ar' => 'ملعب تدريب من ثلاث حفر بجانب حديقة الفناء.',
                'status' => 'open',
                'review_status' => 'approved',
                'capacity' => 6,
                'floor' => 'Courtyard',
                'hours' => '7:00 AM – 7:00 PM',
                'start_time' => '07:00:00',
                'end_time' => '19:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => null,
                'icon_key' => 'sports',
                'image_url' => "{$seedImg}/wellness-weight.jpg",
            ],
            [
                'name' => 'Game Room',
                'name_es' => 'Sala de Juegos',
                'name_ar' => 'غرفة الألعاب',
                'description' => 'Pool table, foosball, and a Nintendo Switch dock for residents.',
                'description_es' => 'Mesa de billar, futbolín y Nintendo Switch para residentes.',
                'description_ar' => 'طاولة بلياردو وفوس بول ونينتندو سويتش للسكان.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 16,
                'floor' => 'Level 1',
                'hours' => '10:00 AM – 10:00 PM',
                'start_time' => '10:00:00',
                'end_time' => '22:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 90,
                'icon_key' => 'hall',
                'image_url' => "{$seedImg}/wellness-social.jpg",
            ],
            [
                'name' => 'Guest Suite',
                'name_es' => 'Suite de Invitados',
                'name_ar' => 'جناح الضيوف',
                'description' => 'Overnight suite for visiting family. Max 2-night stay, admin approval required.',
                'description_es' => 'Suite nocturna para visitas. Máximo 2 noches, requiere aprobación.',
                'description_ar' => 'جناح ليلي للزوار. إقامة ليلتين كحد أقصى بموافقة الإدارة.',
                'status' => 'bookable',
                'review_status' => 'approved',
                'capacity' => 2,
                'floor' => 'Level 4',
                'hours' => '3:00 PM – 11:00 AM',
                'start_time' => '15:00:00',
                'end_time' => '11:00:00',
                'weekends_available' => true,
                'slot_duration_minutes' => 1440,
                'icon_key' => 'building',
                'image_url' => "{$seedImg}/listing-sofa.jpg",
            ],
        ];

        $inserted = 0;
        $amenityIdsByName = [];

        foreach ($rows as $row) {
            $existingId = DB::table('amenities')
                ->where('community_id', $communityId)
                ->where('name', $row['name'])
                ->value('id');

            if ($existingId) {
                DB::table('amenities')->where('id', $existingId)->update([
                    'name_es' => $row['name_es'] ?? null,
                    'name_ar' => $row['name_ar'] ?? null,
                    'description_es' => $row['description_es'] ?? null,
                    'description_ar' => $row['description_ar'] ?? null,
                    'image_url' => $row['image_url'] ?? null,
                    'icon_key' => $row['icon_key'],
                    'updated_at' => $now,
                ]);
                $amenityIdsByName[$row['name']] = (int) $existingId;
                continue;
            }

            // Match loosely on "swimming pool" vs "Swimming Pool"
            $fuzzyId = DB::table('amenities')
                ->where('community_id', $communityId)
                ->whereRaw('LOWER(name) = ?', [strtolower($row['name'])])
                ->value('id');

            if ($fuzzyId) {
                DB::table('amenities')->where('id', $fuzzyId)->update([
                    'name_es' => $row['name_es'] ?? null,
                    'name_ar' => $row['name_ar'] ?? null,
                    'description' => $row['description'],
                    'description_es' => $row['description_es'] ?? null,
                    'description_ar' => $row['description_ar'] ?? null,
                    'status' => $row['status'],
                    'review_status' => $row['review_status'],
                    'capacity' => $row['capacity'],
                    'floor' => $row['floor'],
                    'hours' => $row['hours'],
                    'start_time' => $row['start_time'],
                    'end_time' => $row['end_time'],
                    'weekends_available' => $row['weekends_available'],
                    'slot_duration_minutes' => $row['slot_duration_minutes'],
                    'icon_key' => $row['icon_key'],
                    'image_url' => $row['image_url'] ?? null,
                    'updated_at' => $now,
                ]);
                $amenityIdsByName[$row['name']] = (int) $fuzzyId;
                continue;
            }

            $id = DB::table('amenities')->insertGetId([
                'community_id' => $communityId,
                'created_by' => $creatorId,
                'name' => $row['name'],
                'name_es' => $row['name_es'] ?? null,
                'name_ar' => $row['name_ar'] ?? null,
                'description' => $row['description'],
                'description_es' => $row['description_es'] ?? null,
                'description_ar' => $row['description_ar'] ?? null,
                'status' => $row['status'],
                'review_status' => $row['review_status'],
                'capacity' => $row['capacity'],
                'floor' => $row['floor'],
                'hours' => $row['hours'],
                'start_time' => $row['start_time'],
                'end_time' => $row['end_time'],
                'weekends_available' => $row['weekends_available'],
                'slot_duration_minutes' => $row['slot_duration_minutes'],
                'image_url' => $row['image_url'] ?? null,
                'icon_key' => $row['icon_key'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $amenityIdsByName[$row['name']] = (int) $id;
            $inserted++;
        }

        $bookingsAdded = $this->seedSampleBookings(
            $communityId,
            $amenityIdsByName,
            $residentIds,
            $now,
        );

        $total = DB::table('amenities')->where('community_id', $communityId)->count();
        $pending = DB::table('amenities')
            ->where('community_id', $communityId)
            ->where('review_status', 'pending')
            ->count();

        $this->command?->info(
            "AmenitySeeder: community #{$communityId} — inserted {$inserted} amenities ".
            "(total {$total}, pending reviews {$pending}), sample bookings +{$bookingsAdded}."
        );
    }

    /**
     * @param  array<string, int>  $amenityIdsByName
     * @param  list<int>  $residentIds
     */
    private function seedSampleBookings(
        int $communityId,
        array $amenityIdsByName,
        array $residentIds,
        $now,
    ): int {
        if ($residentIds === []) {
            return 0;
        }

        $poolId = $amenityIdsByName['Swimming Pool']
            ?? DB::table('amenities')
                ->where('community_id', $communityId)
                ->where('review_status', 'approved')
                ->where('status', 'bookable')
                ->orderBy('id')
                ->value('id');

        $hallId = $amenityIdsByName['Community Hall'] ?? null;
        $tennisId = $amenityIdsByName['Tennis Court'] ?? null;

        $tomorrow = now()->addDay()->toDateString();
        $dayAfter = now()->addDays(2)->toDateString();
        $nextWeek = now()->addDays(5)->toDateString();

        $samples = array_values(array_filter([
            $poolId ? [
                'amenity_id' => (int) $poolId,
                'user_id' => $residentIds[0],
                'date' => $tomorrow,
                'time_slot' => '10:00 AM - 11:00 AM',
                'guests' => 2,
                'status' => 'pending',
                'notes' => 'Family swim — please keep shallow end clear.',
            ] : null,
            $poolId && isset($residentIds[1]) ? [
                'amenity_id' => (int) $poolId,
                'user_id' => $residentIds[1],
                'date' => $dayAfter,
                'time_slot' => '04:00 PM - 05:00 PM',
                'guests' => 1,
                'status' => 'confirmed',
                'notes' => null,
            ] : null,
            $hallId && isset($residentIds[2]) ? [
                'amenity_id' => (int) $hallId,
                'user_id' => $residentIds[2],
                'date' => $nextWeek,
                'time_slot' => '02:00 PM - 04:00 PM',
                'guests' => 20,
                'status' => 'pending',
                'notes' => 'Birthday gathering — need tables set up.',
            ] : null,
            $tennisId ? [
                'amenity_id' => (int) $tennisId,
                'user_id' => $residentIds[0],
                'date' => $dayAfter,
                'time_slot' => '08:00 AM - 09:00 AM',
                'guests' => 2,
                'status' => 'pending',
                'notes' => 'Doubles practice.',
            ] : null,
        ]));

        $added = 0;
        foreach ($samples as $sample) {
            $exists = DB::table('bookings')
                ->where('amenity_id', $sample['amenity_id'])
                ->where('user_id', $sample['user_id'])
                ->where('date', $sample['date'])
                ->where('time_slot', $sample['time_slot'])
                ->exists();

            if ($exists) {
                continue;
            }

            DB::table('bookings')->insert([
                ...$sample,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $added++;
        }

        return $added;
    }
}
