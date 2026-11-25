<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('community_feature_disable_requests', function (Blueprint $table) {
            $table->string('action', 16)->default('disable')->after('feature_key');
        });
    }

    public function down(): void
    {
        Schema::table('community_feature_disable_requests', function (Blueprint $table) {
            $table->dropColumn('action');
        });
    }
};
