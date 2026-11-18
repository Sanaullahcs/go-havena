<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('community_staff', function (Blueprint $table) {
            $table->string('invitation_delivery_error', 255)->nullable()->after('invited_at');
        });
    }

    public function down(): void
    {
        Schema::table('community_staff', function (Blueprint $table) {
            $table->dropColumn('invitation_delivery_error');
        });
    }
};
