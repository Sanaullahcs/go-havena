<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::statement(
            'UPDATE deals d
             INNER JOIN businesses b
               ON b.owner_id = d.created_by
              AND b.community_id = d.community_id
              AND b.deleted_at IS NULL
             SET d.business_id = b.id, d.updated_at = ?
             WHERE d.business_id IS NULL
               AND d.deleted_at IS NULL',
            [$now]
        );

        DB::statement(
            'UPDATE deals d
             INNER JOIN businesses b
               ON (
                 d.business_id = b.id
                 OR (
                   d.business_id IS NULL
                   AND b.owner_id = d.created_by
                   AND b.community_id = d.community_id
                 )
               )
              AND b.deleted_at IS NULL
             SET d.status = ?, d.updated_at = ?
             WHERE b.status = ?
               AND d.status = ?
               AND d.deleted_at IS NULL
               AND (d.ends_at IS NULL OR d.ends_at >= ?)',
            ['active', $now, 'approved', 'inactive', $now]
        );
    }

    public function down(): void
    {
        // Data repair only — no rollback.
    }
};
