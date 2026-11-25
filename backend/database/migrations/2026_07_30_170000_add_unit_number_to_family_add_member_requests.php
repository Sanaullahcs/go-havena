<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('family_add_member_requests', function (Blueprint $table) {
            $table->string('unit_number', 50)->nullable()->after('age');
        });
    }

    public function down(): void
    {
        Schema::table('family_add_member_requests', function (Blueprint $table) {
            $table->dropColumn('unit_number');
        });
    }
};
