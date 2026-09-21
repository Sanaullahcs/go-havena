<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ExtraAmenityTranslationSeeder extends Seeder
{
    public function run(): void
    {
        $translations = [
            'Business Lounge' => ['es' => 'Salón Ejecutivo', 'ar' => 'صالة الأعمال', 'desc_es' => 'Espacio de trabajo compartido con Wi-Fi y cafetería.', 'desc_ar' => 'مساحة عمل مشتركة مع واي فاي ومقهى.'],
            'Rooftop Terrace' => ['es' => 'Terraza en la Azotea', 'ar' => 'تراس السطح', 'desc_es' => 'Terraza al aire libre con vistas panorámicas y zona de descanso.', 'desc_ar' => 'شرفة خارجية بإطلالات بانورامية ومنطقة استرخاء.'],
            "Children's Playground" => ['es' => 'Parque Infantil', 'ar' => 'ملعب الأطفال', 'desc_es' => 'Área de juegos segura para niños con equipo moderno.', 'desc_ar' => 'منطقة لعب آمنة للأطفال مع معدات حديثة.'],
            'Resident Cinema' => ['es' => 'Cine de Residentes', 'ar' => 'سينما السكان', 'desc_es' => 'Sala de cine privada con proyector de alta definición.', 'desc_ar' => 'قاعة سينما خاصة مع جهاز عرض عالي الدقة.'],
            'Bike Storage' => ['es' => 'Estacionamiento de Bicicletas', 'ar' => 'موقف الدراجات', 'desc_es' => 'Área cubierta y segura para estacionar bicicletas.', 'desc_ar' => 'مساحة مغطاة وآمنة لركن الدراجات.'],
            'Laundry Room' => ['es' => 'Lavandería', 'ar' => 'غرفة الغسيل', 'desc_es' => 'Lavadoras y secadoras de uso compartido disponibles las 24 horas.', 'desc_ar' => 'غسالات ومجففات مشتركة متاحة على مدار الساعة.'],
        ];

        $updated = 0;

        foreach ($translations as $name => $trans) {
            $count = DB::table('amenities')
                ->where('name', $name)
                ->whereNull('name_es')
                ->update([
                    'name_es' => $trans['es'],
                    'name_ar' => $trans['ar'],
                    'description_es' => $trans['desc_es'] ?? null,
                    'description_ar' => $trans['desc_ar'] ?? null,
                ]);
            $updated += $count;
        }

        $this->command?->info("ExtraAmenityTranslationSeeder: updated {$updated} amenities.");
    }
}
