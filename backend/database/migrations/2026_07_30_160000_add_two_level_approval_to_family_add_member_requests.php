<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('family_add_member_requests', function (Blueprint $table) {
            $table->foreignId('candidate_user_id')
                ->nullable()
                ->after('requested_by_user_id')
                ->constrained('users')
                ->nullOnDelete();
            $table->foreignId('family_join_request_id')
                ->nullable()
                ->after('candidate_user_id')
                ->constrained('family_join_requests')
                ->nullOnDelete();
            $table->foreignId('admin_reviewed_by_user_id')
                ->nullable()
                ->after('reviewed_at')
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamp('admin_reviewed_at')->nullable()->after('admin_reviewed_by_user_id');
            $table->string('admin_rejection_reason', 500)->nullable()->after('admin_reviewed_at');
        });

        // Expand enum before rewriting existing rows.
        DB::statement("ALTER TABLE family_add_member_requests MODIFY COLUMN status ENUM('pending', 'pending_admin', 'awaiting_head', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending_admin'");

        DB::table('family_add_member_requests')
            ->where('status', 'pending')
            ->update(['status' => 'pending_admin']);
    }

    public function down(): void
    {
        DB::table('family_add_member_requests')
            ->whereIn('status', ['pending_admin', 'awaiting_head'])
            ->update(['status' => 'pending']);

        DB::statement("ALTER TABLE family_add_member_requests MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending'");

        Schema::table('family_add_member_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('candidate_user_id');
            $table->dropConstrainedForeignId('family_join_request_id');
            $table->dropConstrainedForeignId('admin_reviewed_by_user_id');
            $table->dropColumn(['admin_reviewed_at', 'admin_rejection_reason']);
        });
    }
};
