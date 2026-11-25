<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            if (! Schema::hasColumn('conversations', 'listing_id')) {
                $table->foreignId('listing_id')->nullable()->after('title')->constrained('listings')->nullOnDelete();
            }
        });

        // Extend message types to support marketplace offers.
        if (Schema::hasTable('messages')) {
            DB::statement("ALTER TABLE messages MODIFY COLUMN type ENUM('text', 'image', 'file', 'system', 'offer') NOT NULL DEFAULT 'text'");
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('messages')) {
            DB::statement("ALTER TABLE messages MODIFY COLUMN type ENUM('text', 'image', 'file', 'system') NOT NULL DEFAULT 'text'");
        }

        Schema::table('conversations', function (Blueprint $table) {
            if (Schema::hasColumn('conversations', 'listing_id')) {
                $table->dropConstrainedForeignId('listing_id');
            }
        });
    }
};
