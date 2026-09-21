<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class NoticeAndDealTranslationSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedNoticeTranslations();
        $this->seedDealTranslations();
    }

    private function seedNoticeTranslations(): void
    {
        if (! Schema::hasColumn('notices', 'title_es')) {
            $this->command?->warn('notices.title_es column missing — run migrations first.');
            return;
        }

        $translations = [
            'Welcome to Florida Main Street' => [
                'title_es' => 'Bienvenido a Florida Main Street',
                'title_ar' => 'مرحباً بكم في فلوريدا ماين ستريت',
                'body_es'  => 'Estamos encantados de darle la bienvenida a nuestra comunidad. Use esta aplicación para mantenerse al día con avisos, confirmar asistencia a eventos, reservar instalaciones, explorar el mercado vecinal y conectarse con sus vecinos.',
                'body_ar'  => 'يسعدنا الترحيب بكم في مجتمعنا. استخدم هذا التطبيق للبقاء على اطلاع بالإعلانات، وتأكيد الحضور للفعاليات، وحجز المرافق، وتصفح سوق الجيران، والتواصل مع جيرانك.',
            ],
            'Pool Deck Resurfacing Schedule' => [
                'title_es' => 'Programa de renovación de la terraza de la piscina',
                'title_ar' => 'جدول تجديد سطح المسبح',
                'body_es'  => 'La terraza de la piscina será renovada la próxima semana. La piscina permanecerá abierta, pero la sección norte estará cerrada de lunes a miércoles de 8:00 AM a 4:00 PM.',
                'body_ar'  => 'سيتم تجديد سطح المسبح الأسبوع المقبل. سيبقى المسبح مفتوحاً، لكن القسم الشمالي سيكون مغلقاً من الاثنين إلى الأربعاء من 8:00 صباحاً حتى 4:00 مساءً.',
            ],
            'Q3 Community Budget Summary' => [
                'title_es' => 'Resumen del presupuesto comunitario del tercer trimestre',
                'title_ar' => 'ملخص ميزانية المجتمع للربع الثالث',
                'body_es'  => 'El resumen del presupuesto del tercer trimestre ya está disponible en la sección de Documentos. Se presentará un desglose detallado en la próxima asamblea.',
                'body_ar'  => 'ملخص ميزانية الربع الثالث متاح الآن في قسم المستندات. سيتم تقديم تفاصيل كاملة في الاجتماع القادم.',
            ],
            'Updated Gate Access Codes' => [
                'title_es' => 'Códigos de acceso actualizados',
                'title_ar' => 'رموز الدخول المحدّثة',
                'body_es'  => 'Por seguridad de todos, los códigos de acceso a puertas e instalaciones se rotarán a fin de mes. Los códigos actualizados se enviarán por correo electrónico.',
                'body_ar'  => 'لسلامة الجميع، سيتم تغيير رموز الوصول للبوابات والمرافق نهاية الشهر. ستُرسل الرموز المحدّثة عبر البريد الإلكتروني.',
            ],
            'Elevator Modernization Update' => [
                'title_es' => 'Actualización de modernización del ascensor',
                'title_ar' => 'تحديث تحديث المصعد',
                'body_es'  => 'El ascensor B en la torre este se someterá a modernización durante las próximas dos semanas. El ascensor A sigue completamente operativo.',
                'body_ar'  => 'سيخضع المصعد ب في البرج الشرقي للتحديث خلال الأسبوعين المقبلين. المصعد أ يعمل بشكل كامل.',
            ],
            'Landscaping Refresh This Month' => [
                'title_es' => 'Renovación del paisajismo este mes',
                'title_ar' => 'تجديد المناظر الطبيعية هذا الشهر',
                'body_es'  => 'Nuestro equipo está renovando los jardines de entrada y las plantaciones del patio este mes con flores de temporada e iluminación mejorada.',
                'body_ar'  => 'يقوم فريقنا بتجديد حدائق المدخل ومزروعات الفناء هذا الشهر بزهور موسمية وإضاءة محسّنة.',
            ],
            'Saturday Farmers Market Shuttle' => [
                'title_es' => 'Transporte al mercado de agricultores del sábado',
                'title_ar' => 'حافلة سوق المزارعين يوم السبت',
                'body_es'  => 'Un transporte gratuito saldrá del vestíbulo al mercado de agricultores cada sábado de 8:00 AM a 12:00 PM. Sin necesidad de reserva.',
                'body_ar'  => 'ستنطلق حافلة مجانية من الردهة إلى سوق المزارعين كل سبت من 8:00 صباحاً حتى 12:00 ظهراً. بدون حجز مسبق.',
            ],
            'New Resident Welcome Packets' => [
                'title_es' => 'Paquetes de bienvenida para nuevos residentes',
                'title_ar' => 'حزم ترحيب للمقيمين الجدد',
                'body_es'  => 'Los nuevos vecinos pueden recoger paquetes de bienvenida en la oficina de administración con horarios, información Wi-Fi y directrices de reciclaje.',
                'body_ar'  => 'يمكن للجيران الجدد استلام حزم الترحيب من مكتب الإدارة مع ساعات العمل ومعلومات الواي فاي وإرشادات إعادة التدوير.',
            ],
            'Clubhouse Hours Extended' => [
                'title_es' => 'Horario extendido del salón',
                'title_ar' => 'تمديد ساعات النادي',
                'body_es'  => 'El salón del club permanecerá abierto hasta las 10:00 PM los viernes y sábados a partir de este fin de semana.',
                'body_ar'  => 'سيبقى صالة النادي مفتوحة حتى 10:00 مساءً أيام الجمعة والسبت بدءاً من نهاية الأسبوع هذا.',
            ],
            'Pet Registration Reminder' => [
                'title_es' => 'Recordatorio de registro de mascotas',
                'title_ar' => 'تذكير بتسجيل الحيوانات الأليفة',
                'body_es'  => 'Por favor registre sus mascotas en la oficina de administración con una foto reciente y registros de vacunación.',
                'body_ar'  => 'يرجى تسجيل حيواناتكم الأليفة في مكتب الإدارة مع صورة حديثة وسجلات التطعيم.',
            ],
            'Summer Community BBQ' => [
                'title_es' => 'Parrillada comunitaria de verano',
                'title_ar' => 'شواء المجتمع الصيفي',
                'body_es'  => 'Únase a sus vecinos en nuestra parrillada más grande de la temporada con comida a la parrilla, juegos, música en vivo y mucha sombra.',
                'body_ar'  => 'انضموا إلى جيرانكم في أكبر شواء لدينا هذا الموسم مع مشويات وألعاب وموسيقى حية.',
            ],
            'Quarterly Residents Town Hall' => [
                'title_es' => 'Asamblea trimestral de residentes',
                'title_ar' => 'الاجتماع الربع سنوي للمقيمين',
                'body_es'  => 'Conozca al equipo de administración, revise las actualizaciones comunitarias y comparta sus ideas.',
                'body_ar'  => 'قابل فريق الإدارة، واستعرض تحديثات المجتمع، وشارك أفكارك.',
            ],
            'Poolside Movie Night' => [
                'title_es' => 'Noche de cine junto a la piscina',
                'title_ar' => 'ليلة سينما بجانب المسبح',
                'body_es'  => 'Traiga una toalla y disfrute una película familiar bajo las estrellas junto a la piscina. Palomitas y refrescos incluidos.',
                'body_ar'  => 'أحضر منشفتك واستمتع بفيلم عائلي تحت النجوم بجانب المسبح. فشار ومشروبات مجانية.',
            ],
            'Holiday Cookie Exchange' => [
                'title_es' => 'Intercambio de galletas navideñas',
                'title_ar' => 'تبادل كعك العطلات',
                'body_es'  => 'Traiga una tanda de sus galletas favoritas e intercámbielas con los vecinos. Una forma acogedora de conocer gente nueva.',
                'body_ar'  => 'أحضر دفعة من كعكك المفضل وتبادلها مع الجيران. طريقة ودية للتعرف على أشخاص جدد.',
            ],
            'Sunrise Yoga by the Pool' => [
                'title_es' => 'Yoga al amanecer junto a la piscina',
                'title_ar' => 'يوغا الفجر بجانب المسبح',
                'body_es'  => 'Comience el fin de semana con una sesión de yoga suave dirigida por la instructora residente Lisa. Todos los niveles son bienvenidos.',
                'body_ar'  => 'ابدأ نهاية الأسبوع بجلسة يوغا لطيفة بقيادة المدربة المقيمة ليسا. جميع المستويات مرحّب بها.',
            ],
            'Fitness Bootcamp Saturday' => [
                'title_es' => 'Bootcamp de fitness del sábado',
                'title_ar' => 'معسكر اللياقة يوم السبت',
                'body_es'  => 'Un bootcamp al aire libre de alta energía con estaciones de cardio, fuerza y movilidad. Traiga agua y zapatos deportivos.',
                'body_ar'  => 'معسكر تدريبي خارجي عالي الطاقة مع محطات للقلب والقوة والمرونة. أحضر ماء وحذاء رياضي.',
            ],
            'Neighborhood Coffee Meetup' => [
                'title_es' => 'Encuentro de café del vecindario',
                'title_ar' => 'لقاء قهوة الحي',
                'body_es'  => 'Café y conversación casual para residentes nuevos y veteranos. Pase en cualquier momento durante el horario abierto.',
                'body_ar'  => 'قهوة ومحادثة غير رسمية للمقيمين الجدد والقدامى. مرّ في أي وقت خلال ساعات الاستقبال.',
            ],
            'Kids Arts & Crafts Afternoon' => [
                'title_es' => 'Tarde de arte y manualidades para niños',
                'title_ar' => 'عصرية الفنون والحرف للأطفال',
                'body_es'  => 'Estaciones creativas para niños de 5 a 12 años con pintura, stickers y manualidades para llevar a casa.',
                'body_ar'  => 'محطات إبداعية للأطفال من 5 إلى 12 سنة مع رسم وملصقات وحرف يدوية للمنزل.',
            ],
        ];

        foreach ($translations as $title => $cols) {
            DB::table('notices')
                ->where('title', $title)
                ->update($cols);
        }
    }

    private function seedDealTranslations(): void
    {
        if (! Schema::hasColumn('deals', 'title_es')) {
            $this->command?->warn('deals.title_es column missing — run migrations first.');
            return;
        }

        $translations = [
            '20% Off Any Latte' => [
                'title_es'           => '20% de descuento en cualquier latte',
                'title_ar'           => 'خصم 20% على أي لاتيه',
                'description_es'     => 'Muestre este cupón en el mostrador para obtener un 20% de descuento en cualquier latte, caliente o frío.',
                'description_ar'     => 'أظهر هذا القسيمة عند المنضدة للحصول على خصم 20% على أي لاتيه، ساخن أو بارد.',
                'discount_label_es'  => '20% DESC.',
                'discount_label_ar'  => 'خصم 20%',
            ],
            'Free First Pilates Class' => [
                'title_es'           => 'Primera clase de Pilates gratis',
                'title_ar'           => 'أول حصة بيلاتس مجاناً',
                'description_es'     => '¿Nuevo en el estudio? Tu primera clase de reformer es por nuestra cuenta. Reserva en línea o pasa a reservar tu lugar.',
                'description_ar'     => 'جديد في الاستوديو؟ حصتك الأولى على حسابنا. احجز عبر الإنترنت أو مرّ لحجز مكانك.',
                'discount_label_es'  => 'PRUEBA GRATIS',
                'discount_label_ar'  => 'تجربة مجانية',
            ],
            '$15 Off Any Spa Service' => [
                'title_es'           => '$15 de descuento en cualquier servicio de spa',
                'title_ar'           => 'خصم 15$ على أي خدمة سبا',
                'description_es'     => 'Date un capricho con un facial o masaje y ahorra $15 en cualquier servicio de spa superior a $60. Solo para vecinos.',
                'description_ar'     => 'دلّل نفسك بعلاج للوجه أو تدليك ووفّر 15$ على أي خدمة سبا تزيد عن 60$. للجيران فقط.',
                'discount_label_es'  => '$15 DESC.',
                'discount_label_ar'  => 'خصم 15$',
            ],
            'Family Pizza Night 2-for-1' => [
                'title_es'           => 'Noche de pizza familiar 2x1',
                'title_ar'           => 'ليلة بيتزا عائلية 2 بسعر 1',
                'description_es'     => 'Compre cualquier pizza grande al horno de leña y obtenga una segunda de igual o menor valor gratis, cada martes por la noche.',
                'description_ar'     => 'اشترِ أي بيتزا كبيرة من الفرن الحجري واحصل على ثانية بنفس القيمة أو أقل مجاناً، كل ثلاثاء مساءً.',
                'discount_label_es'  => '2 POR 1',
                'discount_label_ar'  => '2 بسعر 1',
            ],
        ];

        foreach ($translations as $title => $cols) {
            DB::table('deals')
                ->where('title', $title)
                ->update($cols);
        }
    }
}
