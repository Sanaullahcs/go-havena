<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('post_reports')) {
            return;
        }

        Schema::table('post_reports', function (Blueprint $table) {
            if (! Schema::hasColumn('post_reports', 'status')) {
                $table->string('status', 32)->default('pending_review')->after('type');
            }
            if (! Schema::hasColumn('post_reports', 'resolution')) {
                $table->string('resolution', 32)->nullable()->after('status');
            }
            if (! Schema::hasColumn('post_reports', 'review_queue')) {
                $table->string('review_queue', 32)->default('community_admin')->after('resolution');
            }
            if (! Schema::hasColumn('post_reports', 'resolved_by')) {
                $table->unsignedBigInteger('resolved_by')->nullable()->after('review_queue');
            }
            if (! Schema::hasColumn('post_reports', 'resolved_at')) {
                $table->timestamp('resolved_at')->nullable()->after('resolved_by');
            }
        });

        if (Schema::hasColumn('post_reports', 'source') && Schema::hasColumn('post_reports', 'status')) {
            DB::table('post_reports')
                ->where('source', 'admin')
                ->update([
                    'status'     => 'resolved',
                    'resolution' => 'marked_sensitive',
                ]);
        }

        if (Schema::hasColumn('post_reports', 'review_queue') && Schema::hasTable('posts') && Schema::hasTable('users')) {
            $routedPostIds = DB::table('posts')
                ->join('users', 'users.id', '=', 'posts.user_id')
                ->whereIn('users.role', ['community_admin', 'system_admin', 'admin'])
                ->pluck('posts.id');

            if ($routedPostIds->isNotEmpty()) {
                DB::table('post_reports')
                    ->whereIn('post_id', $routedPostIds)
                    ->update(['review_queue' => 'system_admin']);
            }
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('post_reports')) {
            return;
        }

        Schema::table('post_reports', function (Blueprint $table) {
            foreach (['resolved_at', 'resolved_by', 'review_queue', 'resolution', 'status'] as $column) {
                if (Schema::hasColumn('post_reports', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
