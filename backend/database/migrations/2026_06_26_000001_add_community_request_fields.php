<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('communities', function (Blueprint $table) {
            $table->foreignId('region_id')
                ->nullable()
                ->after('region')
                ->constrained('regions')
                ->nullOnDelete();
            $table->string('address', 255)->nullable()->after('description');
            $table->foreignId('requested_by_user_id')
                ->nullable()
                ->after('address')
                ->constrained('users')
                ->nullOnDelete();
            $table->enum('review_status', ['pending', 'approved', 'rejected'])
                ->nullable()
                ->after('status');
            $table->text('rejection_reason')->nullable()->after('review_status');
            $table->timestamp('reviewed_at')->nullable()->after('rejection_reason');
        });

        \Illuminate\Support\Facades\DB::table('communities')
            ->whereNull('review_status')
            ->where('status', 'active')
            ->update(['review_status' => 'approved']);
    }

    public function down(): void
    {
        Schema::table('communities', function (Blueprint $table) {
            $table->dropConstrainedForeignId('region_id');
            $table->dropConstrainedForeignId('requested_by_user_id');
            $table->dropColumn(['address', 'review_status', 'rejection_reason', 'reviewed_at']);
        });
    }
};
