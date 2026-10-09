<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationMessageFilterTest extends TestCase
{
    use RefreshDatabase;

    public function test_message_filter_includes_chat_alerts_stored_as_info(): void
    {
        $user = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
        ]);

        DB::table('app_notifications')->insert([
            [
                'user_id'    => $user->id,
                'type'       => 'info',
                'title'      => 'New message from Nora',
                'body'       => 'Can you approve the visitor?',
                'action_url' => '/screens/messages/chat?conversationId=12',
                'data'       => json_encode(['kind' => 'message', 'conversation_id' => 12]),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id'    => $user->id,
                'type'       => 'message',
                'title'      => 'Direct message',
                'body'       => 'Stored with the message type.',
                'action_url' => '/admin/messages?conversation=4',
                'data'       => null,
                'created_at' => now()->subMinute(),
                'updated_at' => now()->subMinute(),
            ],
            [
                'user_id'    => $user->id,
                'type'       => 'info',
                'title'      => 'New Notice',
                'body'       => 'Elevator maintenance',
                'action_url' => '/notices/2',
                'data'       => json_encode(['kind' => 'notice']),
                'created_at' => now()->subMinutes(2),
                'updated_at' => now()->subMinutes(2),
            ],
            [
                'user_id'    => $user->id,
                'type'       => 'warning',
                'title'      => 'New report filed',
                'body'       => 'Review moderation.',
                'action_url' => '/admin/moderation',
                'data'       => json_encode(['kind' => 'ugc_report']),
                'created_at' => now()->subMinutes(3),
                'updated_at' => now()->subMinutes(3),
            ],
        ]);

        Sanctum::actingAs($user);

        $filtered = $this->getJson('/api/v1/notifications?type=message')
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.message', 2)
            ->assertJsonPath('meta.warning', 1);

        $titles = collect($filtered->json('data'))->pluck('title')->all();
        $this->assertEqualsCanonicalizing([
            'New message from Nora',
            'Direct message',
        ], $titles);

        $this->getJson('/api/v1/notifications?type=warning')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.title', 'New report filed')
            ->assertJsonPath('meta.message', 2);

        $this->getJson('/api/v1/notifications?type=info')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }
}
