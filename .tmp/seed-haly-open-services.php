<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$community = DB::table('communities')->where('name', 'like', '%Haly Tower%')->first();
if (! $community) {
    echo "missing_community\n";
    exit(1);
}
$cid = (int) $community->id;

$adminId = (int) (DB::table('community_memberships')
    ->where('community_id', $cid)
    ->whereIn('role', ['admin', 'community_admin'])
    ->where('status', 'approved')
    ->value('user_id') ?: 0);
if (! $adminId) {
    $adminId = (int) (DB::table('users')->where('email', 'sana@gohavena.com')->value('id') ?: 0);
}

$services = [
    [
        'name' => 'Valet Parking',
        'name_es' => 'Valet de estacionamiento',
        'name_ar' => 'صف السيارات',
        'description' => 'Lobby valet for visitors and office staff when the desk is running it. No reservation in the app — ask reception on arrival.',
        'description_es' => 'Valet en el lobby para visitas y oficinas cuando el servicio está activo. Sin reserva en la app: consulte en recepción.',
        'description_ar' => 'خدمة صف السيارات عند الردهة للزوار ومكاتب البرج عند توفرها. لا حاجة لحجز في التطبيق — اسأل الاستقبال عند الوصول.',
        'floor' => 'Ground lobby / basement ramps',
        'hours' => 'Building hours — confirm at reception',
        'icon_key' => 'parking',
    ],
    [
        'name' => 'Prayer Area',
        'name_es' => 'Sala de oración',
        'name_ar' => 'مصلى',
        'description' => 'Gents and ladies prayer space inside Haly Tower. No reservation required. Ask reception for the current room and access rules.',
        'description_es' => 'Espacio de oración para hombres y mujeres. Sin reserva. Pregunte en recepción por la sala actual y las normas de acceso.',
        'description_ar' => 'مصلى للرجال والنساء داخل هالي تاور. بدون حجز. اسأل الاستقبال عن الموقع الحالي وقواعد الدخول.',
        'floor' => 'Ask reception',
        'hours' => 'Open during building hours',
        'icon_key' => 'building',
    ],
    [
        'name' => 'Meeting Room',
        'name_es' => 'Sala de reuniones',
        'name_ar' => 'قاعة اجتماعات',
        'description' => 'Shared huddle space for office teams when a room is free. No booking in the app — confirm availability at reception before you sit.',
        'description_es' => 'Sala compartida para equipos de oficina cuando está libre. Sin reserva en la app: confirme en recepción antes de usarla.',
        'description_ar' => 'غرفة اجتماعات مشتركة لفرق المكاتب عند توفرها. لا حجز في التطبيق — أكد التوفر من الاستقبال قبل الاستخدام.',
        'floor' => 'Ask reception',
        'hours' => 'Weekday office hours — ask reception',
        'icon_key' => 'meeting',
    ],
    [
        'name' => 'Loading Bay',
        'name_es' => 'Zona de carga',
        'name_ar' => 'منصة التحميل',
        'description' => 'Service access for shop and food-court deliveries, including the goods lift. No app booking. Ask reception for the current delivery window.',
        'description_es' => 'Acceso de servicio para entregas de tiendas y food court, incluido el montacargas. Sin reserva. Consulte en recepción el horario vigente.',
        'description_ar' => 'مدخل خدمة لتوصيل المتاجر والفود كورت مع مصعد البضائع. بدون حجز. اسأل الاستقبال عن فترة التسليم الحالية.',
        'floor' => 'Basement / service entrance',
        'hours' => 'Delivery window — ask reception',
        'icon_key' => 'building',
    ],
    [
        'name' => 'Food Court Tables',
        'name_es' => 'Mesas del food court',
        'name_ar' => 'طاولات الفود كورت',
        'description' => 'Open seating on the 3rd-floor food court for families and office groups. Walk in and sit — no reservation and no booking fee.',
        'description_es' => 'Mesas abiertas en el food court del tercer piso. Entrada libre, sin reserva ni cargo.',
        'description_ar' => 'جلوس مفتوح في فود كورت الطابق الثالث للعائلات ومجموعات المكاتب. ادخل واجلس — بدون حجز أو رسوم.',
        'floor' => '3rd floor food court',
        'hours' => 'Food court hours',
        'icon_key' => 'dining',
    ],
];

$now = now();
$hasBilling = Schema::hasColumn('amenities', 'shared_billing_enabled');
$hasFee = Schema::hasColumn('amenities', 'booking_fee');

foreach ($services as $row) {
    $payload = [
        'created_by' => $adminId ?: null,
        'name_es' => $row['name_es'],
        'name_ar' => $row['name_ar'],
        'description' => $row['description'],
        'description_es' => $row['description_es'],
        'description_ar' => $row['description_ar'],
        'status' => 'open',
        'review_status' => 'approved',
        'rejection_reason' => null,
        'capacity' => 0,
        'floor' => $row['floor'],
        'icon_key' => $row['icon_key'],
        'hours' => $row['hours'],
        'start_time' => null,
        'end_time' => null,
        'weekends_available' => true,
        'slot_duration_minutes' => null,
        'updated_at' => $now,
    ];
    if ($hasBilling) {
        $payload['shared_billing_enabled'] = false;
        $payload['shared_billing_type'] = null;
        $payload['shared_billing_frequency'] = null;
        $payload['shared_billing_amount'] = null;
        $payload['shared_billing_due_day'] = null;
    }
    if ($hasFee) {
        $payload['booking_fee'] = 0;
    }

    $existing = DB::table('amenities')
        ->where('community_id', $cid)
        ->where('name', $row['name'])
        ->first();

    if ($existing) {
        DB::table('amenities')->where('id', $existing->id)->update($payload);
        echo "updated {$existing->id} {$row['name']}\n";
    } else {
        $payload['community_id'] = $cid;
        $payload['name'] = $row['name'];
        $payload['created_at'] = $now;
        $id = DB::table('amenities')->insertGetId($payload);
        echo "created {$id} {$row['name']}\n";
    }
}

$list = DB::table('amenities')
    ->where('community_id', $cid)
    ->orderBy('id')
    ->get(['id', 'name', 'status', 'review_status', 'floor', 'hours', 'icon_key', 'shared_billing_enabled']);

echo "haly_amenities=".$list->count()."\n";
foreach ($list as $row) {
    echo $row->id.'|'.$row->status.'|'.$row->review_status.'|'.$row->icon_key.'|'.$row->floor.'|'.$row->name."\n";
}
echo "done\n";
