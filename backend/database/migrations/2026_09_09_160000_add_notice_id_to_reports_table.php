<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('reports') || Schema::hasColumn('reports', 'notice_id')) {
            return;
        }

        Schema::table('reports', function (Blueprint $table) {
            $table->foreignId('notice_id')
                ->nullable()
                ->after('listing_id')
                ->constrained('notices')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('reports') || ! Schema::hasColumn('reports', 'notice_id')) {
            return;
        }

        Schema::table('reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('notice_id');
        });
    }
};
