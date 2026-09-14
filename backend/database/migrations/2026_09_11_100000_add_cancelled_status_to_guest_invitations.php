<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE guest_invitations MODIFY COLUMN status ENUM(
            'pending_verification',
            'pending_approval',
            'active',
            'rejected',
            'expired',
            'revoked',
            'cancelled'
        ) NOT NULL DEFAULT 'pending_verification'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE guest_invitations MODIFY COLUMN status ENUM(
            'pending_verification',
            'pending_approval',
            'active',
            'rejected',
            'expired',
            'revoked'
        ) NOT NULL DEFAULT 'pending_verification'");
    }
};
