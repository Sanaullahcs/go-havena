<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Multi-unit-per-resident (single community):
 * - Registration packages for self-signup initial + add-on unit requests
 * - Per-unit proof documents (utility + ownership/tenancy)
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('unit_registration_packages')) {
            Schema::create('unit_registration_packages', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('community_id');
                $table->unsignedBigInteger('user_id');
                $table->string('kind', 32); // initial | addon
                $table->string('status', 32)->default('pending'); // pending | approved | rejected
                $table->text('rejection_reason')->nullable();
                $table->unsignedBigInteger('reviewed_by')->nullable();
                $table->timestamp('reviewed_at')->nullable();
                $table->timestamps();

                $table->index(['community_id', 'status']);
                $table->index(['user_id', 'status']);
                $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('unit_registration_package_items')) {
            Schema::create('unit_registration_package_items', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('package_id');
                $table->unsignedBigInteger('unit_id')->nullable();
                $table->string('unit_number', 50);
                $table->string('unit_number_normalized', 50);
                $table->boolean('is_new_unit')->default(false);
                $table->string('residence_type', 50)->nullable(); // homeowner | tenant
                $table->string('status', 32)->default('pending'); // pending | approved | rejected
                $table->unsignedBigInteger('unit_resident_id')->nullable();
                $table->timestamps();

                $table->index(['package_id', 'status']);
                $table->foreign('package_id')->references('id')->on('unit_registration_packages')->cascadeOnDelete();
                $table->foreign('unit_id')->references('id')->on('units')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('unit_proof_documents')) {
            Schema::create('unit_proof_documents', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('community_id');
                $table->unsignedBigInteger('user_id');
                $table->unsignedBigInteger('unit_id')->nullable();
                $table->unsignedBigInteger('package_item_id')->nullable();
                $table->string('kind', 40); // utility_bill | ownership_proof | tenancy_proof
                $table->string('file_url', 1024);
                $table->string('review_status', 32)->nullable(); // pending | approved | rejected
                $table->timestamps();

                $table->index(['user_id', 'community_id']);
                $table->index(['unit_id', 'kind']);
                $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('unit_id')->references('id')->on('units')->nullOnDelete();
                $table->foreign('package_item_id')->references('id')->on('unit_registration_package_items')->nullOnDelete();
            });
        }

        if (Schema::hasTable('unit_residents') && ! Schema::hasColumn('unit_residents', 'rejection_reason')) {
            Schema::table('unit_residents', function (Blueprint $table) {
                $table->text('rejection_reason')->nullable()->after('left_at');
                $table->string('source', 32)->nullable()->after('rejection_reason'); // invite | package | admin | sync
            });
        }

        // Admin-invited multi-unit rows applied when membership syncs / onboarding completes.
        if (! Schema::hasTable('invite_unit_assignments')) {
            Schema::create('invite_unit_assignments', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('community_id');
                $table->unsignedBigInteger('user_id');
                $table->string('unit_number', 50);
                $table->string('unit_number_normalized', 50);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();

                $table->unique(['community_id', 'user_id', 'unit_number_normalized'], 'invite_units_unique');
                $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('invite_unit_assignments');
        Schema::dropIfExists('unit_proof_documents');
        Schema::dropIfExists('unit_registration_package_items');
        Schema::dropIfExists('unit_registration_packages');

        if (Schema::hasTable('unit_residents') && Schema::hasColumn('unit_residents', 'rejection_reason')) {
            Schema::table('unit_residents', function (Blueprint $table) {
                $table->dropColumn(['rejection_reason', 'source']);
            });
        }
    }
};
