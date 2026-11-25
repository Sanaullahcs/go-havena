<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payment_cases')) {
            Schema::create('payment_cases', function (Blueprint $table) {
                $table->id();
                $table->uuid('public_id')->unique();
                $table->unsignedBigInteger('community_id')->index();
                $table->unsignedBigInteger('payment_attempt_id')->nullable()->index();
                $table->string('payable_type', 40)->nullable();
                $table->unsignedBigInteger('payable_id')->nullable();
                $table->string('kind', 32);
                $table->string('status', 32)->default('open');
                $table->string('reason', 120);
                $table->text('details')->nullable();
                $table->unsignedInteger('amount_paisa')->nullable();
                $table->unsignedBigInteger('opened_by')->nullable();
                $table->unsignedBigInteger('reviewed_by')->nullable();
                $table->text('resolution_note')->nullable();
                $table->boolean('reopened_bill')->default(false);
                $table->timestamp('resolved_at')->nullable();
                $table->timestamps();

                $table->index(['community_id', 'status']);
            });
        }

        foreach ([
            'unit_service_bills',
            'unit_service_bill_reviews',
            'amenity_resident_bills',
            'amenity_resident_bill_reviews',
        ] as $table) {
            if (Schema::hasTable($table) && ! Schema::hasColumn($table, 'payment_bank')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->string('payment_bank', 80)->nullable();
                });
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_cases');

        foreach ([
            'unit_service_bills',
            'unit_service_bill_reviews',
            'amenity_resident_bills',
            'amenity_resident_bill_reviews',
        ] as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'payment_bank')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->dropColumn('payment_bank');
                });
            }
        }
    }
};
