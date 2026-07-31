<?php

namespace Database\Seeders;

use App\Support\WellnessCategoryCatalog;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class WellnessHubSeeder extends Seeder
{
    private const SAMPLE_VIDEO = 'https://www.w3schools.com/html/mov_bbb.mp4';

    private const SAMPLE_VIDEO_ALT = 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4';

    public function run(): void
    {
        WellnessCategoryCatalog::ensureInDatabase();

        DB::table('wellness_lesson_progress')->delete();
        DB::table('wellness_lessons')->delete();
        DB::table('wellness_courses')->delete();

        $now = now();
        $categoryIds = DB::table('wellness_categories')
            ->whereIn('key', WellnessCategoryCatalog::keys())
            ->pluck('id', 'key');

        foreach ($this->catalog() as $catKey => $courses) {
            $categoryId = $categoryIds[$catKey] ?? null;
            if (! $categoryId) {
                continue;
            }

            foreach ($courses as $courseIndex => $course) {
                $courseId = DB::table('wellness_courses')->insertGetId([
                    'category_id' => $categoryId,
                    'title'       => $course['title'],
                    'description' => $course['description'],
                    'image_url'   => $course['image_url'] ?? null,
                    'sort_order'  => $courseIndex,
                    'status'      => $course['status'] ?? 'published',
                    'created_at'  => $now,
                    'updated_at'  => $now,
                ]);

                foreach ($course['lessons'] as $lessonIndex => $lesson) {
                    $linkUrl = $lesson['link_url'] ?? self::SAMPLE_VIDEO;

                    DB::table('wellness_lessons')->insert([
                        'course_id'     => $courseId,
                        'title'         => $lesson['title'],
                        'description'   => $lesson['description'],
                        'duration_min'  => $lesson['duration_min'],
                        'video_url'     => $linkUrl,
                        'link_url'      => $linkUrl,
                        'file_path'     => $lesson['file_path'] ?? null,
                        'key_takeaways' => json_encode($lesson['key_takeaways']),
                        'sort_order'    => $lessonIndex,
                        'status'        => $lesson['status'] ?? 'published',
                        'created_at'    => $now,
                        'updated_at'    => $now,
                    ]);
                }
            }
        }

        $courseCount = DB::table('wellness_courses')->count();
        $lessonCount = DB::table('wellness_lessons')->count();
        $this->command?->info("WellnessHubSeeder: {$courseCount} courses and {$lessonCount} lessons seeded.");
    }

    /** @return array<string, list<array<string, mixed>>> */
    private function catalog(): array
    {
        return [
            'weight' => [
                [
                    'title'       => 'Balanced Nutrition Basics',
                    'description' => 'Learn the fundamentals of healthy eating, portion control, and meal planning for sustainable wellness.',
                    'status'      => 'published',
                    'lessons'     => [
                        $this->lesson(
                            'Understanding Macronutrients',
                            'Discover how proteins, carbohydrates, and fats fuel your body and how to balance them on your plate.',
                            12,
                            [
                                'Protein supports muscle repair and satiety.',
                                'Complex carbs provide steady energy throughout the day.',
                                'Healthy fats are essential for hormone balance.',
                                'Aim for balance, not elimination.',
                            ],
                        ),
                        $this->lesson(
                            'Building Balanced Plates',
                            'Use the plate method to create satisfying meals without counting every calorie.',
                            10,
                            [
                                'Fill half your plate with vegetables.',
                                'Reserve one quarter for lean protein.',
                                'Use the remaining quarter for whole grains or starchy vegetables.',
                            ],
                            self::SAMPLE_VIDEO_ALT,
                        ),
                        $this->lesson(
                            'Smart Snacking Strategies',
                            'Choose snacks that keep energy stable and cravings in check between meals.',
                            8,
                            [
                                'Pair protein with fiber for lasting fullness.',
                                'Pre-portion snacks to avoid mindless eating.',
                                'Keep water nearby — thirst is often mistaken for hunger.',
                            ],
                        ),
                    ],
                ],
                [
                    'title'       => 'Meal Prep Mastery',
                    'description' => 'Save time and eat better with simple weekly meal prep routines designed for busy residents.',
                    'status'      => 'published',
                    'lessons'     => [
                        $this->lesson(
                            'Planning Your Prep Day',
                            'Set up a repeatable Sunday routine that takes under two hours.',
                            15,
                            [
                                'Pick 2–3 recipes you enjoy eating twice.',
                                'Shop with a list organized by store section.',
                                'Wash and chop produce as soon as you get home.',
                            ],
                        ),
                        $this->lesson(
                            'Batch Cooking Essentials',
                            'Cook grains, proteins, and roasted vegetables in bulk for mix-and-match meals.',
                            14,
                            [
                                'Roast a tray of vegetables with one seasoning blend.',
                                'Cook a large batch of rice or quinoa for the week.',
                                'Store items in clear containers at eye level.',
                            ],
                        ),
                    ],
                ],
            ],
            'exercise' => [
                [
                    'title'       => 'Exercise Fundamentals',
                    'description' => 'Build strength, mobility, and cardiovascular fitness with beginner-friendly guided sessions.',
                    'status'      => 'published',
                    'lessons'     => [
                        $this->lesson(
                            'Warm-Up Basics',
                            'Prepare your joints and muscles safely before every workout.',
                            8,
                            [
                                'Start with 3–5 minutes of light movement.',
                                'Include dynamic stretches for hips and shoulders.',
                                'Raise your heart rate gradually, not suddenly.',
                            ],
                        ),
                        $this->lesson(
                            'Core Strength Foundations',
                            'Strengthen your midsection to improve posture and reduce back discomfort.',
                            12,
                            [
                                'Engage your core before every rep.',
                                'Quality of movement beats quantity.',
                                'Breathe steadily — do not hold your breath.',
                            ],
                            self::SAMPLE_VIDEO_ALT,
                        ),
                        $this->lesson(
                            'Cool Down & Stretch',
                            'Lower your heart rate and improve flexibility after each session.',
                            10,
                            [
                                'Hold static stretches for 20–30 seconds.',
                                'Focus on areas that feel tight after your workout.',
                                'Finish with slow, deep breathing.',
                            ],
                        ),
                    ],
                ],
                [
                    'title'       => 'Home Workout Essentials',
                    'description' => 'Stay active anywhere with bodyweight routines that need no equipment.',
                    'status'      => 'published',
                    'lessons'     => [
                        $this->lesson(
                            'Full-Body Circuit',
                            'A 20-minute circuit using squats, push-ups, lunges, and planks.',
                            20,
                            [
                                'Perform each exercise for 40 seconds, rest 20 seconds.',
                                'Modify push-ups on knees if needed.',
                                'Stay hydrated and listen to your body.',
                            ],
                        ),
                        $this->lesson(
                            'Recovery Day Mobility',
                            'Gentle movement to help muscles recover and maintain range of motion.',
                            12,
                            [
                                'Move slowly through each stretch.',
                                'Recovery days are part of progress, not a break from it.',
                                'Walk lightly if you feel stiff.',
                            ],
                        ),
                    ],
                ],
            ],
            'stress' => [
                [
                    'title'       => 'Breathing for Calm',
                    'description' => 'Simple breathing techniques you can use anywhere to reduce stress and reset your nervous system.',
                    'status'      => 'published',
                    'lessons'     => [
                        $this->lesson(
                            'Box Breathing',
                            'A four-count inhale, hold, exhale, and hold pattern used by athletes and first responders.',
                            8,
                            [
                                'Inhale through your nose for 4 counts.',
                                'Hold gently for 4 counts.',
                                'Exhale slowly for 4 counts.',
                                'Repeat for 4–6 cycles.',
                            ],
                        ),
                        $this->lesson(
                            'Extended Exhale Relaxation',
                            'Lengthen your exhale to activate your body\'s rest-and-digest response.',
                            10,
                            [
                                'Make your exhale twice as long as your inhale.',
                                'Place a hand on your belly to feel it rise and fall.',
                                'Use this before sleep or difficult conversations.',
                            ],
                            self::SAMPLE_VIDEO_ALT,
                        ),
                        $this->lesson(
                            'Grounding Breath Break',
                            'A 3-minute reset you can do at your desk or in the elevator.',
                            6,
                            [
                                'Notice five things you can see around you.',
                                'Take three slow breaths with your eyes soft.',
                                'Roll your shoulders back once before continuing your day.',
                            ],
                        ),
                    ],
                ],
                [
                    'title'       => 'Mindful Moments',
                    'description' => 'Short mindfulness practices designed for busy schedules and noisy environments.',
                    'status'      => 'published',
                    'lessons'     => [
                        $this->lesson(
                            'Body Scan Relaxation',
                            'Move attention through your body to release tension you may not notice.',
                            12,
                            [
                                'Start at the top of your head and move downward.',
                                'Soften each area without forcing relaxation.',
                                'Return to the breath if your mind wanders.',
                            ],
                        ),
                        $this->lesson(
                            'Gratitude Practice',
                            'Shift perspective by naming three specific things you appreciate today.',
                            7,
                            [
                                'Be specific — "my morning coffee" not just "food".',
                                'Include something about yourself or your effort.',
                                'Write them down to strengthen the habit.',
                            ],
                        ),
                    ],
                ],
            ],
            'learning' => [
                [
                    'title'       => 'Learning Wellness Basics',
                    'description' => 'Build a growth mindset and daily habits that support lifelong learning and personal development.',
                    'status'      => 'published',
                    'lessons'     => [
                        $this->lesson(
                            'Growth Mindset Introduction',
                            'Understand how beliefs about ability shape your willingness to try new things.',
                            10,
                            [
                                'Skills grow with practice, not just talent.',
                                'Replace "I can\'t" with "I can\'t yet".',
                                'Celebrate effort, not only outcomes.',
                            ],
                        ),
                        $this->lesson(
                            'Daily Reflection Habit',
                            'Spend five minutes reviewing what went well and what you learned.',
                            8,
                            [
                                'Ask: What did I learn today?',
                                'Note one thing to try differently tomorrow.',
                                'Keep a simple journal or notes app entry.',
                            ],
                        ),
                        $this->lesson(
                            'Habit Stacking',
                            'Attach new habits to routines you already do without thinking.',
                            11,
                            [
                                'After I ___, I will ___.',
                                'Start with habits that take under two minutes.',
                                'Stack only one new habit at a time.',
                            ],
                            self::SAMPLE_VIDEO_ALT,
                        ),
                    ],
                ],
                [
                    'title'       => 'Goal Setting for Growth',
                    'description' => 'Create meaningful, achievable goals using a simple framework you can revisit monthly.',
                    'status'      => 'draft',
                    'lessons'     => [
                        $this->lesson(
                            'Writing SMART Goals',
                            'Turn vague wishes into specific, measurable action plans.',
                            12,
                            [
                                'Specific: define exactly what success looks like.',
                                'Measurable: pick a number or milestone.',
                                'Achievable: stretch yourself but stay realistic.',
                            ],
                            status: 'draft',
                        ),
                    ],
                ],
            ],
            'social' => [
                [
                    'title'       => 'Connecting with Neighbors',
                    'description' => 'Build meaningful connections in your community through small, consistent acts of friendliness.',
                    'status'      => 'published',
                    'lessons'     => [
                        $this->lesson(
                            'Introduction to Community Wellness',
                            'Why social connection is as important as diet and exercise for long-term health.',
                            9,
                            [
                                'Strong ties reduce stress and increase resilience.',
                                'Small greetings count — you do not need grand gestures.',
                                'Consistency builds trust over time.',
                            ],
                        ),
                        $this->lesson(
                            'Active Listening Skills',
                            'Listen to understand, not just to reply, in hallway chats and community events.',
                            11,
                            [
                                'Put your phone away during conversations.',
                                'Reflect back what you heard before sharing your view.',
                                'Ask open-ended questions.',
                            ],
                        ),
                        $this->lesson(
                            'Planning a Group Activity',
                            'Organize a low-effort gathering like a coffee meetup or dog-walk group.',
                            13,
                            [
                                'Pick a simple activity with a clear time and place.',
                                'Invite three people personally rather than a mass post.',
                                'Follow up with a thank-you message afterward.',
                            ],
                            self::SAMPLE_VIDEO_ALT,
                        ),
                        $this->lesson(
                            'Supporting Neighbors',
                            'Recognize when someone may need help and offer support respectfully.',
                            10,
                            [
                                'Offer specific help: "I can pick up groceries" not "let me know".',
                                'Respect privacy — do not share others\' situations.',
                                'Connect people with community resources when appropriate.',
                            ],
                        ),
                        $this->lesson(
                            'Building Trust Over Time',
                            'Trust grows through reliability, honesty, and showing up.',
                            8,
                            [
                                'Do what you say you will do.',
                                'Apologize quickly when you miss the mark.',
                                'Celebrate others\' wins genuinely.',
                            ],
                        ),
                        $this->lesson(
                            'Healthy Boundaries',
                            'Stay connected while protecting your energy and personal space.',
                            10,
                            [
                                'It is okay to say no to events when you need rest.',
                                'Communicate availability clearly.',
                                'Boundaries make relationships sustainable.',
                            ],
                        ),
                    ],
                ],
                [
                    'title'       => 'Healthy Communication',
                    'description' => 'Communicate with empathy and clarity during everyday interactions and difficult conversations.',
                    'status'      => 'published',
                    'lessons'     => [
                        $this->lesson(
                            'Using "I" Statements',
                            'Express concerns without blaming or escalating conflict.',
                            9,
                            [
                                'Say "I feel… when… because…" instead of "You always…".',
                                'Focus on one issue at a time.',
                                'Pause if emotions run high.',
                            ],
                        ),
                        $this->lesson(
                            'Navigating Disagreements',
                            'Handle differences of opinion with respect in shared spaces.',
                            11,
                            [
                                'Assume good intent until proven otherwise.',
                                'Look for shared goals before debating details.',
                                'Agree to revisit the topic later if needed.',
                            ],
                        ),
                        $this->lesson(
                            'Digital Community Etiquette',
                            'Keep group chats and community boards constructive and welcoming.',
                            8,
                            [
                                'Read before reacting.',
                                'Avoid all-caps and sarcasm that can be misread.',
                                'Report issues to moderators instead of public call-outs.',
                            ],
                        ),
                        $this->lesson(
                            'Giving and Receiving Feedback',
                            'Share constructive feedback kindly and accept it with curiosity.',
                            10,
                            [
                                'Be specific and timely with feedback.',
                                'Separate behavior from character.',
                                'Thank people who offer you honest input.',
                            ],
                        ),
                        $this->lesson(
                            'Conflict De-escalation',
                            'Simple steps to lower tension before a disagreement grows.',
                            12,
                            [
                                'Lower your voice and slow your speech.',
                                'Acknowledge the other person\'s feelings.',
                                'Suggest a short break if needed.',
                            ],
                            self::SAMPLE_VIDEO_ALT,
                        ),
                        $this->lesson(
                            'Celebrating Community Wins',
                            'Recognize milestones and strengthen bonds through shared celebration.',
                            7,
                            [
                                'Acknowledge volunteers and organizers publicly.',
                                'Share photos and thank-yous after events.',
                                'Invite newcomers to the next gathering.',
                            ],
                        ),
                    ],
                ],
            ],
        ];
    }

    /**
     * @param  list<string>  $takeaways
     * @return array<string, mixed>
     */
    private function lesson(
        string $title,
        string $description,
        int $durationMin,
        array $takeaways,
        ?string $linkUrl = null,
        string $status = 'published',
    ): array {
        return [
            'title'         => $title,
            'description'   => $description,
            'duration_min'  => $durationMin,
            'link_url'      => $linkUrl ?? self::SAMPLE_VIDEO,
            'key_takeaways' => $takeaways,
            'status'        => $status,
        ];
    }
}
