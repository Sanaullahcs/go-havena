<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            $table->string('review_status', 20)->default('approved')->after('status');
            $table->boolean('is_global')->default(false)->after('review_status');
            $table->unsignedBigInteger('approved_by')->nullable()->after('is_global');
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->string('rejection_reason', 500)->nullable()->after('approved_at');

            $table->foreign('approved_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['community_id', 'review_status', 'status']);
            $table->index(['category', 'review_status']);
            $table->index('is_global');
        });

        DB::table('notices')->update(['review_status' => 'approved']);
    }

    public function down(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropIndex(['community_id', 'review_status', 'status']);
            $table->dropIndex(['category', 'review_status']);
            $table->dropIndex(['is_global']);
            $table->dropColumn([
                'review_status',
                'is_global',
                'approved_by',
                'approved_at',
                'rejection_reason',
            ]);
        });
    }
};
