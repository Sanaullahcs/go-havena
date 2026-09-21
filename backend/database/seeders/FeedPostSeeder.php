<?php

namespace Database\Seeders;

use App\Models\Community;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class FeedPostSeeder extends Seeder
{
    public function run(): void
    {
        $communities = Community::query()
            ->where('status', 'active')
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhere('review_status', 'approved');
            })
            ->orderBy('id')
            ->get();

        if ($communities->isEmpty()) {
            $this->command?->warn('FeedPostSeeder: no active communities found.');

            return;
        }

        $samples = [
            ['general',
                'Does anyone know a good pediatrician nearby?',
                '¿Alguien conoce un buen pediatra cerca?',
                'هل يعرف أحد طبيب أطفال جيد بالقرب من هنا؟',
            ],
            ['help',
                'Free moving boxes available in the lobby — first come first served!',
                '¡Cajas de mudanza gratis disponibles en el vestíbulo — se atiende por orden de llegada!',
                'صناديق نقل مجانية متوفرة في الاستقبال — الأسبقية لمن يأتي أولاً!',
            ],
            ['help',
                'Looking for a dog walker for weekday mornings. Any recommendations?',
                'Busco a alguien que pasee a mi perro por las mañanas entre semana. ¿Alguna recomendación?',
                'أبحث عن شخص لتمشية الكلب صباحاً خلال أيام الأسبوع. هل من توصيات؟',
            ],
            ['event',
                'Reminder: Yoga in the Park this Sunday at 7 AM near the east garden.',
                'Recordatorio: Yoga en el Parque este domingo a las 7 AM cerca del jardín este.',
                'تذكير: يوغا في الحديقة يوم الأحد الساعة ٧ صباحاً بالقرب من الحديقة الشرقية.',
            ],
            ['announcement',
                'Pool maintenance scheduled for Thursday 9 AM–12 PM.',
                'Mantenimiento de la piscina programado para el jueves de 9 AM a 12 PM.',
                'صيانة المسبح مجدولة يوم الخميس من ٩ صباحاً حتى ١٢ ظهراً.',
            ],
            ['update',
                'New recycling bins have been installed near Building C.',
                'Se han instalado nuevos contenedores de reciclaje cerca del Edificio C.',
                'تم تركيب حاويات إعادة تدوير جديدة بالقرب من المبنى C.',
            ],
            ['general',
                'Great turnout at last weekend\'s community BBQ — thanks everyone!',
                '¡Gran asistencia en la parrillada comunitaria del fin de semana pasado — ¡gracias a todos!',
                'حضور رائع في حفلة الشواء المجتمعية نهاية الأسبوع الماضي — شكراً للجميع!',
            ],
            ['help',
                'Anyone have a ladder I could borrow for an hour this afternoon?',
                '¿Alguien tiene una escalera que me pueda prestar por una hora esta tarde?',
                'هل لدى أحد سلّم يمكنني استعارته لمدة ساعة بعد الظهر؟',
            ],
        ];

        $created = 0;

        foreach ($communities as $community) {
            $memberIds = DB::table('community_memberships')
                ->where('community_id', $community->id)
                ->where('status', 'approved')
                ->orderBy('id')
                ->pluck('user_id')
                ->unique()
                ->values();

            if ($memberIds->isEmpty()) {
                $memberIds = DB::table('users')->orderBy('id')->limit(4)->pluck('id');
            }

            if ($memberIds->isEmpty()) {
                continue;
            }

            $existingCount = DB::table('posts')
                ->where('community_id', $community->id)
                ->whereNull('deleted_at')
                ->count();

            if ($existingCount >= 4) {
                continue;
            }

            foreach ($samples as $index => [$category, $body, $bodyEs, $bodyAr]) {
                $userId = $memberIds[$index % $memberIds->count()];

                $exists = DB::table('posts')
                    ->where('community_id', $community->id)
                    ->where('user_id', $userId)
                    ->where('body', $body)
                    ->exists();

                if ($exists) {
                    continue;
                }

                $postId = DB::table('posts')->insertGetId([
                    'community_id'   => $community->id,
                    'user_id'        => $userId,
                    'body'           => $body,
                    'body_es'        => $bodyEs,
                    'body_ar'        => $bodyAr,
                    'category'       => $category,
                    'status'         => 'approved',
                    'approved_at'    => now(),
                    'likes_count'    => 0,
                    'comments_count' => 0,
                    'created_at'     => now()->subHours($index * 4 + rand(1, 12)),
                    'updated_at'     => now(),
                ]);

                app(FeedEngagementSeeder::class)->seedPostEngagement((object) [
                    'id'             => $postId,
                    'user_id'        => $userId,
                    'community_id'   => $community->id,
                    'likes_count'    => rand(2, 12),
                    'comments_count' => rand(1, 4),
                ]);
                $created++;
            }
        }

        $this->command?->info("FeedPostSeeder: {$created} sample post(s) added across communities.");
    }
}
