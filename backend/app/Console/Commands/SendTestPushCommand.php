<?php

namespace App\Console\Commands;

use App\Services\PushNotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SendTestPushCommand extends Command
{
    protected $signature = 'nbr:push-test
                            {userId? : User ID to notify}
                            {--title=NeighborLink test : Notification title}
                            {--body=Push notifications are working! : Notification body}';

    protected $description = 'Send a test Expo push notification to a user registered devices';

    public function handle(): int
    {
        if (! Schema::hasTable('devices')) {
            $this->error('devices table not found. Run migrations first.');

            return self::FAILURE;
        }

        $userId = $this->argument('userId');
        if ($userId === null) {
            $row = DB::table('devices')
                ->where(function ($query) {
                    $query->whereNotNull('expo_push_token')
                        ->where('expo_push_token', '!=', '')
                        ->orWhereNotNull('fcm_token');
                })
                ->orderByDesc('last_seen_at')
                ->first(['user_id', 'expo_push_token', 'fcm_token', 'platform']);

            if (! $row) {
                $this->error('No registered devices found. Open the dev APK, login, and enable Push in Settings.');

                return self::FAILURE;
            }

            $userId = (int) $row->user_id;
            $this->line("Using latest device for user #{$userId} ({$row->platform})");
            if ($row->expo_push_token) {
                $this->line("Expo token: {$row->expo_push_token}");
            }
            if ($row->fcm_token) {
                $this->line("FCM token: {$row->fcm_token}");
            }
        } else {
            $userId = (int) $userId;
            $count  = DB::table('devices')->where('user_id', $userId)->count();
            if ($count === 0) {
                $this->error("User #{$userId} has no registered push devices.");

                return self::FAILURE;
            }
            $this->line("Sending to {$count} device(s) for user #{$userId}");
        }

        $title = (string) $this->option('title');
        $body  = (string) $this->option('body');
        $payload = [
            'type'       => 'test_push',
            'action_url' => '/admin/notifications',
            'actionUrl'  => '/admin/notifications',
        ];

        PushNotificationService::sendToUser($userId, $title, $body, $payload);
        \App\Services\FcmNotificationService::sendToUser($userId, $title, $body, $payload);

        $this->info('Test push sent via Expo Push + Firebase Cloud Messaging.');

        return self::SUCCESS;
    }
}
