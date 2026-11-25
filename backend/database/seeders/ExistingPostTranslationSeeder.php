<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ExistingPostTranslationSeeder extends Seeder
{
    public function run(): void
    {
        $translations = [
            'Has anyone seen Biscuit? Our golden retr' => [
                'es' => '¿Alguien ha visto a Biscuit? Nuestro golden retriever se escapó esta mañana cerca del edificio 3. Lleva un collar azul con placa de identificación. Por favor envíenme un mensaje si lo ven — es muy amigable.',
                'ar' => 'هل رأى أحد بسكويت؟ كلبنا الغولدن ريتريفر هرب هذا الصباح بالقرب من المبنى ٣. يرتدي طوقاً أزرق مع بطاقة تعريف. أرجو مراسلتي إذا شاهدتموه — إنه ودود جداً.',
            ],
            'The Saturday farmers market two blocks o' => [
                'es' => '¡El mercado de agricultores de los sábados a dos cuadras es increíble! Encontré las fresas más frescas y pan artesanal. Recomiendo ir temprano para la mejor selección.',
                'ar' => 'سوق المزارعين يوم السبت على بُعد شارعين رائع! وجدت أطيب الفراولة وخبز حرفي. أنصح بالذهاب مبكراً للحصول على أفضل تشكيلة.',
            ],
            'Starting a morning run group!' => [
                'es' => '¡Estoy organizando un grupo de carrera matutina! Nos reunimos en la entrada principal todos los martes y jueves a las 6:30 AM. Todos los niveles son bienvenidos — sin presión, solo diversión.',
                'ar' => 'أبدأ مجموعة جري صباحية! نلتقي عند المدخل الرئيسي كل ثلاثاء وخميس الساعة ٦:٣٠ صباحاً. جميع المستويات مرحب بها — بدون ضغط، فقط متعة.',
            ],
            'Looking for a recommendation for a relia' => [
                'es' => 'Busco recomendaciones de un plomero confiable en la zona. Tenemos una fuga menor en la cocina y necesitamos que alguien la revise pronto. ¡Gracias por adelantado!',
                'ar' => 'أبحث عن توصية لسبّاك موثوق في المنطقة. لدينا تسريب بسيط في المطبخ ونحتاج من يفحصه قريباً. شكراً مقدماً!',
            ],
            'Big thank you to the maintenance team fo' => [
                'es' => '¡Muchas gracias al equipo de mantenimiento por arreglar la iluminación del pasillo tan rápido! El edificio se ve mucho mejor ahora. ¡Apreciamos su trabajo!',
                'ar' => 'شكر كبير لفريق الصيانة على إصلاح إضاءة الممر بهذه السرعة! المبنى يبدو أفضل بكثير الآن. نقدّر عملكم!',
            ],
        ];

        $updated = 0;
        $posts = DB::table('posts')->whereNull('body_es')->get();

        foreach ($posts as $post) {
            foreach ($translations as $prefix => $trans) {
                if (str_starts_with($post->body, $prefix)) {
                    DB::table('posts')->where('id', $post->id)->update([
                        'body_es' => $trans['es'],
                        'body_ar' => $trans['ar'],
                    ]);
                    $updated++;

                    break;
                }
            }
        }

        $this->command?->info("ExistingPostTranslationSeeder: updated {$updated} posts with translations.");
    }
}
