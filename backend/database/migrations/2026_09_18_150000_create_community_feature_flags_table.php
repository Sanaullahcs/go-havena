<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('communities', function (Blueprint $table) {
            $table->timestamp('resident_features_configured_at')->nullable()->after('reviewed_at');
        });

        Schema::create('community_feature_flags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->string('feature_key', 64);
            $table->boolean('enabled')->default(true);
            $table->foreignId('updated_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['community_id', 'feature_key']);
            $table->index(['community_id', 'enabled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('community_feature_flags');

        Schema::table('communities', function (Blueprint $table) {
            $table->dropColumn('resident_features_configured_at');
        });
    }
};
