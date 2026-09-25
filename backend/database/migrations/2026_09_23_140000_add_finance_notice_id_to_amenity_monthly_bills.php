<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('amenity_monthly_bills', function (Blueprint $table) {
            $table->foreignId('finance_notice_id')
                ->nullable()
                ->after('published_at')
                ->constrained('notices')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('amenity_monthly_bills', function (Blueprint $table) {
            $table->dropConstrainedForeignId('finance_notice_id');
        });
    }
};
