<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ActivityLogSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        $userLogs = [
            ['log_type' => 'user', 'user_id' => 1, 'action' => 'login',              'description' => 'Admin logged in from 192.168.1.10',                  'entity_type' => 'User',         'entity_id' => 1,  'ip_address' => '192.168.1.10', 'severity' => 'info',    'created_at' => $now->copy()->subMinutes(2)],
            ['log_type' => 'user', 'user_id' => 1, 'action' => 'member_approved',    'description' => 'Approved membership for Sarah Mitchell (Apt 4B)',     'entity_type' => 'User',         'entity_id' => 10, 'ip_address' => '192.168.1.10', 'severity' => 'info',    'created_at' => $now->copy()->subMinutes(15)],
            ['log_type' => 'user', 'user_id' => 1, 'action' => 'notice_published',   'description' => 'Published notice: "Community BBQ this Saturday"',     'entity_type' => 'Notice',       'entity_id' => 3,  'ip_address' => '192.168.1.10', 'severity' => 'info',    'created_at' => $now->copy()->subMinutes(32)],
            ['log_type' => 'user', 'user_id' => 2, 'action' => 'report_resolved',    'description' => 'Moderator resolved noise complaint from Apt 7A',      'entity_type' => 'Report',       'entity_id' => 12, 'ip_address' => '10.0.0.5',     'severity' => 'info',    'created_at' => $now->copy()->subHours(1)],
            ['log_type' => 'user', 'user_id' => 1, 'action' => 'listing_approved',   'description' => 'Approved marketplace listing: "Sony 4K TV"',          'entity_type' => 'Listing',      'entity_id' => 8,  'ip_address' => '192.168.1.10', 'severity' => 'info',    'created_at' => $now->copy()->subHours(2)],
            ['log_type' => 'user', 'user_id' => 1, 'action' => 'member_suspended',   'description' => 'Suspended account of James Okafor (Apt 7A)',          'entity_type' => 'User',         'entity_id' => 11, 'ip_address' => '192.168.1.10', 'severity' => 'warning', 'created_at' => $now->copy()->subHours(3)],
            ['log_type' => 'user', 'user_id' => 2, 'action' => 'report_escalated',   'description' => 'Escalated report #9 to senior moderation',            'entity_type' => 'Report',       'entity_id' => 9,  'ip_address' => '10.0.0.5',     'severity' => 'warning', 'created_at' => $now->copy()->subHours(4)],
            ['log_type' => 'user', 'user_id' => 1, 'action' => 'notice_created',     'description' => 'Created draft notice: "Water maintenance schedule"',  'entity_type' => 'Notice',       'entity_id' => 2,  'ip_address' => '192.168.1.10', 'severity' => 'info',    'created_at' => $now->copy()->subHours(5)],
            ['log_type' => 'user', 'user_id' => 3, 'action' => 'profile_updated',    'description' => 'Resident updated profile photo and contact info',     'entity_type' => 'User',         'entity_id' => 3,  'ip_address' => '10.0.1.22',    'severity' => 'info',    'created_at' => $now->copy()->subHours(6)],
            ['log_type' => 'user', 'user_id' => 1, 'action' => 'member_approved',    'description' => 'Approved membership for David Chen (Apt 6D)',         'entity_type' => 'User',         'entity_id' => 15, 'ip_address' => '192.168.1.10', 'severity' => 'info',    'created_at' => $now->copy()->subHours(7)],
            ['log_type' => 'user', 'user_id' => 1, 'action' => 'listing_rejected',   'description' => 'Rejected marketplace listing: "Pirated Software"',   'entity_type' => 'Listing',      'entity_id' => 22, 'ip_address' => '192.168.1.10', 'severity' => 'warning', 'created_at' => $now->copy()->subHours(8)],
            ['log_type' => 'user', 'user_id' => 1, 'action' => 'login',              'description' => 'Admin logged in from 192.168.1.10',                  'entity_type' => 'User',         'entity_id' => 1,  'ip_address' => '192.168.1.10', 'severity' => 'info',    'created_at' => $now->copy()->subDays(1)],
        ];

        $systemLogs = [
            ['log_type' => 'system', 'user_id' => null, 'action' => 'cron_executed',   'description' => 'Daily cleanup job completed — 12 expired sessions pruned',  'entity_type' => 'Job',    'entity_id' => null, 'ip_address' => null, 'severity' => 'info',     'created_at' => $now->copy()->subMinutes(5)],
            ['log_type' => 'system', 'user_id' => null, 'action' => 'email_sent',       'description' => 'Batch email dispatched to 248 residents (BBQ notice)',       'entity_type' => 'Notice', 'entity_id' => 3,    'ip_address' => null, 'severity' => 'info',     'created_at' => $now->copy()->subMinutes(35)],
            ['log_type' => 'system', 'user_id' => null, 'action' => 'api_error',         'description' => 'External geocoding API returned 503 (retry #2 succeeded)', 'entity_type' => null,     'entity_id' => null, 'ip_address' => null, 'severity' => 'warning',  'created_at' => $now->copy()->subHours(1)->subMinutes(10)],
            ['log_type' => 'system', 'user_id' => null, 'action' => 'db_backup',         'description' => 'Scheduled database backup completed (124 MB)',              'entity_type' => null,     'entity_id' => null, 'ip_address' => null, 'severity' => 'info',     'created_at' => $now->copy()->subHours(2)],
            ['log_type' => 'system', 'user_id' => null, 'action' => 'cache_cleared',     'description' => 'Application cache cleared after config update',             'entity_type' => null,     'entity_id' => null, 'ip_address' => null, 'severity' => 'info',     'created_at' => $now->copy()->subHours(3)],
            ['log_type' => 'system', 'user_id' => null, 'action' => 'failed_login',      'description' => 'Failed login attempt from 203.0.113.42 — account locked',  'entity_type' => 'User',   'entity_id' => 6,    'ip_address' => '203.0.113.42', 'severity' => 'error', 'created_at' => $now->copy()->subHours(4)],
            ['log_type' => 'system', 'user_id' => null, 'action' => 'push_sent',          'description' => 'Push notification batch sent to 384 active devices',       'entity_type' => null,     'entity_id' => null, 'ip_address' => null, 'severity' => 'info',     'created_at' => $now->copy()->subHours(5)],
            ['log_type' => 'system', 'user_id' => null, 'action' => 'storage_alert',      'description' => 'Media storage at 68% capacity — threshold warning at 80%', 'entity_type' => null,     'entity_id' => null, 'ip_address' => null, 'severity' => 'warning',  'created_at' => $now->copy()->subHours(6)],
            ['log_type' => 'system', 'user_id' => null, 'action' => 'cron_executed',      'description' => 'Hourly notification digest job ran — 0 errors',            'entity_type' => 'Job',    'entity_id' => null, 'ip_address' => null, 'severity' => 'info',     'created_at' => $now->copy()->subHours(7)],
            ['log_type' => 'system', 'user_id' => null, 'action' => 'deployment',         'description' => 'Havena v2.1.4 deployed successfully',                'entity_type' => null,     'entity_id' => null, 'ip_address' => null, 'severity' => 'info',     'created_at' => $now->copy()->subDays(1)],
            ['log_type' => 'system', 'user_id' => null, 'action' => 'rate_limit',         'description' => 'Rate limit triggered on /api/v1/auth/login from 198.51.0.1','entity_type' => null,    'entity_id' => null, 'ip_address' => '198.51.0.1', 'severity' => 'critical', 'created_at' => $now->copy()->subDays(1)->subHours(3)],
            ['log_type' => 'system', 'user_id' => null, 'action' => 'db_backup',          'description' => 'Scheduled database backup completed (121 MB)',             'entity_type' => null,     'entity_id' => null, 'ip_address' => null, 'severity' => 'info',     'created_at' => $now->copy()->subDays(2)],
        ];

        // Add updated_at
        $rows = array_merge(
            array_map(fn($r) => array_merge($r, ['updated_at' => $r['created_at']]), $userLogs),
            array_map(fn($r) => array_merge($r, ['updated_at' => $r['created_at']]), $systemLogs),
        );

        DB::table('activity_logs')->insert($rows);
    }
}
