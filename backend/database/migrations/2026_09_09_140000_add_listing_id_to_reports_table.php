<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('reports') || Schema::hasColumn('reports', 'listing_id')) {
            return;
        }

        Schema::table('reports', function (Blueprint $table) {
            $table->foreignId('listing_id')
                ->nullable()
                ->after('reported_user_id')
                ->constrained('listings')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('reports') || ! Schema::hasColumn('reports', 'listing_id')) {
            return;
        }

        Schema::table('reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('listing_id');
        });
    }
};
