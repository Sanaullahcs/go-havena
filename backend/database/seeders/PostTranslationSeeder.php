<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PostTranslationSeeder extends Seeder
{
    public function run(): void
    {
        $translations = [
            'Had the most amazing time at yesterday' => [
                'es' => '¡La pasé increíble en la fiesta de la piscina de ayer! Qué gusto conocerlos a todos. ¡Espero con ansias el próximo evento comunitario!',
                'ar' => 'قضيت وقتاً رائعاً في حفلة المسبح أمس! سعيد بلقاء الجميع. أتطلع للفعالية المجتمعية القادمة!',
            ],
            'Reminder: Yoga in the Park' => [
                'es' => 'Recordatorio: Yoga en el Parque este domingo a las 7 AM cerca del jardín este. Todos los niveles son bienvenidos, ¡trae tu propio tapete!',
                'ar' => 'تذكير: يوغا في الحديقة يوم الأحد القادم الساعة ٧ صباحاً بالقرب من الحديقة الشرقية. جميع المستويات مرحب بها، أحضر سجادتك الخاصة!',
            ],
            'Hi neighbors! Has anyone seen a black cat' => [
                'es' => '¡Hola vecinos! ¿Alguien ha visto un gato negro cerca del bloque C? Mi gato se escapó esta mañana. Por favor escríbanme si lo ven.',
                'ar' => 'مرحباً يا جيران! هل رأى أحدكم قطاً أسود بالقرب من المبنى C؟ هرب قطي هذا الصباح. أرجو مراسلتي إذا شاهدتموه.',
            ],
            'Just wanted to say' => [
                'es' => '¡Solo quería decir que los nuevos equipos del gimnasio son fantásticos! Gracias a la administración por la mejora. ¡El edificio mejora cada mes!',
                'ar' => 'أردت فقط أن أقول — معدات الصالة الرياضية الجديدة رائعة! شكراً للإدارة على التحديث. المبنى يتحسن كل شهر!',
            ],
            'FYI the package room is overflowing' => [
                'es' => 'Para su información, la sala de paquetes está desbordada en este momento. Por favor recojan sus entregas lo antes posible. La administración pide a todos retirar sus paquetes.',
                'ar' => 'للعلم، غرفة الطرود ممتلئة حالياً. يرجى استلام شحناتكم في أقرب وقت ممكن. الإدارة تطلب من الجميع تسلّم طرودهم.',
            ],
            'Welcome to our newest resident' => [
                'es' => '¡Bienvenida a nuestra nueva residente, Emily Rodriguez en el Apt 1C! Por favor denle una cálida bienvenida cuando la vean en el edificio.',
                'ar' => 'نرحب بالمقيمة الجديدة، إيميلي رودريغيز في الشقة 1C! نتمنى منكم الترحيب بها عند رؤيتها في المبنى.',
            ],
            'Does anyone know a good pediatrician' => [
                'es' => '¿Alguien conoce un buen pediatra cerca?',
                'ar' => 'هل يعرف أحد طبيب أطفال جيد بالقرب من هنا؟',
            ],
            'Free moving boxes available' => [
                'es' => '¡Cajas de mudanza gratis disponibles en el vestíbulo — se atiende por orden de llegada!',
                'ar' => 'صناديق نقل مجانية متوفرة في الاستقبال — الأسبقية لمن يأتي أولاً!',
            ],
            'Looking for a dog walker' => [
                'es' => 'Busco a alguien que pasee a mi perro por las mañanas entre semana. ¿Alguna recomendación?',
                'ar' => 'أبحث عن شخص لتمشية الكلب صباحاً خلال أيام الأسبوع. هل من توصيات؟',
            ],
            'Pool maintenance scheduled' => [
                'es' => 'Mantenimiento de la piscina programado para el jueves de 9 AM a 12 PM.',
                'ar' => 'صيانة المسبح مجدولة يوم الخميس من ٩ صباحاً حتى ١٢ ظهراً.',
            ],
            'New recycling bins have been installed' => [
                'es' => 'Se han instalado nuevos contenedores de reciclaje cerca del Edificio C.',
                'ar' => 'تم تركيب حاويات إعادة تدوير جديدة بالقرب من المبنى C.',
            ],
            'Great turnout at last weekend' => [
                'es' => '¡Gran asistencia en la parrillada comunitaria del fin de semana pasado — ¡gracias a todos!',
                'ar' => 'حضور رائع في حفلة الشواء المجتمعية نهاية الأسبوع الماضي — شكراً للجميع!',
            ],
            'Anyone have a ladder' => [
                'es' => '¿Alguien tiene una escalera que me pueda prestar por una hora esta tarde?',
                'ar' => 'هل لدى أحد سلّم يمكنني استعارته لمدة ساعة بعد الظهر؟',
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

        $this->command?->info("PostTranslationSeeder: updated {$updated} posts with translations.");
    }
}
