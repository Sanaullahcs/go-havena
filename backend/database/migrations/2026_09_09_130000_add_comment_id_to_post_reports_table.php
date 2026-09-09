<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('post_reports')) {
            return;
        }

        Schema::table('post_reports', function (Blueprint $table) {
            if (! Schema::hasColumn('post_reports', 'comment_id')) {
                $table->unsignedBigInteger('comment_id')->nullable()->after('post_id');
                $table->index(['comment_id', 'reporter_id']);
            }
            if (! Schema::hasColumn('post_reports', 'reported_user_id')) {
                $table->unsignedBigInteger('reported_user_id')->nullable()->after('reporter_id');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('post_reports')) {
            return;
        }

        Schema::table('post_reports', function (Blueprint $table) {
            if (Schema::hasColumn('post_reports', 'comment_id')) {
                $table->dropIndex(['comment_id', 'reporter_id']);
                $table->dropColumn('comment_id');
            }
            if (Schema::hasColumn('post_reports', 'reported_user_id')) {
                $table->dropColumn('reported_user_id');
            }
        });
    }
};
