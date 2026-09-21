<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->unsignedBigInteger('actor_user_id')->nullable()->after('user_id');
            $table->string('actor_role', 40)->nullable()->after('actor_user_id');
            $table->string('actor_type', 40)->nullable()->after('actor_role');
            $table->unsignedBigInteger('subject_user_id')->nullable()->after('actor_type');
            $table->unsignedBigInteger('community_id')->nullable()->after('subject_user_id');
            $table->string('module', 80)->nullable()->after('community_id');
            $table->string('status', 40)->nullable()->after('module');
            $table->string('request_id', 64)->nullable()->after('status');

            $table->index(['community_id', 'created_at'], 'activity_logs_community_created_idx');
            $table->index(['actor_user_id', 'created_at'], 'activity_logs_actor_created_idx');
            $table->index(['subject_user_id', 'created_at'], 'activity_logs_subject_created_idx');
            $table->index(['actor_role', 'created_at'], 'activity_logs_role_created_idx');
            $table->index(['action', 'created_at'], 'activity_logs_action_created_idx');
            $table->index(['module', 'created_at'], 'activity_logs_module_created_idx');
        });

        DB::table('activity_logs')->whereNull('actor_user_id')->update([
            'actor_user_id' => DB::raw('user_id'),
        ]);

        DB::table('activity_logs')
            ->whereNull('community_id')
            ->where('entity_type', 'Community')
            ->whereNotNull('entity_id')
            ->update([
                'community_id' => DB::raw('entity_id'),
            ]);

        $roles = DB::table('users')->pluck('role', 'id');
        DB::table('activity_logs')
            ->whereNull('actor_type')
            ->orderBy('id')
            ->chunkById(200, function ($rows) use ($roles) {
                foreach ($rows as $row) {
                    $userId = $row->actor_user_id ?: $row->user_id;
                    $role = $row->actor_role ?: ($userId ? ($roles[$userId] ?? null) : null);
                    $type = match ($role) {
                        'system_admin', 'admin' => 'system_admin',
                        'community_admin' => 'community_admin',
                        'guest' => 'guest',
                        'resident' => 'resident',
                        default => $row->log_type === 'system' ? 'system' : 'user',
                    };
                    if ($row->log_type === 'system' && ! $userId) {
                        $type = 'system';
                    }

                    DB::table('activity_logs')->where('id', $row->id)->update([
                        'actor_role' => $row->actor_role ?: $role,
                        'actor_type' => $type,
                        'module' => $row->module ?: $row->entity_type,
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropIndex('activity_logs_community_created_idx');
            $table->dropIndex('activity_logs_actor_created_idx');
            $table->dropIndex('activity_logs_subject_created_idx');
            $table->dropIndex('activity_logs_role_created_idx');
            $table->dropIndex('activity_logs_action_created_idx');
            $table->dropIndex('activity_logs_module_created_idx');
            $table->dropColumn([
                'actor_user_id',
                'actor_role',
                'actor_type',
                'subject_user_id',
                'community_id',
                'module',
                'status',
                'request_id',
            ]);
        });
    }
};
