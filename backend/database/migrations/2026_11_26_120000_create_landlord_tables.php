<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('unit_ownerships')) {
            Schema::create('unit_ownerships', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('community_id');
                $table->unsignedBigInteger('unit_id');
                $table->unsignedBigInteger('user_id');
                $table->string('status', 20)->default('pending'); // pending | approved | rejected | left
                $table->string('occupancy', 20); // live_here | rented | vacant
                $table->string('source', 32)->nullable(); // signup | become_landlord | admin
                $table->unsignedBigInteger('reviewed_by')->nullable();
                $table->timestamp('reviewed_at')->nullable();
                $table->text('rejection_reason')->nullable();
                $table->timestamps();

                $table->unique(['unit_id', 'user_id'], 'unit_ownerships_unit_user_unique');
                $table->index(['user_id', 'community_id', 'status']);
                $table->index(['community_id', 'status']);
                $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
                $table->foreign('unit_id')->references('id')->on('units')->cascadeOnDelete();
                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('user_community_landlord_profiles')) {
            Schema::create('user_community_landlord_profiles', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id');
                $table->unsignedBigInteger('community_id');
                $table->boolean('landlord_enabled')->default(false);
                $table->unsignedBigInteger('primary_residence_unit_id')->nullable();
                $table->timestamps();

                $table->unique(['user_id', 'community_id'], 'landlord_profiles_user_community_unique');
                $table->foreign('user_id', 'landlord_profiles_user_fk')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('community_id', 'landlord_profiles_community_fk')->references('id')->on('communities')->cascadeOnDelete();
                $table->foreign('primary_residence_unit_id', 'landlord_profiles_primary_unit_fk')
                    ->references('id')->on('units')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('landlord_membership_reviews')) {
            Schema::create('landlord_membership_reviews', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('community_id');
                $table->unsignedBigInteger('unit_id');
                $table->unsignedBigInteger('subject_user_id');
                $table->unsignedBigInteger('landlord_user_id');
                $table->unsignedBigInteger('unit_resident_id')->nullable();
                $table->string('status', 20)->default('pending'); // pending | approved | rejected
                $table->unsignedBigInteger('reviewed_by')->nullable();
                $table->timestamp('reviewed_at')->nullable();
                $table->text('rejection_reason')->nullable();
                $table->timestamps();

                $table->index(['unit_id', 'status'], 'lm_reviews_unit_status_idx');
                $table->index(['landlord_user_id', 'community_id'], 'lm_reviews_landlord_comm_idx');
                $table->foreign('community_id', 'lm_reviews_community_fk')->references('id')->on('communities')->cascadeOnDelete();
                $table->foreign('unit_id', 'lm_reviews_unit_fk')->references('id')->on('units')->cascadeOnDelete();
                $table->foreign('subject_user_id', 'lm_reviews_subject_fk')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('landlord_user_id', 'lm_reviews_landlord_fk')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('unit_resident_id', 'lm_reviews_unit_resident_fk')->references('id')->on('unit_residents')->nullOnDelete();
                $table->foreign('reviewed_by', 'lm_reviews_reviewer_fk')->references('id')->on('users')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('landlord_membership_reviews');
        Schema::dropIfExists('user_community_landlord_profiles');
        Schema::dropIfExists('unit_ownerships');
    }
};